import { Fragment, useEffect, useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";

import type { Company } from "../../admin-data";
import { auditLabel, dateTime, downloadCsv, loadAuditLogs } from "../../operations-data";
import { AlertBanner, EmptyState, Table } from "../CommonUI";
import { ListToolbar, LoadingBlock, PAGE_SIZE, Pagination, StatusPill, useAdminList, useDebounced } from "./OpsUI";
import type { OpsNavigate } from "./navigation";

function actionTone(action: string) {
  if (/SUSPEND|REVOK|DELETE|CANCEL|REJECT/.test(action)) return "danger" as const;
  if (/REACTIVAT|APPROV|CREATE/.test(action)) return "success" as const;
  return "info" as const;
}

function metadataSummary(metadata: Record<string, unknown>): string {
  const reason = metadata.reason;
  if (typeof reason === "string" && reason) return reason;
  const keys = Object.keys(metadata);
  return keys.length ? keys.slice(0, 3).join(", ") : "";
}

export function AuditTab({
  companies,
  initialCompanyId = "",
  onNavigate,
}: {
  companies: Company[];
  initialCompanyId?: string;
  onNavigate: OpsNavigate;
}) {
  const [search, setSearch] = useState("");
  const [action, setAction] = useState("");
  const [companyId, setCompanyId] = useState(initialCompanyId);
  const [offset, setOffset] = useState(0);
  const [expanded, setExpanded] = useState<string | null>(null);
  const debouncedSearch = useDebounced(search);

  useEffect(() => setOffset(0), [debouncedSearch, action, companyId]);

  const { page, loading, error, reload, setError } = useAdminList(loadAuditLogs, {
    search: debouncedSearch,
    status: action,
    companyId,
    limit: PAGE_SIZE,
    offset,
  });
  const rows = page?.rows ?? [];
  const actionOptions = (page?.actions ?? []).map((entry) => ({
    value: entry.action,
    label: `${auditLabel(entry.action)} (${entry.count})`,
  }));

  function exportCsv() {
    downloadCsv(
      `auditoria-${new Date().toISOString().slice(0, 10)}.csv`,
      ["Fecha", "Acción", "Código", "Empresa", "Usuario", "Correo", "Objeto", "Id objeto", "Detalle"],
      rows.map((log) => [
        log.createdAt,
        auditLabel(log.action),
        log.action,
        log.companyName,
        log.actorName,
        log.actorEmail,
        log.targetType,
        log.targetId,
        JSON.stringify(log.metadata),
      ])
    );
  }

  return (
    <>
      {error && <AlertBanner message={error} onClose={() => setError(null)} />}
      <section className="data-card">
        <ListToolbar
          title="Bitácora de auditoría"
          subtitle={page ? `${page.total} evento${page.total === 1 ? "" : "s"} registrados` : "Cargando..."}
          search={search}
          onSearch={setSearch}
          searchPlaceholder="Buscar acción, usuario, correo, empresa o id..."
          status={action}
          onStatus={setAction}
          statusOptions={actionOptions}
          statusAllLabel="Todas las acciones"
          companies={companies}
          companyId={companyId}
          onCompany={setCompanyId}
          loading={loading}
          onReload={reload}
          onExport={rows.length ? exportCsv : undefined}
        />

        {loading && !page ? (
          <LoadingBlock label="Cargando auditoría..." />
        ) : rows.length === 0 ? (
          <EmptyState label="No hay eventos que coincidan con los filtros." />
        ) : (
          <Table>
            <thead>
              <tr>
                <th />
                <th>Fecha</th>
                <th>Acción</th>
                <th>Realizada por</th>
                <th>Empresa</th>
                <th>Detalle</th>
              </tr>
            </thead>
            <tbody className={loading ? "is-refreshing" : undefined}>
              {rows.map((log) => (
                <Fragment key={log.id}>
                  <tr className="clickable-row" onClick={() => setExpanded((current) => (current === log.id ? null : log.id))}>
                    <td className="expander">{expanded === log.id ? <ChevronDown size={15} /> : <ChevronRight size={15} />}</td>
                    <td>{dateTime(log.createdAt)}</td>
                    <td>
                      <StatusPill label={auditLabel(log.action)} tone={actionTone(log.action)} />
                    </td>
                    <td>
                      {log.actorName ?? "—"}
                      <small>{log.actorEmail ?? ""}</small>
                    </td>
                    <td>
                      {log.companyId ? (
                        <button
                          type="button"
                          className="link-button"
                          onClick={(event) => {
                            event.stopPropagation();
                            onNavigate({ tab: "companies", id: log.companyId });
                          }}
                        >
                          {log.companyName ?? "Empresa"}
                        </button>
                      ) : (
                        <span className="muted-text">Plataforma</span>
                      )}
                    </td>
                    <td className="truncate-cell">{metadataSummary(log.metadata) || `${log.targetType}${log.targetId ? ` · ${log.targetId.slice(0, 8)}` : ""}`}</td>
                  </tr>
                  {expanded === log.id && (
                    <tr className="expanded-row">
                      <td />
                      <td colSpan={5}>
                        <dl className="kv-grid">
                          <div>
                            <dt>Código</dt>
                            <dd>{log.action}</dd>
                          </div>
                          <div>
                            <dt>Objeto</dt>
                            <dd>
                              {log.targetType} {log.targetId ?? ""}
                            </dd>
                          </div>
                        </dl>
                        <pre className="json-block">{JSON.stringify(log.metadata, null, 2)}</pre>
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </Table>
        )}
        {page && <Pagination total={page.total} offset={offset} limit={PAGE_SIZE} onChange={setOffset} />}
      </section>
    </>
  );
}
