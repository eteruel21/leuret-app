import { useEffect, useState } from "react";
import { UserRound } from "lucide-react";

import type { Company } from "../../admin-data";
import { type AdminClient, dateTime, downloadCsv, loadClients } from "../../operations-data";
import { AlertBanner, EmptyState, Table } from "../CommonUI";
import {
  Drawer,
  DrawerSection,
  KeyValues,
  ListToolbar,
  LoadingBlock,
  PAGE_SIZE,
  Pagination,
  StatusPill,
  useAdminList,
  useDebounced,
} from "./OpsUI";
import type { OpsNavigate } from "./navigation";

const STATUS_OPTIONS = [
  { value: "active", label: "Activos" },
  { value: "inactive", label: "Inactivos" },
  { value: "portal", label: "Con acceso al portal" },
];

export function ClientsTab({
  companies,
  initialCompanyId = "",
  initialSearch = "",
  focusId = null,
  onNavigate,
}: {
  companies: Company[];
  initialCompanyId?: string;
  initialSearch?: string;
  focusId?: string | null;
  onNavigate: OpsNavigate;
}) {
  const [search, setSearch] = useState(initialSearch);
  const [status, setStatus] = useState("");
  const [companyId, setCompanyId] = useState(initialCompanyId);
  const [offset, setOffset] = useState(0);
  const [selected, setSelected] = useState<AdminClient | null>(null);
  const debouncedSearch = useDebounced(search);

  useEffect(() => setOffset(0), [debouncedSearch, status, companyId]);

  const { page, loading, error, reload, setError } = useAdminList(loadClients, {
    search: debouncedSearch,
    status,
    companyId,
    limit: PAGE_SIZE,
    offset,
  });
  const rows = page?.rows ?? [];

  // Desde la búsqueda global llega el id: se abre en cuanto aparece en la página.
  useEffect(() => {
    if (focusId && !selected) {
      const match = rows.find((client) => client.id === focusId);
      if (match) setSelected(match);
    }
  }, [focusId, rows, selected]);

  function exportCsv() {
    downloadCsv(
      `clientes-${new Date().toISOString().slice(0, 10)}.csv`,
      ["Cliente", "Tipo", "Documento", "Correo", "Teléfono", "Empresa", "Obras", "Presupuestos", "Facturas", "Portal", "Activo"],
      rows.map((client) => [
        client.displayName,
        client.clientType === "business" ? "Empresa" : "Persona",
        [client.documentType, client.documentNumber].filter(Boolean).join(" "),
        client.email,
        client.phone,
        client.companyName,
        client.projectCount,
        client.budgetCount,
        client.invoiceCount,
        client.hasPortalAccess ? "Sí" : "No",
        client.active ? "Sí" : "No",
      ])
    );
  }

  return (
    <>
      {error && <AlertBanner message={error} onClose={() => setError(null)} />}
      <section className="data-card">
        <ListToolbar
          title="Clientes de todas las empresas"
          subtitle={page ? `${page.total} cliente${page.total === 1 ? "" : "s"}` : "Cargando..."}
          search={search}
          onSearch={setSearch}
          searchPlaceholder="Buscar nombre, correo, teléfono, documento o empresa..."
          status={status}
          onStatus={setStatus}
          statusOptions={STATUS_OPTIONS}
          statusAllLabel="Todos los clientes"
          companies={companies}
          companyId={companyId}
          onCompany={setCompanyId}
          loading={loading}
          onReload={reload}
          onExport={rows.length ? exportCsv : undefined}
        />

        {loading && !page ? (
          <LoadingBlock label="Cargando clientes..." />
        ) : rows.length === 0 ? (
          <EmptyState label={search ? "No hay clientes que coincidan con la búsqueda." : "Todavía no hay clientes registrados."} />
        ) : (
          <Table>
            <thead>
              <tr>
                <th>Cliente</th>
                <th>Contacto</th>
                <th>Empresa</th>
                <th className="numeric">Obras</th>
                <th className="numeric">Presupuestos</th>
                <th className="numeric">Facturas</th>
                <th>Estado</th>
              </tr>
            </thead>
            <tbody className={loading ? "is-refreshing" : undefined}>
              {rows.map((client) => (
                <tr key={client.id} className="clickable-row" onClick={() => setSelected(client)}>
                  <td>
                    <strong>{client.displayName}</strong>
                    <small>{[client.clientType === "business" ? "Empresa" : "Persona", client.documentNumber].filter(Boolean).join(" · ")}</small>
                  </td>
                  <td>
                    {client.email ?? "—"}
                    <small>{client.phone ?? ""}</small>
                  </td>
                  <td>{client.companyName}</td>
                  <td className="numeric">{client.projectCount}</td>
                  <td className="numeric">{client.budgetCount}</td>
                  <td className="numeric">{client.invoiceCount}</td>
                  <td>
                    <StatusPill label={client.active ? "Activo" : "Inactivo"} tone={client.active ? "success" : "neutral"} />
                    {client.hasPortalAccess && <StatusPill label="Portal" tone="info" />}
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
        {page && <Pagination total={page.total} offset={offset} limit={PAGE_SIZE} onChange={setOffset} />}
      </section>

      {selected && (
        <Drawer
          title={selected.displayName}
          subtitle={selected.companyName}
          onClose={() => setSelected(null)}
          actions={
            <>
              <button className="button button-ghost" type="button" onClick={() => onNavigate({ tab: "companies", id: selected.companyId })}>
                Ver empresa
              </button>
              <button className="button button-secondary" type="button" onClick={() => setSelected(null)}>
                Cerrar
              </button>
            </>
          }
        >
          <DrawerSection title="Datos del cliente" icon={<UserRound size={17} />}>
            <KeyValues
              items={[
                ["Tipo", selected.clientType === "business" ? "Empresa" : "Persona"],
                ["Documento", [selected.documentType, selected.documentNumber].filter(Boolean).join(" ")],
                ["Correo", selected.email],
                ["Teléfono", selected.phone],
                ["Acceso al portal", selected.hasPortalAccess ? "Sí" : "No"],
                ["Estado", selected.active ? "Activo" : "Inactivo"],
                ["Registrado", dateTime(selected.createdAt)],
                ["Actualizado", dateTime(selected.updatedAt)],
              ]}
            />
          </DrawerSection>
          <DrawerSection title="Actividad comercial">
            <div className="totals-strip">
              <button type="button" className="totals-link" onClick={() => onNavigate({ tab: "projects", companyId: selected.companyId })}>
                <span>Obras</span>
                <strong>{selected.projectCount}</strong>
              </button>
              <button type="button" className="totals-link" onClick={() => onNavigate({ tab: "budgets", companyId: selected.companyId })}>
                <span>Presupuestos</span>
                <strong>{selected.budgetCount}</strong>
              </button>
              <button type="button" className="totals-link" onClick={() => onNavigate({ tab: "invoices", companyId: selected.companyId })}>
                <span>Facturas</span>
                <strong>{selected.invoiceCount}</strong>
              </button>
            </div>
            <p className="muted-text">Los enlaces abren los registros de la empresa {selected.companyName}.</p>
          </DrawerSection>
        </Drawer>
      )}
    </>
  );
}
