import assert from "node:assert/strict";
import { test } from "vitest";

import { approvalRate, mapRoleDashboardRow } from "../role-services.js";

test("Inicio por rol: tasa de aprobación de los últimos 90 días", () => {
  assert.equal(approvalRate(3, 1), 75);
  assert.equal(approvalRate(0, 0), null);
  assert.equal(approvalRate(0, 2), 0);
});

test("Inicio por rol: convierte la fila en indicadores personales y de la empresa", () => {
  const dashboard = mapRoleDashboardRow({
    role: "estimator",
    currency_code: "USD",
    my_draft_count: 1,
    my_awaiting_count: 2,
    my_awaiting_amount: "1500",
    my_viewed_count: 1,
    my_approved_month_count: 1,
    my_approved_month_amount: 2000,
    my_approved_90: 1,
    my_rejected_90: 1,
    my_expiring_count: 1,
    company_awaiting_count: 2,
    company_awaiting_amount: 1500,
    company_expiring_count: 1,
    receivable: 1050,
    overdue_count: 1,
    overdue_amount: 700,
    collected_this_month: 500
  });

  assert.equal(dashboard.role, "estimator");
  assert.equal(dashboard.myBudgets.awaitingAmount, 1500);
  assert.equal(dashboard.myBudgets.approvalRate90Days, 50);
  assert.equal(dashboard.myBudgets.decided90Days, 2);
  assert.equal(dashboard.receivables.overdueAmount, 700);
  assert.equal(dashboard.receivables.collectedThisMonth, 500);
});
