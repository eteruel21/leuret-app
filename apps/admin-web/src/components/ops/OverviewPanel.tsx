import { useCallback, useEffect, useState } from "react";
import { Building2, FileText, HardHat, Receipt, RefreshCw } from "lucide-react";

import { BUDGET_STATUS, PROJECT_STATUS, type AdminOverview, dateTime, loadOverview, money } from "../../operations-data";
import { errorMessage } from "../../utils/helpers";
import { AlertBanner } from "../CommonUI";
import { KpiCard, LoadingBlock, MonthlyColumns, StatusBars } from "./OpsUI";
import type { OpsNavigate } from "./navigation";

/** Panorama de la operación de todas las empresas: cobros, obras y presupuestos. */
export function OverviewPanel({ onNavigate }: { onNavigate: OpsNavigate }) {
  const [overview, setOverview] = useState<AdminOverview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setOverview(await loadOverview());
    } catch (loadError) {
      setError(errorMessage(loadError));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (!overview) {
    return error ? <AlertBanner message={`No se pudo cargar el panorama operativo: ${error}`} onClose={() => setError(null)} /> : <LoadingBlock label="Calculando panorama operativo..." />;
  }

  const { billing } = overview;
  const activeProjects = (overview.projectsByStatus.approved ?? 0) + (overview.projectsByStatus.in_progress ?? 0);
  const openBudgets =
    (overview.budgetsByStatus.draft ?? 0) + (overview.budgetsByStatus.sent ?? 0) + (overview.budgetsByStatus.viewed ?? 0);
  const decided = (overview.budgetsByStatus.approved ?? 0) + (overview.budgetsByStatus.rejected ?? 0);
  const approvalRate = decided ? Math.round(((overview.budgetsByStatus.approved ?? 0) / decided) * 100) : null;
  const collectedThisYear = overview.monthlyCollected.reduce((sum, entry) => sum + entry.collected, 0);

  return (
    <>
      {error && <AlertBanner message={error} onClose={() => setError(null)} />}

      <div className="overview-heading">
        <h2>Operación de la plataforma</h2>
        <span>
          Actualizado {dateTime(overview.generatedAt)}
          <button className="icon-button icon-button-small" type="button" onClick={() => void load()} disabled={loading} aria-label="Actualizar panorama">
            <RefreshCw size={14} className={loading ? "spin" : undefined} />
          </button>
        </span>
      </div>

      <div className="stats-grid">
        <KpiCard
          label="Cobrado"
          value={money(billing.collectedTotal)}
          detail={`${money(collectedThisYear)} en los últimos 12 meses`}
          tone="success"
          onClick={() => onNavigate({ tab: "invoices", status: "paid" })}
        />
        <KpiCard
          label="Por cobrar"
          value={money(billing.outstandingTotal)}
          detail={`${billing.issuedCount} facturas emitidas · ${money(billing.issuedTotal)}`}
          tone="info"
          onClick={() => onNavigate({ tab: "invoices" })}
        />
        <KpiCard
          label="Vencido"
          value={money(billing.overdueTotal)}
          detail={`${billing.overdueCount} factura${billing.overdueCount === 1 ? "" : "s"} con saldo vencido`}
          tone={billing.overdueCount ? "danger" : "neutral"}
          onClick={() => onNavigate({ tab: "invoices", status: "overdue_real" })}
        />
        <KpiCard
          label="Obras activas"
          value={activeProjects}
          detail={`${overview.tasks.openCount} tareas abiertas · ${overview.tasks.overdueCount} vencidas`}
          tone={overview.tasks.overdueCount ? "warning" : "neutral"}
          onClick={() => onNavigate({ tab: "projects", status: "in_progress" })}
        />
      </div>

      <div className="overview-grid">
        <section className="data-card">
          <div className="card-heading">
            <Receipt size={17} />
            <h3>Cobros por mes</h3>
          </div>
          <MonthlyColumns data={overview.monthlyCollected} format={(value) => money(value)} />
        </section>

        <section className="data-card">
          <div className="card-heading">
            <Building2 size={17} />
            <h3>Empresas con más cobros</h3>
          </div>
          {overview.topCompanies.length === 0 ? (
            <p className="muted-text">Todavía no hay pagos registrados.</p>
          ) : (
            <ol className="ranking">
              {overview.topCompanies.map((company) => (
                <li key={company.id}>
                  <button type="button" onClick={() => onNavigate({ tab: "companies", id: company.id })}>
                    <span>{company.name}</span>
                    <small>{company.paidInvoices} factura{company.paidInvoices === 1 ? "" : "s"} cobrada{company.paidInvoices === 1 ? "" : "s"}</small>
                    <strong>{money(company.collected)}</strong>
                  </button>
                </li>
              ))}
            </ol>
          )}
        </section>

        <section className="data-card">
          <div className="card-heading">
            <HardHat size={17} />
            <h3>Obras por estado</h3>
          </div>
          <StatusBars
            counts={overview.projectsByStatus}
            labels={PROJECT_STATUS}
            onSelect={(status) => onNavigate({ tab: "projects", status })}
          />
        </section>

        <section className="data-card">
          <div className="card-heading">
            <FileText size={17} />
            <h3>Presupuestos por estado</h3>
            <span className="card-heading-aside">
              {openBudgets} en curso{approvalRate !== null ? ` · ${approvalRate}% aprobados` : ""}
            </span>
          </div>
          <StatusBars
            counts={overview.budgetsByStatus}
            labels={BUDGET_STATUS}
            onSelect={(status) => onNavigate({ tab: "budgets", status })}
          />
        </section>
      </div>
    </>
  );
}
