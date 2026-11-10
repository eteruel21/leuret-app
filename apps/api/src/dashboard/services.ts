import { findCompanyDashboardRepo } from "./repository.js";

type Row = Record<string, unknown>;

const toNumber = (value: unknown): number => {
  const parsed = typeof value === "number" ? value : Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
};

const toList = (value: unknown): Row[] => (Array.isArray(value) ? (value as Row[]) : []);

export type CompanyDashboard = ReturnType<typeof mapDashboardRow>;

/** Convierte la fila de la consulta en la respuesta pública (camelCase, números). */
export function mapDashboardRow(row: Row) {
  return {
    currencyCode: String(row.currency_code ?? "USD"),
    collections: {
      thisMonth: toNumber(row.collected_this_month),
      lastMonth: toNumber(row.collected_last_month),
    },
    receivables: {
      total: toNumber(row.receivable),
      overdueCount: toNumber(row.overdue_invoice_count),
      overdueAmount: toNumber(row.overdue_invoice_amount),
      overdueInvoices: toList(row.overdue_invoices).map((item) => ({
        id: String(item.id),
        invoiceNumber: (item.invoice_number as string | null) ?? null,
        clientName: (item.client_name as string | null) ?? null,
        dueDate: (item.due_date as string | null) ?? null,
        balanceDue: toNumber(item.balance_due),
      })),
    },
    budgets: {
      draftCount: toNumber(row.draft_budget_count),
      awaitingCount: toNumber(row.awaiting_budget_count),
      awaitingAmount: toNumber(row.awaiting_budget_amount),
      expiringSoonCount: toNumber(row.expiring_budget_count),
      approvedThisMonthCount: toNumber(row.approved_budget_count),
      approvedThisMonthAmount: toNumber(row.approved_budget_amount),
    },
    projects: {
      activeCount: toNumber(row.active_project_count),
      lateCount: toNumber(row.late_project_count),
      lateProjects: toList(row.late_projects).map((item) => ({
        id: String(item.id),
        name: String(item.name ?? ""),
        projectCode: (item.project_code as string | null) ?? null,
        estimatedEndDate: (item.estimated_end_date as string | null) ?? null,
        progressPercentage: toNumber(item.progress_percentage),
      })),
    },
    tasks: {
      overdueCount: toNumber(row.overdue_task_count),
    },
  };
}

export async function getCompanyDashboardService(userId: string, companyId: string) {
  const row = await findCompanyDashboardRepo(userId, companyId);
  return row ? mapDashboardRow(row) : null;
}
