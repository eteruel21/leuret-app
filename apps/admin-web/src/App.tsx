import type { FormEvent } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Briefcase, Loader2, Lock, Mail, RefreshCw } from "lucide-react";

import {
  adjustPrices,
  type AdminData,
  type CatalogItem,
  type Category,
  type Formula,
  type GlobalCatalogItem,
  type ItemType,
  loadAdminData,
  loadUserProfile,
  loadUserProfileDocument,
  type UserProfileDetail,
  type ContractorDocumentType,
  type PlatformUser,
  saveCategory,
  saveFormula,
  saveGlobalCatalogPricing,
  saveItem,
  saveUnit,
  saveUser,
  saveYield,
  type Unit,
  type CatalogYield,
  type UserDraft,
  type CategoryDraft,
  type ItemDraft,
  type GlobalCatalogItemDraft,
  type UnitDraft,
  type YieldDraft,
  type FormulaDraft,
} from "./admin-data";
import {
  type AdminSession,
  loginAdmin,
  logoutAdmin,
  restoreAdminSession,
} from "./api";
import TurnstileChallenge from "./TurnstileChallenge";
import { errorMessage } from "./utils/helpers";
import {
  FullScreenLoader,
  AlertBanner,
  SuccessBanner,
  Field,
} from "./components/CommonUI";
import { Sidebar, type Tab } from "./components/Sidebar";
import { DashboardTab } from "./components/DashboardTab";
import { UsersTab } from "./components/UsersTab";
import { CatalogTab } from "./components/CatalogTab";
import { CalculationsTab } from "./components/CalculationsTab";
import { PricingTab } from "./components/PricingTab";
import { SystemTab } from "./components/SystemTab";
import { EditorModal, type Editor } from "./components/EditorModal";
import { UserProfileModal } from "./components/UserProfileModal";
import { CompaniesTab } from "./components/CompaniesTab";
import { MailTab } from "./components/MailTab";
import { ProjectsTab } from "./components/ops/ProjectsTab";
import { BudgetsTab } from "./components/ops/BudgetsTab";
import { InvoicesTab } from "./components/ops/InvoicesTab";
import { ClientsTab } from "./components/ops/ClientsTab";
import { AuditTab } from "./components/ops/AuditTab";
import { OverviewPanel } from "./components/ops/OverviewPanel";
import { CommandPalette } from "./components/ops/CommandPalette";
import { UserSessionsPanel } from "./components/ops/UserSessionsPanel";
import { isTab, readHash, writeHash, type NavTarget } from "./components/ops/navigation";

const EMPTY_DATA: AdminData = {
  users: [],
  companies: [],
  categories: [],
  items: [],
  globalItems: [],
  units: [],
  yields: [],
  formulas: [],
  projectCount: 0,
  clientCount: 0,
  priceHistoryCount: 0,
  warnings: [],
  stats: {
    totalUsers: 0,
    activeUsers: 0,
    totalCompanies: 0,
    totalProjects: 0,
    totalClients: 0,
    totalCategories: 0,
    totalItems: 0,
    totalGlobalItems: 0,
    totalUnits: 0,
    totalYields: 0,
    totalFormulas: 0,
    priceHistoryCount: 0
  }
};

function userDraft(user: PlatformUser): UserDraft {
  return {
    id: user.id,
    fullName: user.fullName,
    phone: user.phone,
    role: user.role,
    active: user.active,
    approvedAt: user.approvedAt,
    approvedBy: user.approvedBy,
  };
}

function categoryDraft(category: Category): CategoryDraft {
  const { companyName: _companyName, ...draft } = category;
  return draft;
}

function itemDraft(item: CatalogItem): ItemDraft {
  const {
    companyName: _companyName,
    categoryName: _categoryName,
    unitSymbol: _unitSymbol,
    ...draft
  } = item;
  return draft;
}

function globalCatalogItemDraft(item: GlobalCatalogItem): GlobalCatalogItemDraft {
  return {
    id: item.id,
    unitCost: item.unitCost,
    salePrice: item.salePrice,
    wastePercentage: item.wastePercentage,
  };
}

function unitDraft(unit: Unit): UnitDraft {
  const { companyName: _companyName, ...draft } = unit;
  return draft;
}

function yieldDraft(catalogYield: CatalogYield): YieldDraft {
  const {
    companyName: _companyName,
    catalogItemName: _catalogItemName,
    outputUnitSymbol: _outputUnitSymbol,
    ...draft
  } = catalogYield;
  return draft;
}

function formulaDraft(formula: Formula): FormulaDraft {
  const { companyName: _companyName, ...draft } = formula;
  return {
    ...draft,
    parameters: draft.parameters.map((parameter) => ({ ...parameter })),
  };
}

export default function App() {
  const [session, setSession] = useState<AdminSession | null>(null);
  const [sessionLoading, setSessionLoading] = useState(true);

  const isAuthorized = Boolean(
    session?.user.active && session.user.role === "super_admin"
  );
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [captchaResetKey, setCaptchaResetKey] = useState(0);

  // Navegación: la pestaña y el registro abierto viven en el hash (#/obras?id=...)
  // para que el botón «atrás» funcione y cada vista se pueda compartir.
  const [nav, setNav] = useState<NavTarget & { key: number }>(() => {
    const fromHash = typeof window !== "undefined" ? readHash(window.location.hash) : null;
    if (fromHash) return { ...fromHash, key: 0 };
    const saved = localStorage.getItem("admin_active_tab");
    return { tab: isTab(saved) ? saved : "dashboard", key: 0 };
  });
  const activeTab = nav.tab;
  const [paletteOpen, setPaletteOpen] = useState(false);

  const navigate = useCallback((target: NavTarget) => {
    setNav((current) => ({ ...target, key: current.key + 1 }));
    const nextHash = writeHash(target);
    if (window.location.hash !== nextHash) {
      window.history.pushState(null, "", nextHash);
    }
  }, []);

  const setActiveTab = useCallback((tab: Tab) => navigate({ tab }), [navigate]);

  useEffect(() => {
    localStorage.setItem("admin_active_tab", activeTab);
  }, [activeTab]);

  useEffect(() => {
    const onPop = () => {
      const target = readHash(window.location.hash);
      if (target) setNav((current) => ({ ...target, key: current.key + 1 }));
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setPaletteOpen((open) => !open);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const [data, setData] = useState<AdminData>(EMPTY_DATA);
  const [loadingData, setLoadingData] = useState(false);
  const [dataError, setDataError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [editor, setEditor] = useState<Editor | null>(null);
  const [saving, setSaving] = useState(false);

  const [
    reviewUser,
    setReviewUser
  ] = useState<PlatformUser | null>(null);

  const [
    contractorReview,
    setContractorReview
  ] = useState<UserProfileDetail | null>(null);

  const [
    reviewLoading,
    setReviewLoading
  ] = useState(false);

  const [
    reviewError,
    setReviewError
  ] = useState<string | null>(null);

  const [
    documentLoading,
    setDocumentLoading
  ] = useState<ContractorDocumentType | null>(
    null
  );

  const [priceType, setPriceType] = useState<ItemType | "all">("all");
  const [priceTarget, setPriceTarget] = useState<"unit_cost" | "sale_price">("sale_price");
  const [pricePercentage, setPricePercentage] = useState("5");
  const [priceNotes, setPriceNotes] = useState("");
  const [adjustingPrices, setAdjustingPrices] = useState(false);

  useEffect(() => {
    let active = true;

    async function restoreSession() {
      try {
        const nextSession = await restoreAdminSession();

        if (!active) return;

        setSession(nextSession);
        setAuthError(null);
      } catch (error) {
        if (!active) return;

        setSession(null);
        setAuthError(errorMessage(error));
      } finally {
        if (active) {
          setSessionLoading(false);
        }
      }
    }

    void restoreSession();

    return () => {
      active = false;
    };
  }, []);

  const loadData = useCallback(async () => {
    if (!isAuthorized) return;
    setLoadingData(true);
    setDataError(null);
    try {
      const nextData = await loadAdminData();
      setData(nextData);
      setDataError(
        nextData.warnings.length > 0 ? nextData.warnings.join(" ") : null
      );
    } catch (error) {
      setDataError(errorMessage(error));
    } finally {
      setLoadingData(false);
    }
  }, [isAuthorized]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const pendingUsers = useMemo(
    () => data.users.filter((user) => !user.active && !user.approvedAt),
    [data.users]
  );
  const normalizedSearch = search.trim().toLowerCase();
  const visibleUsers = data.users.filter((user) =>
    [user.fullName, user.phone, user.companyName, user.role]
      .join(" ")
      .toLowerCase()
      .includes(normalizedSearch)
  );
  const visibleItems = data.items.filter((item) =>
    [item.sku, item.name, item.categoryName, item.companyName]
      .join(" ")
      .toLowerCase()
      .includes(normalizedSearch)
  );

  async function handleLogin(event: FormEvent) {
    event.preventDefault();

    if (!captchaToken) {
      setAuthError("Completa la verificación de seguridad antes de iniciar sesión.");
      return;
    }

    const currentCaptchaToken = captchaToken;
    setCaptchaToken(null);
    setCaptchaResetKey((current) => current + 1);
    setAuthLoading(true);
    setAuthError(null);

    try {
      const nextSession = await loginAdmin(email, password, currentCaptchaToken);
      setSession(nextSession);
      setPassword("");
    } catch (error) {
      setSession(null);
      setAuthError(errorMessage(error));
    } finally {
      setAuthLoading(false);
    }
  }

  async function handleSignOut() {
    try {
      await logoutAdmin();
    } finally {
      setSession(null);
      setData(EMPTY_DATA);
    }
  }

  function showSuccess(message: string) {
    setSuccess(message);
    window.setTimeout(() => setSuccess(null), 3500);
  }

  async function openContractorReview(
    user: PlatformUser
  ) {
    setReviewUser(user);
    setContractorReview(null);
    setReviewError(null);
    setReviewLoading(true);

    try {
      const review =
        await loadUserProfile(
          user.id
        );

      setContractorReview(review);
    } catch (error) {
      setReviewError(
        errorMessage(error)
      );
    } finally {
      setReviewLoading(false);
    }
  }

  function openUserById(userId: string) {
    const user = data.users.find((value) => value.id === userId);
    void openContractorReview(
      user ?? {
        id: userId,
        fullName: "Usuario",
        phone: "",
        role: "contractor",
        active: false,
        approvedAt: null,
        approvedBy: null,
        createdAt: "",
        companyName: "",
      }
    );
  }

  function closeContractorReview() {
    setReviewUser(null);
    setContractorReview(null);
    setReviewError(null);
    setDocumentLoading(null);
  }

  async function openContractorDocument(
    documentType: ContractorDocumentType
  ) {
    if (!reviewUser) return;

    const previewWindow =
      window.open(
        "about:blank",
        "_blank"
      );

    if (previewWindow) {
      previewWindow.opener = null;
    }

    setDocumentLoading(documentType);
    setReviewError(null);

    try {
      const document =
        await loadUserProfileDocument(
          reviewUser.id,
          documentType
        );

      const binary =
        window.atob(document.base64);

      const bytes =
        new Uint8Array(
          binary.length
        );

      for (
        let index = 0;
        index < binary.length;
        index += 1
      ) {
        bytes[index] =
          binary.charCodeAt(index);
      }

      const blob =
        new Blob(
          [bytes],
          {
            type:
              document.mimeType ||
              "application/octet-stream"
          }
        );

      const url =
        URL.createObjectURL(blob);

      if (previewWindow) {
        previewWindow.location.href =
          url;
      } else {
        const link =
          window.document.createElement(
            "a"
          );

        link.href = url;
        link.download =
          document.fileName;

        window.document.body.appendChild(
          link
        );

        link.click();
        link.remove();
      }

      window.setTimeout(
        () => URL.revokeObjectURL(url),
        60000
      );
    } catch (error) {
      previewWindow?.close();

      setReviewError(
        errorMessage(error)
      );
    } finally {
      setDocumentLoading(null);
    }
  }

  async function approveContractorFromReview() {
    if (
      !reviewUser ||
      !session?.user
    ) {
      return;
    }

    setSaving(true);
    setReviewError(null);

    try {
      await saveUser(
        {
          ...userDraft(reviewUser),
          active: true
        },
        session.user.id
      );

      closeContractorReview();

      showSuccess(
        "Contratista aprobado correctamente."
      );

      await loadData();
    } catch (error) {
      setReviewError(
        errorMessage(error)
      );
    } finally {
      setSaving(false);
    }
  }
  async function toggleUser(user: PlatformUser) {
    if (!session?.user || user.id === session.user.id) return;
    setSaving(true);
    setDataError(null);
    try {
      await saveUser({ ...userDraft(user), active: !user.active }, session.user.id);
      showSuccess(user.active ? "Usuario suspendido." : "Usuario aprobado.");
      await loadData();
    } catch (error) {
      setDataError(errorMessage(error));
    } finally {
      setSaving(false);
    }
  }

  async function submitEditor() {
    if (!editor || !session?.user) return;
    setSaving(true);
    setDataError(null);
    try {
      if (editor.kind === "user") await saveUser(editor.draft, session.user.id);
      else if (editor.kind === "category") await saveCategory(editor.draft);
      else if (editor.kind === "item") await saveItem(editor.draft);
      else if (editor.kind === "globalPrice") {
        await saveGlobalCatalogPricing(editor.draft);
      } else if (editor.kind === "unit") await saveUnit(editor.draft);
      else if (editor.kind === "yield") await saveYield(editor.draft);
      else await saveFormula(editor.draft);
      setEditor(null);
      showSuccess("Cambios guardados correctamente.");
      await loadData();
    } catch (error) {
      setDataError(errorMessage(error));
    } finally {
      setSaving(false);
    }
  }

  async function handlePriceAdjustment(event: FormEvent) {
    event.preventDefault();
    const percentage = Number(pricePercentage.replace(",", "."));
    const itemIds = data.globalItems
      .filter(
        (item) => item.active && (priceType === "all" || item.itemType === priceType)
      )
      .map((item) => item.id);
    if (!Number.isFinite(percentage) || percentage <= -100 || itemIds.length === 0) {
      setDataError("Revisa el tipo, el porcentaje y los elementos activos.");
      return;
    }
    setAdjustingPrices(true);
    setDataError(null);
    try {
      await adjustPrices({
        itemIds,
        target: priceTarget,
        percentage,
        notes: priceNotes,
      });
      showSuccess(`Se actualizaron ${itemIds.length} precios.`);
      setPriceNotes("");
      await loadData();
    } catch (error) {
      setDataError(errorMessage(error));
    } finally {
      setAdjustingPrices(false);
    }
  }

  function newCategory() {
    setEditor({
      kind: "category",
      draft: {
        id: "",
        companyId: data.companies[0]?.id ?? "",
        name: "",
        description: "",
        active: true,
      },
    });
  }

  function newItem() {
    const companyId = data.companies[0]?.id ?? "";
    setEditor({
      kind: "item",
      draft: {
        id: "",
        companyId,
        sku: "",
        name: "",
        description: "",
        itemType: "material",
        categoryId: data.categories.find((value) => value.companyId === companyId)?.id ?? null,
        unitId: data.units.find((value) => value.companyId === companyId)?.id ?? "",
        unitCost: 0,
        salePrice: 0,
        wastePercentage: 0,
        active: true,
      },
    });
  }

  function newUnit() {
    setEditor({
      kind: "unit",
      draft: {
        id: "",
        companyId: data.companies[0]?.id ?? "",
        code: "",
        name: "",
        symbol: "",
        unitType: "unit",
        conversionFactor: 1,
        active: true,
      },
    });
  }

  function newYield() {
    const companyId = data.companies[0]?.id ?? "";
    setEditor({
      kind: "yield",
      draft: {
        id: "",
        companyId,
        catalogItemId: data.items.find((value) => value.companyId === companyId)?.id ?? "",
        outputUnitId: data.units.find((value) => value.companyId === companyId)?.id ?? "",
        name: "",
        outputQuantity: 1,
        laborHours: 0,
        crewSize: 1,
        wastePercentage: 0,
        notes: "",
        active: true,
      },
    });
  }

  function newFormula() {
    setEditor({
      kind: "formula",
      draft: {
        id: "",
        companyId: data.companies[0]?.id ?? "",
        code: "",
        name: "",
        description: "",
        active: true,
        parameters: [],
      },
    });
  }

  if (sessionLoading) {
    return <FullScreenLoader label="Verificando acceso administrativo..." />;
  }

  if (!session || !isAuthorized) {
    return (
      <div className="login-container">
        <form className="login-card" onSubmit={handleLogin}>
          <div className="login-brand">
            <Briefcase size={42} />
            <h1>Leuret</h1>
            <p>Panel central de Super Admin</p>
          </div>
          {authError && <AlertBanner message={authError} />}
          <Field label="Correo electrónico">
            <div className="icon-input">
              <Mail size={18} />
              <input
                type="email"
                name="email"
                autoComplete="username"
                required
                value={email}
                onChange={(event) => setEmail(event.target.value)}
              />
            </div>
          </Field>
          <Field label="Contraseña">
            <div className="icon-input">
              <Lock size={18} />
              <input
                type="password"
                name="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
            </div>
          </Field>
          <TurnstileChallenge onToken={setCaptchaToken} resetKey={captchaResetKey} />
          <button className="button button-primary button-block" disabled={authLoading || !captchaToken}>
            {authLoading ? <Loader2 className="spin" size={18} /> : <Lock size={18} />}
            Ingresar
          </button>
        </form>
      </div>
    );
  }

  const titles: Record<Tab, [string, string]> = {
    dashboard: ["Resumen de plataforma", "Usuarios, proyectos y configuración central."],
    mail: ["Correos", "Lee y responde correos de Privacidad y Asuntos Legales."],
    users: ["Usuarios", "Aprueba registros y edita cada perfil."],
    companies: ["Empresas", "Equipos, obras y actividad de cada empresa registrada."],
    projects: ["Obras", "Avance, tareas, presupuestos y facturas de cada obra."],
    budgets: ["Presupuestos", "Todos los presupuestos, partidas, versiones y su estado."],
    invoices: ["Facturación", "Facturas, pagos, saldos y notas de crédito de la plataforma."],
    clients: ["Clientes", "Clientes registrados por las empresas y su actividad."],
    audit: ["Auditoría", "Quién hizo qué y cuándo en el panel y en las empresas."],
    catalog: ["Catálogo", "Categorías, materiales, mano de obra y servicios."],
    calculations: ["Cálculos", "Fórmulas, parámetros, unidades y rendimientos."],
    pricing: ["Precios globales", "Valores predeterminados para todos los usuarios."],
    system: ["Sistema", "Estado de la conexión y sesión administrativa."],
  };

  return (
    <div className="dashboard-container">
      <Sidebar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        pendingUsersCount={pendingUsers.length}
        email={session.user.email}
        onSignOut={handleSignOut}
        onOpenSearch={() => setPaletteOpen(true)}
      />

      <main className="main-content">
        <header className="header">
          <div className="title-container">
            <h1>{titles[activeTab][0]}</h1>
            <p>{titles[activeTab][1]}</p>
          </div>
          {activeTab !== "mail" && <button className="button button-secondary" onClick={() => void loadData()} disabled={loadingData}>
            <RefreshCw className={loadingData ? "spin" : ""} size={17} /> Actualizar
          </button>}
        </header>

        {dataError && <AlertBanner message={dataError} onClose={() => setDataError(null)} />}
        {success && <SuccessBanner message={success} />}

        {loadingData && activeTab !== "mail" ? (
          <div className="content-loader">
            <Loader2 className="spin" size={34} />
            <span>Sincronizando con PostgreSQL...</span>
          </div>
        ) : (
          <>
            {activeTab === "mail" && <MailTab />}
            {activeTab === "dashboard" && <OverviewPanel onNavigate={navigate} />}
            {activeTab === "dashboard" && (
              <DashboardTab
                data={data}
                pendingUsers={pendingUsers}
                onViewProfile={openContractorReview}
                onEdit={(user) => setEditor({ kind: "user", draft: userDraft(user) })}
                onToggle={toggleUser}
              />
            )}
            {activeTab === "users" && (
              <UsersTab
                users={visibleUsers}
                onViewProfile={openContractorReview}
                search={search}
                setSearch={setSearch}
                currentUserId={session.user.id}
                saving={saving}
                onEdit={(user) => setEditor({ kind: "user", draft: userDraft(user) })}
                onToggle={toggleUser}
              />
            )}
            {activeTab === "companies" && (
              <CompaniesTab
                key={nav.key}
                users={data.users}
                onViewProfile={openContractorReview}
                focusId={nav.id ?? null}
                onNavigate={navigate}
              />
            )}
            {activeTab === "projects" && (
              <ProjectsTab
                key={nav.key}
                companies={data.companies}
                initialStatus={nav.status ?? ""}
                initialCompanyId={nav.companyId ?? ""}
                focusId={nav.id ?? null}
                onNavigate={navigate}
              />
            )}
            {activeTab === "budgets" && (
              <BudgetsTab
                key={nav.key}
                companies={data.companies}
                initialStatus={nav.status ?? ""}
                initialCompanyId={nav.companyId ?? ""}
                focusId={nav.id ?? null}
                onNavigate={navigate}
              />
            )}
            {activeTab === "invoices" && (
              <InvoicesTab
                key={nav.key}
                companies={data.companies}
                initialStatus={nav.status ?? ""}
                initialCompanyId={nav.companyId ?? ""}
                focusId={nav.id ?? null}
                onNavigate={navigate}
              />
            )}
            {activeTab === "clients" && (
              <ClientsTab
                key={nav.key}
                companies={data.companies}
                initialCompanyId={nav.companyId ?? ""}
                initialSearch={nav.search ?? ""}
                focusId={nav.id ?? null}
                onNavigate={navigate}
              />
            )}
            {activeTab === "audit" && (
              <AuditTab key={nav.key} companies={data.companies} initialCompanyId={nav.companyId ?? ""} onNavigate={navigate} />
            )}
            {activeTab === "catalog" && (
              <CatalogTab
                categories={data.categories}
                items={visibleItems}
                search={search}
                setSearch={setSearch}
                onNewCategory={newCategory}
                onNewItem={newItem}
                onEditCategory={(category) => setEditor({ kind: "category", draft: categoryDraft(category) })}
                onEditItem={(item) => setEditor({ kind: "item", draft: itemDraft(item) })}
              />
            )}
            {activeTab === "calculations" && (
              <CalculationsTab
                formulas={data.formulas}
                units={data.units}
                yields={data.yields}
                onNewFormula={newFormula}
                onNewUnit={newUnit}
                onNewYield={newYield}
                onEditFormula={(formula) => setEditor({ kind: "formula", draft: formulaDraft(formula) })}
                onEditUnit={(unit) => setEditor({ kind: "unit", draft: unitDraft(unit) })}
                onEditYield={(value) => setEditor({ kind: "yield", draft: yieldDraft(value) })}
              />
            )}
            {activeTab === "pricing" && (
              <PricingTab
                data={data}
                itemType={priceType}
                setItemType={setPriceType}
                target={priceTarget}
                setTarget={setPriceTarget}
                percentage={pricePercentage}
                setPercentage={setPricePercentage}
                notes={priceNotes}
                setNotes={setPriceNotes}
                adjusting={adjustingPrices}
                onSubmit={handlePriceAdjustment}
                onEdit={(item) => setEditor({ kind: "globalPrice", draft: globalCatalogItemDraft(item) })}
                onReload={loadData}
              />
            )}
            {activeTab === "system" && (
              <SystemTab data={data} email={session.user.email ?? ""} onSignOut={handleSignOut} />
            )}
          </>
        )}
      </main>

      {reviewUser && (
        <UserProfileModal
          profile={contractorReview}
          fallbackName={reviewUser.fullName}
          loading={reviewLoading}
          error={contractorReview ? null : reviewError}
          actionError={contractorReview ? reviewError : null}
          saving={saving}
          documentLoading={documentLoading}
          onClose={closeContractorReview}
          onRetry={() => void openContractorReview(reviewUser)}
          onApprove={approveContractorFromReview}
          onOpenDocument={openContractorDocument}
        >
          <UserSessionsPanel userId={reviewUser.id} isSelf={reviewUser.id === session.user.id} />
        </UserProfileModal>
      )}
      {paletteOpen && (
        <CommandPalette
          onClose={() => setPaletteOpen(false)}
          onNavigate={navigate}
          onOpenUser={openUserById}
        />
      )}
      {editor && (
        <EditorModal
          editor={editor}
          setEditor={setEditor}
          data={data}
          currentUserId={session.user.id}
          saving={saving}
          onSave={submitEditor}
          onClose={() => setEditor(null)}
        />
      )}
    </div>
  );
}
