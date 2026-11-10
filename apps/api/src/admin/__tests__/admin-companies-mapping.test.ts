import assert from "node:assert/strict";
import { test } from "vitest";

import { mapAdminCompanyRow } from "../companies-services.js";

test("Panel de empresas: convierte conteos y fechas de la base", () => {
  const company = mapAdminCompanyRow({
    id: "c1",
    name: "Mi Empresa",
    legal_name: null,
    tax_id: "8-123-456",
    active: true,
    created_at: new Date("2026-11-01T12:00:00Z"),
    owner_name: "Dueña Uno",
    owner_email: "owner@test.com",
    member_count: "3",
    active_member_count: 2,
    project_count: 2,
    active_project_count: 1,
    client_count: 1,
    last_activity_at: "2026-11-09T01:00:00.000Z"
  });

  assert.equal(company.memberCount, 3);
  assert.equal(company.activeMemberCount, 2);
  assert.equal(company.createdAt, "2026-11-01T12:00:00.000Z");
  assert.equal(company.lastActivityAt, "2026-11-09T01:00:00.000Z");
  assert.equal(company.taxId, "8-123-456");
});

test("Panel de empresas: sin actividad ni propietario queda en null y ceros", () => {
  const company = mapAdminCompanyRow({ id: "c2", name: "Nueva", active: false });
  assert.equal(company.ownerName, null);
  assert.equal(company.projectCount, 0);
  assert.equal(company.lastActivityAt, null);
  assert.equal(company.active, false);
});

test("Suspender empresa: exige motivo, reactivar no", async () => {
  const { companyStatusSchema } = await import("../schemas.js");
  assert.equal(companyStatusSchema.safeParse({ active: false, reason: "" }).success, false);
  assert.equal(companyStatusSchema.safeParse({ active: false, reason: "Falta de pago" }).success, true);
  assert.equal(companyStatusSchema.safeParse({ active: true }).success, true);
  assert.equal(companyStatusSchema.safeParse({ active: "no" }).success, false);
});
