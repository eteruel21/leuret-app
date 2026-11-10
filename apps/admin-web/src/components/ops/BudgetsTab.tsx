import { useEffect, useMemo, useState } from "react";
import { FileText, History, ListOrdered, Receipt } from "lucide-react";

import type { Company } from "../../admin-data";
import {
  BUDGET_STATUS,
  INVOICE_STATUS,
  dateTime,
  day,
  downloadCsv,
  loadBudgetDetail,
  loadBudgets,
  money,
} from "../../operations-data";
import { AlertBanner, EmptyState, Table } from "../CommonUI";
import {
  Drawer,
  DrawerSection,
  KeyValues,
  ListToolbar,
  LoadingBlock,
  PAGE_SIZE,
  Pagination,
  statusPill,
  useAdminList,
  useDebounced,
  useDetail,
} from "./OpsUI";
import type { OpsNavigate } from "./navigation";

const STATUS_OPTIONS = Object.entries(BUDGET_STATUS).map(([value, entry]) => ({ value, label: entry.label }));

const ITEM_TYPE: Record<string, string> = {
  material: "Material",
  labor: "Mano de obra",
  equipment: "Equipo",
  service: "Servicio",
  subcontract: "Subcontrato",
  manual: "Manual",
};

export function BudgetsTab({
  companies,
  initialStatus = "",
  initialCompanyId = "",
  focusId = null,
  onNavigate,
}: {
  companies: Company[];
  initialStatus?: string;
  initialCompanyId?: string;
  focusId?: string | null;
  onNavigate: OpsNavigate;
}) {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState(initialStatus);
  const [companyId, setCompanyId] = useState(initialCompanyId);
  const [offset, setOffset] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(focusId);
  const debouncedSearch = useDebounced(search);

  useEffect(() => setOffset(0), [debouncedSearch, status, companyId]);

  const { page, loading, error, reload, setError } = useAdminList(loadBudgets, {
    search: debouncedSearch,
    status,
    companyId,
    limit: PAGE_SIZE,
    offset,
  });
  const rows = page?.rows ?? [];
  const pageTotal = useMemo(() => rows.reduce((sum, budget) => sum + budget.total, 0), [rows]);

  function exportCsv() {
    downloadCsv(
      `presupuestos-${new Date().toISOString().slice(0, 10)}.csv`,
      ["Número", "Título", "Empresa", "Cliente", "Obra", "Estado", "Versión", "Partidas", "Total", "Moneda", "Válido hasta", "Actualizado"],
      rows.map((budget) => [
        budget.budgetNumber,
        budget.title,
        budget.companyName,
        budget.clientName,
        budget.projectName,
        BUDGET_STATUS[budget.status]?.label ?? budget.status,
        budget.version,
        budget.itemCount,
        budget.total.toFixed(2),
        budget.currencyCode,
        budget.validUntil,
        budget.updatedAt,
      ])
    );
  }

  return (
    <>
      {error && <AlertBanner message={error} onClose={() => setError(null)} />}
      <section className="data-card">
        <ListToolbar
          title="Presupuestos de todas las empresas"
          subtitle={page ? `${page.total} presupuesto${page.total === 1 ? "" : "s"} · ${money(pageTotal)} en esta página` : "Cargando..."}
          search={search}
          onSearch={setSearch}
          searchPlaceholder="Buscar número, título, empresa, cliente u obra..."
          status={status}
          onStatus={setStatus}
          statusOptions={STATUS_OPTIONS}
          companies={companies}
          companyId={companyId}
          onCompany={setCompanyId}
          loading={loading}
          onReload={reload}
          onExport={rows.length ? exportCsv : undefined}
        />

        {loading && !page ? (
          <LoadingBlock label="Cargando presupuestos..." />
        ) : rows.length === 0 ? (
          <EmptyState label="No hay presupuestos que coincidan con los filtros." />
        ) : (
          <Table>
            <thead>
              <tr>
                <th>Presupuesto</th>
                <th>Empresa</th>
                <th>Cliente / obra</th>
                <th>Estado</th>
                <th className="numeric">Total</th>
                <th>Válido hasta</th>
                <th>Actualizado</th>
              </tr>
            </thead>
            <tbody className={loading ? "is-refreshing" : undefined}>
              {rows.map((budget) => (
                <tr key={budget.id} className="clickable-row" onClick={() => setSelectedId(budget.id)}>
                  <td>
                    <strong>{budget.budgetNumber ?? "Sin número"}</strong>
                    <small>
                      {budget.title}
                      {budget.version > 1 ? ` · v${budget.version}` : ""}
                    </small>
                  </td>
                  <td>{budget.companyName}</td>
                  <td>
                    {budget.clientName ?? "—"}
                    <small>{budget.projectName ?? ""}</small>
                  </td>
                  <td>
                    {statusPill(BUDGET_STATUS, budget.status)}
                    {budget.pastValidity && <small className="text-warning">Fuera de vigencia</small>}
                  </td>
                  <td className="numeric">
                    <strong>{money(budget.total, budget.currencyCode)}</strong>
                    <small>{budget.itemCount} partidas</small>
                  </td>
                  <td>{day(budget.validUntil)}</td>
                  <td>{day(budget.updatedAt)}</td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
        {page && <Pagination total={page.total} offset={offset} limit={PAGE_SIZE} onChange={setOffset} />}
      </section>

      {selectedId && <BudgetDrawer id={selectedId} onClose={() => setSelectedId(null)} onNavigate={onNavigate} />}
    </>
  );
}

function BudgetDrawer({ id, onClose, onNavigate }: { id: string; onClose: () => void; onNavigate: OpsNavigate }) {
  const { detail, error } = useDetail(loadBudgetDetail, id);
  const budget = detail?.budget;
  const currency = budget?.currencyCode ?? "USD";

  const sections = useMemo(() => {
    const groups = new Map<string, NonNullable<typeof detail>["items"]>();
    for (const item of detail?.items ?? []) {
      const key = item.sectionName ?? "Sin sección";
      groups.set(key, [...(groups.get(key) ?? []), item]);
    }
    return [...groups.entries()];
  }, [detail]);

  const margin = useMemo(() => {
    const items = detail?.items ?? [];
    const cost = items.reduce((sum, item) => sum + item.unitCost * item.quantity, 0);
    const sale = items.reduce((sum, item) => sum + item.subtotal, 0);
    return { cost, sale, percentage: sale > 0 ? ((sale - cost) / sale) * 100 : null };
  }, [detail]);

  return (
    <Drawer
      title={budget ? `${budget.budgetNumber ?? "Presupuesto"} · ${budget.title}` : "Presupuesto"}
      subtitle={budget ? <>{statusPill(BUDGET_STATUS, budget.status)} {budget.companyName}</> : "Cargando..."}
      onClose={onClose}
      actions={
        budget && (
          <>
            <button className="button button-ghost" type="button" onClick={() => onNavigate({ tab: "companies", id: budget.companyId })}>
              Ver empresa
            </button>
            <button className="button button-secondary" type="button" onClick={onClose}>
              Cerrar
            </button>
          </>
        )
      }
    >
      {error && <AlertBanner message={error} />}
      {!detail && !error && <LoadingBlock label="Cargando presupuesto..." />}
      {detail && budget && (
        <>
          <DrawerSection title="Resumen" icon={<FileText size={17} />}>
            <div className="totals-strip">
              <div>
                <span>Subtotal</span>
                <strong>{money(budget.subtotal, currency)}</strong>
              </div>
              <div>
                <span>Descuento</span>
                <strong>{budget.discountAmount ? `− ${money(budget.discountAmount, currency)}` : "—"}</strong>
              </div>
              <div>
                <span>ITBMS {budget.taxRate ? `${budget.taxRate}%` : ""}</span>
                <strong>{money(budget.taxAmount, currency)}</strong>
              </div>
              <div className="totals-strip-main">
                <span>Total</span>
                <strong>{money(budget.total, currency)}</strong>
              </div>
            </div>
            <KeyValues
              items={[
                ["Cliente", budget.clientName],
                ["Correo del cliente", budget.clientEmail],
                ["Obra", budget.projectName],
                ["Creado por", budget.createdByName],
                ["Versión", `v${budget.version}`],
                ["Válido hasta", day(budget.validUntil)],
                ["Aprobado", dateTime(budget.approvedAt)],
                [
                  "Margen estimado",
                  margin.percentage === null ? null : `${margin.percentage.toFixed(1)}% (costo ${money(margin.cost, currency)})`,
                ],
              ]}
            />
            {budget.rejectionReason && <p className="drawer-note text-danger">Motivo de rechazo: {budget.rejectionReason}</p>}
            {budget.description && <p className="drawer-note">{budget.description}</p>}
          </DrawerSection>

          <DrawerSection title="Partidas" icon={<ListOrdered size={17} />} aside={`${detail.items.length}`}>
            {detail.items.length === 0 ? (
              <EmptyState label="Este presupuesto no tiene partidas." />
            ) : (
              sections.map(([section, items]) => (
                <div key={section} className="budget-section-block">
                  {sections.length > 1 && <h4>{section}</h4>}
                  <Table>
                    <thead>
                      <tr>
                        <th>Descripción</th>
                        <th className="numeric">Cant.</th>
                        <th className="numeric">P. unit.</th>
                        <th className="numeric">Subtotal</th>
                      </tr>
                    </thead>
                    <tbody>
                      {items.map((item) => (
                        <tr key={item.id}>
                          <td>
                            {item.description}
                            <small>{ITEM_TYPE[item.itemType] ?? item.itemType}</small>
                          </td>
                          <td className="numeric">
                            {item.quantity.toLocaleString("es-PA", { maximumFractionDigits: 3 })} {item.unitName}
                          </td>
                          <td className="numeric">{money(item.unitPrice, currency)}</td>
                          <td className="numeric">{money(item.subtotal, currency)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </Table>
                </div>
              ))
            )}
          </DrawerSection>

          {detail.invoices.length > 0 && (
            <DrawerSection title="Facturas" icon={<Receipt size={17} />}>
              <ul className="drawer-list">
                {detail.invoices.map((invoice) => (
                  <li key={invoice.id} className="is-link" onClick={() => onNavigate({ tab: "invoices", id: invoice.id })}>
                    <div>
                      <strong>{invoice.invoiceNumber ?? "Borrador"}</strong>
                      <small>Emitida {day(invoice.issueDate)}</small>
                    </div>
                    <span className="drawer-list-end">
                      {statusPill(INVOICE_STATUS, invoice.status)}
                      <strong>{money(invoice.total, currency)}</strong>
                    </span>
                  </li>
                ))}
              </ul>
            </DrawerSection>
          )}

          <DrawerSection title="Versiones" icon={<History size={17} />}>
            {detail.versions.length === 0 ? (
              <EmptyState label="Sin versiones guardadas." />
            ) : (
              <ul className="timeline">
                {detail.versions.map((version) => (
                  <li key={version.id}>
                    <strong>Versión {version.versionNumber}</strong>
                    <small>{[version.createdByName, dateTime(version.createdAt)].filter(Boolean).join(" · ")}</small>
                  </li>
                ))}
              </ul>
            )}
          </DrawerSection>
        </>
      )}
    </Drawer>
  );
}
