import assert from "node:assert/strict";
import { test } from "vitest";

import { searchPattern } from "../operations-repository.js";
import {
  mapAdminAuditRow,
  mapAdminBudgetRow,
  mapAdminClientRow,
  mapAdminInvoiceRow,
  mapAdminProjectRow,
  toDay
} from "../operations-services.js";
import { adminListQuerySchema, revokeSessionsSchema } from "../schemas.js";

test("Centro de control: la búsqueda escapa comodines de ILIKE", () => {
  assert.equal(searchPattern(undefined), null);
  assert.equal(searchPattern("   "), null);
  assert.equal(searchPattern("50%_obra"), "%50\\%\\_obra%");
  assert.equal(searchPattern("a\\b"), "%a\\\\b%");
});

test("Centro de control: filtros con valores por defecto y límites", () => {
  const parsed = adminListQuerySchema.parse({});
  assert.equal(parsed.limit, 50);
  assert.equal(parsed.offset, 0);
  assert.equal(parsed.status, undefined);
  assert.equal(adminListQuerySchema.safeParse({ limit: "201" }).success, false);
  assert.equal(adminListQuerySchema.safeParse({ status: "paid; DROP" }).success, false);
  assert.equal(adminListQuerySchema.safeParse({ companyId: "no-uuid" }).success, false);
  assert.equal(adminListQuerySchema.parse({ status: "" }).status, undefined);
});

test("Centro de control: cerrar sesiones exige motivo", () => {
  assert.equal(revokeSessionsSchema.safeParse({ reason: "no" }).success, false);
  assert.equal(revokeSessionsSchema.safeParse({ reason: "Equipo robado" }).success, true);
});

test("Centro de control: fechas date se devuelven sin zona horaria", () => {
  assert.equal(toDay("2026-11-10"), "2026-11-10");
  assert.equal(toDay(new Date(2026, 10, 10)), "2026-11-10");
  assert.equal(toDay(null), null);
});

test("Centro de control: mapea obras con tareas y montos", () => {
  const project = mapAdminProjectRow({
    id: "p1",
    name: "Casa Costa del Este",
    project_code: "OBR-0001",
    status: "in_progress",
    progress_percentage: "42.5",
    start_date: "2026-10-01",
    contract_value: null,
    budget_estimate: "15000.00",
    company_id: "c1",
    company_name: "Constructora",
    client_name: "Ana Pérez",
    task_count: "4",
    open_task_count: 3,
    overdue_task_count: 1,
    total_count: 9
  });

  assert.equal(project.progressPercentage, 42.5);
  assert.equal(project.contractValue, null);
  assert.equal(project.budgetEstimate, 15000);
  assert.equal(project.taskCount, 4);
  assert.equal(project.overdueTaskCount, 1);
  assert.equal(project.startDate, "2026-10-01");
});

test("Centro de control: mapea presupuestos, facturas, clientes y auditoría", () => {
  const budget = mapAdminBudgetRow({ id: "b1", title: "Baño", status: "sent", total: "1250.5", past_validity: true });
  assert.equal(budget.total, 1250.5);
  assert.equal(budget.pastValidity, true);
  assert.equal(budget.version, 1);

  const invoice = mapAdminInvoiceRow({
    id: "i1",
    invoice_number: "FAC-0001",
    status: "issued",
    total: 1000,
    total_paid: "400",
    balance: "600",
    is_overdue: true,
    currency_code: null
  });
  assert.equal(invoice.balance, 600);
  assert.equal(invoice.totalPaid, 400);
  assert.equal(invoice.isOverdue, true);
  assert.equal(invoice.currencyCode, "USD");

  const client = mapAdminClientRow({ id: "k1", display_name: null, active: true, has_portal_access: false });
  assert.equal(client.displayName, "Sin nombre");

  const audit = mapAdminAuditRow({ id: "a1", action: "ADMIN_SESSIONS_REVOKED", target_type: "user", metadata: null });
  assert.deepEqual(audit.metadata, {});
  assert.equal(audit.companyId, null);
});
