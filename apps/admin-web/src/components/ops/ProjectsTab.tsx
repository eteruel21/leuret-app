import { useEffect, useState } from "react";
import { CalendarDays, ClipboardList, FileText, HardHat, Receipt, TrendingUp } from "lucide-react";

import type { Company } from "../../admin-data";
import {
  BUDGET_STATUS,
  INVOICE_STATUS,
  PROJECT_STATUS,
  TASK_STATUS,
  type AdminProject,
  day,
  dateTime,
  downloadCsv,
  loadProjectDetail,
  loadProjects,
  money,
  setProjectStatus,
} from "../../operations-data";
import { AlertBanner, EmptyState, SuccessBanner, Table } from "../CommonUI";
import {
  Drawer,
  DrawerSection,
  KeyValues,
  ListToolbar,
  LoadingBlock,
  PAGE_SIZE,
  Pagination,
  ProgressBar,
  statusPill,
  SupportAction,
  useAdminList,
  useDebounced,
  useDetail,
} from "./OpsUI";
import type { OpsNavigate } from "./navigation";

const STATUS_OPTIONS = Object.entries(PROJECT_STATUS).map(([value, entry]) => ({ value, label: entry.label }));

export function ProjectsTab({
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

  const { page, loading, error, reload, setError } = useAdminList(loadProjects, {
    search: debouncedSearch,
    status,
    companyId,
    limit: PAGE_SIZE,
    offset,
  });

  const rows = page?.rows ?? [];

  function exportCsv() {
    downloadCsv(
      `obras-${new Date().toISOString().slice(0, 10)}.csv`,
      ["Código", "Obra", "Empresa", "Cliente", "Estado", "Avance %", "Valor contrato", "Inicio", "Fin estimado", "Tareas abiertas", "Tareas vencidas"],
      rows.map((project) => [
        project.projectCode,
        project.name,
        project.companyName,
        project.clientName,
        PROJECT_STATUS[project.status]?.label ?? project.status,
        Math.round(project.progressPercentage),
        project.contractValue ?? project.budgetEstimate,
        project.startDate,
        project.estimatedEndDate,
        project.openTaskCount,
        project.overdueTaskCount,
      ])
    );
  }

  return (
    <>
      {error && <AlertBanner message={error} onClose={() => setError(null)} />}
      <section className="data-card">
        <ListToolbar
          title="Obras de todas las empresas"
          subtitle={page ? `${page.total} obra${page.total === 1 ? "" : "s"}` : "Cargando..."}
          search={search}
          onSearch={setSearch}
          searchPlaceholder="Buscar obra, código, empresa o cliente..."
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
          <LoadingBlock label="Cargando obras..." />
        ) : rows.length === 0 ? (
          <EmptyState label="No hay obras que coincidan con los filtros." />
        ) : (
          <Table>
            <thead>
              <tr>
                <th>Obra</th>
                <th>Empresa</th>
                <th>Estado</th>
                <th>Avance</th>
                <th>Tareas</th>
                <th>Valor</th>
                <th>Fin estimado</th>
              </tr>
            </thead>
            <tbody className={loading ? "is-refreshing" : undefined}>
              {rows.map((project) => (
                <tr key={project.id} className="clickable-row" onClick={() => setSelectedId(project.id)}>
                  <td>
                    <strong>{project.name}</strong>
                    <small>{[project.projectCode, project.clientName].filter(Boolean).join(" · ") || "Sin cliente"}</small>
                  </td>
                  <td>{project.companyName}</td>
                  <td>{statusPill(PROJECT_STATUS, project.status)}</td>
                  <td>
                    <ProgressBar value={project.progressPercentage} />
                  </td>
                  <td>
                    {project.openTaskCount} abiertas
                    {project.overdueTaskCount > 0 ? (
                      <small className="text-danger">{project.overdueTaskCount} vencidas</small>
                    ) : (
                      <small>{project.taskCount} en total</small>
                    )}
                  </td>
                  <td className="numeric">{project.contractValue ?? project.budgetEstimate ? money(project.contractValue ?? project.budgetEstimate) : "—"}</td>
                  <td>
                    <span className={isLate(project) ? "text-danger" : undefined}>{day(project.estimatedEndDate)}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
        {page && <Pagination total={page.total} offset={offset} limit={PAGE_SIZE} onChange={setOffset} />}
      </section>

      {selectedId && <ProjectDrawer id={selectedId} onClose={() => setSelectedId(null)} onNavigate={onNavigate} onChanged={reload} />}
    </>
  );
}

function isLate(project: AdminProject): boolean {
  if (!project.estimatedEndDate || ["completed", "cancelled"].includes(project.status)) return false;
  return project.estimatedEndDate < new Date().toISOString().slice(0, 10);
}

function ProjectDrawer({
  id,
  onClose,
  onNavigate,
  onChanged,
}: {
  id: string;
  onClose: () => void;
  onNavigate: OpsNavigate;
  onChanged: () => void;
}) {
  const { detail, error, reload } = useDetail(loadProjectDetail, id);
  const project = detail?.project;
  const [nextStatus, setNextStatus] = useState("");
  const [notice, setNotice] = useState<string | null>(null);

  return (
    <Drawer
      title={project?.name ?? "Obra"}
      subtitle={project ? <>{statusPill(PROJECT_STATUS, project.status)} {project.projectCode ?? ""} · {project.companyName}</> : "Cargando..."}
      onClose={onClose}
      actions={
        project && (
          <>
            <button className="button button-ghost" type="button" onClick={() => onNavigate({ tab: "companies", id: project.companyId })}>
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
      {notice && <SuccessBanner message={notice} />}
      {!detail && !error && <LoadingBlock label="Cargando obra..." />}
      {detail && project && (
        <>
          <DrawerSection title="Resumen" icon={<HardHat size={17} />}>
            <ProgressBar value={project.progressPercentage} />
            <KeyValues
              items={[
                ["Cliente", project.clientName],
                ["Contacto", [project.clientEmail, project.clientPhone].filter(Boolean).join(" · ")],
                ["Responsable", project.managerName],
                ["Valor del contrato", project.contractValue !== null ? money(project.contractValue) : null],
                ["Estimado", project.budgetEstimate !== null ? money(project.budgetEstimate) : null],
                ["Inicio", day(project.startDate)],
                ["Fin estimado", day(project.estimatedEndDate)],
                ["Fin real", day(project.actualEndDate)],
                ["Fotos", project.photoCount],
                ["Actualizada", dateTime(project.updatedAt)],
              ]}
            />
            {project.description && <p className="drawer-note">{project.description}</p>}
          </DrawerSection>

          <DrawerSection title="Tareas" icon={<ClipboardList size={17} />} aside={`${detail.tasks.filter((task) => !task.completedAt && task.status !== "completed").length} abiertas`}>
            {detail.tasks.length === 0 ? (
              <EmptyState label="Sin tareas registradas." />
            ) : (
              <ul className="drawer-list">
                {detail.tasks.map((task) => {
                  const done = Boolean(task.completedAt) || task.status === "completed";
                  const overdue = !done && task.dueDate !== null && new Date(task.dueDate) < new Date();
                  return (
                    <li key={task.id} className={done ? "is-done" : undefined}>
                      <div>
                        <strong>{task.title}</strong>
                        <small>
                          {[TASK_STATUS[task.status] ?? task.status, task.assigneeName, task.priority && `Prioridad ${task.priority}`]
                            .filter(Boolean)
                            .join(" · ")}
                        </small>
                      </div>
                      <span className={overdue ? "text-danger" : "muted-text"}>{task.dueDate ? day(task.dueDate) : "Sin fecha"}</span>
                    </li>
                  );
                })}
              </ul>
            )}
          </DrawerSection>

          <DrawerSection title="Presupuestos" icon={<FileText size={17} />}>
            {detail.budgets.length === 0 ? (
              <EmptyState label="Sin presupuestos vinculados." />
            ) : (
              <ul className="drawer-list">
                {detail.budgets.map((budget) => (
                  <li key={budget.id} className="is-link" onClick={() => onNavigate({ tab: "budgets", id: budget.id })}>
                    <div>
                      <strong>{budget.budgetNumber ?? "Sin número"} · {budget.title}</strong>
                      <small>{dateTime(budget.updatedAt)}</small>
                    </div>
                    <span className="drawer-list-end">
                      {statusPill(BUDGET_STATUS, budget.status)}
                      <strong>{money(budget.total, budget.currencyCode)}</strong>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </DrawerSection>

          <DrawerSection title="Facturas" icon={<Receipt size={17} />}>
            {detail.invoices.length === 0 ? (
              <EmptyState label="Sin facturas emitidas." />
            ) : (
              <ul className="drawer-list">
                {detail.invoices.map((invoice) => (
                  <li key={invoice.id} className="is-link" onClick={() => onNavigate({ tab: "invoices", id: invoice.id })}>
                    <div>
                      <strong>{invoice.invoiceNumber ?? "Borrador"}</strong>
                      <small>Vence {day(invoice.dueDate)}</small>
                    </div>
                    <span className="drawer-list-end">
                      {statusPill(INVOICE_STATUS, invoice.status)}
                      <strong>{money(invoice.total)}</strong>
                      {invoice.balance > 0 && <small>Saldo {money(invoice.balance)}</small>}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </DrawerSection>

          <DrawerSection title="Historial de avance" icon={<TrendingUp size={17} />}>
            {detail.progress.length === 0 ? (
              <EmptyState label="Sin cambios de avance." />
            ) : (
              <ul className="timeline">
                {detail.progress.map((entry) => (
                  <li key={entry.id}>
                    <strong>
                      {entry.previousPercentage !== null ? `${Math.round(entry.previousPercentage)}% → ` : ""}
                      {Math.round(entry.progressPercentage)}%
                    </strong>
                    <small>{[entry.authorName, dateTime(entry.createdAt)].filter(Boolean).join(" · ")}</small>
                    {entry.notes && <p>{entry.notes}</p>}
                  </li>
                ))}
              </ul>
            )}
          </DrawerSection>

          <DrawerSection title="Acciones de soporte" icon={<HardHat size={17} />}>
            <SupportAction
              title="Cambiar el estado de la obra"
              description={`Estado actual: ${PROJECT_STATUS[project.status]?.label ?? project.status}. Úsalo para corregir un estado a pedido de la empresa o del cliente.`}
              buttonLabel="Cambiar estado"
              confirmLabel="Confirmar cambio"
              onConfirm={async (reason) => {
                if (!nextStatus) throw new Error("Elige el nuevo estado.");
                await setProjectStatus(project.id, nextStatus, reason);
                setNotice(`Estado cambiado a «${PROJECT_STATUS[nextStatus]?.label ?? nextStatus}». Quedó registrado en la auditoría.`);
                setNextStatus("");
                reload();
                onChanged();
              }}
            >
              <label className="field">
                <span>Nuevo estado</span>
                <select value={nextStatus} onChange={(event) => setNextStatus(event.target.value)}>
                  <option value="">Elige un estado...</option>
                  {Object.entries(PROJECT_STATUS)
                    .filter(([value]) => value !== project.status)
                    .map(([value, entry]) => (
                      <option key={value} value={value}>
                        {entry.label}
                      </option>
                    ))}
                </select>
              </label>
            </SupportAction>
          </DrawerSection>

          {detail.activities.length > 0 && (
            <DrawerSection title="Agenda" icon={<CalendarDays size={17} />}>
              <ul className="drawer-list">
                {detail.activities.map((activity) => (
                  <li key={activity.id}>
                    <div>
                      <strong>{activity.title}</strong>
                      <small>{[activity.type, activity.status].filter(Boolean).join(" · ")}</small>
                    </div>
                    <span className="muted-text">
                      {day(activity.date)} {activity.startTime ?? ""}
                    </span>
                  </li>
                ))}
              </ul>
            </DrawerSection>
          )}
        </>
      )}
    </Drawer>
  );
}
