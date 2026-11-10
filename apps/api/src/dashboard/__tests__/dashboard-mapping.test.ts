import assert from "node:assert/strict";
import { test } from "vitest";

import { mapDashboardRow } from "../services.js";

test("Inicio del dueño: convierte la fila de la base en números y camelCase", () => {
  const dashboard = mapDashboardRow({
    currency_code: "USD",
    collected_this_month: "500.00",
    collected_last_month: 100,
    receivable: 1050,
    overdue_invoice_count: 1,
    overdue_invoice_amount: 700,
    overdue_invoices: [
      { id: "f1", invoice_number: "F-1", client_name: "Ferretería Sol", due_date: "2026-10-15", balance_due: 700 }
    ],
    draft_budget_count: 1,
    awaiting_budget_count: 2,
    awaiting_budget_amount: 1500,
    expiring_budget_count: 1,
    approved_budget_count: 1,
    approved_budget_amount: 2000,
    active_project_count: 1,
    late_project_count: 1,
    late_projects: [
      { id: "p1", name: "Casa Pérez", project_code: "P-001", estimated_end_date: "2026-10-01", progress_percentage: 40 }
    ],
    overdue_task_count: 1
  });

  assert.equal(dashboard.collections.thisMonth, 500);
  assert.equal(dashboard.receivables.overdueInvoices[0]?.clientName, "Ferretería Sol");
  assert.equal(dashboard.projects.lateProjects[0]?.progressPercentage, 40);
  assert.equal(dashboard.budgets.awaitingAmount, 1500);
});

test("Inicio del dueño: valores vacíos o inválidos se vuelven cero y listas vacías", () => {
  const dashboard = mapDashboardRow({ collected_this_month: null, overdue_invoices: null, late_projects: "x" });
  assert.equal(dashboard.collections.thisMonth, 0);
  assert.deepEqual(dashboard.receivables.overdueInvoices, []);
  assert.deepEqual(dashboard.projects.lateProjects, []);
  assert.equal(dashboard.currencyCode, "USD");
});
