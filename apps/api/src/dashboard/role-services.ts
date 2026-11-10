import { findRoleDashboardRepo } from "./role-repository.js";

type Row = Record<string, unknown>;

const num = (value: unknown): number => {
  const parsed = typeof value === "number" ? value : Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
};

/** Tasa de aprobación en porcentaje entero; null si no hubo decisiones. */
export function approvalRate(approved: number, rejected: number): number | null {
  const decided = approved + rejected;
  return decided > 0 ? Math.round((approved / decided) * 100) : null;
}

export function mapRoleDashboardRow(row: Row) {
  const approved90 = num(row.my_approved_90);
  const rejected90 = num(row.my_rejected_90);

  return {
    role: String(row.role ?? "member"),
    currencyCode: String(row.currency_code ?? "USD"),
    myBudgets: {
      draftCount: num(row.my_draft_count),
      awaitingCount: num(row.my_awaiting_count),
      awaitingAmount: num(row.my_awaiting_amount),
      viewedCount: num(row.my_viewed_count),
      approvedThisMonthCount: num(row.my_approved_month_count),
      approvedThisMonthAmount: num(row.my_approved_month_amount),
      expiringSoonCount: num(row.my_expiring_count),
      approvalRate90Days: approvalRate(approved90, rejected90),
      decided90Days: approved90 + rejected90
    },
    companyBudgets: {
      awaitingCount: num(row.company_awaiting_count),
      awaitingAmount: num(row.company_awaiting_amount),
      expiringSoonCount: num(row.company_expiring_count)
    },
    receivables: {
      total: num(row.receivable),
      overdueCount: num(row.overdue_count),
      overdueAmount: num(row.overdue_amount),
      collectedThisMonth: num(row.collected_this_month)
    }
  };
}

export async function getRoleDashboardService(userId: string, companyId: string) {
  const row = await findRoleDashboardRepo(userId, companyId);
  return row ? mapRoleDashboardRow(row) : null;
}
