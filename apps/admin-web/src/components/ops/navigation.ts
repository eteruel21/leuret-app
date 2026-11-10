export type Tab =
  | "dashboard"
  | "users"
  | "companies"
  | "projects"
  | "budgets"
  | "invoices"
  | "clients"
  | "catalog"
  | "calculations"
  | "pricing"
  | "audit"
  | "system";

export const TABS: Tab[] = [
  "dashboard",
  "users",
  "companies",
  "projects",
  "budgets",
  "invoices",
  "clients",
  "catalog",
  "calculations",
  "pricing",
  "audit",
  "system",
];

export const TAB_LABELS: Record<Tab, string> = {
  dashboard: "Resumen",
  users: "Usuarios",
  companies: "Empresas",
  projects: "Obras",
  budgets: "Presupuestos",
  invoices: "Facturación",
  clients: "Clientes",
  catalog: "Catálogo",
  calculations: "Cálculos",
  pricing: "Precios",
  audit: "Auditoría",
  system: "Sistema",
};

/** Destino de navegación interna: pestaña y, opcionalmente, registro o filtros. */
export type NavTarget = {
  tab: Tab;
  id?: string | null;
  status?: string;
  companyId?: string;
  search?: string;
};

export type OpsNavigate = (target: NavTarget) => void;

export function isTab(value: string | null | undefined): value is Tab {
  return Boolean(value) && TABS.includes(value as Tab);
}

/** Lee `#/obras?id=...&status=...` para que cada vista tenga su enlace. */
export function readHash(hash: string): NavTarget | null {
  const clean = hash.replace(/^#\/?/, "");
  if (!clean) return null;
  const [path, queryText] = clean.split("?");
  if (!isTab(path)) return null;
  const params = new URLSearchParams(queryText ?? "");
  return {
    tab: path,
    id: params.get("id"),
    status: params.get("status") ?? undefined,
    companyId: params.get("companyId") ?? undefined,
    search: params.get("q") ?? undefined,
  };
}

export function writeHash(target: NavTarget): string {
  const params = new URLSearchParams();
  if (target.id) params.set("id", target.id);
  if (target.status) params.set("status", target.status);
  if (target.companyId) params.set("companyId", target.companyId);
  if (target.search) params.set("q", target.search);
  const query = params.toString();
  return `#/${target.tab}${query ? `?${query}` : ""}`;
}
