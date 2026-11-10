import assert from "node:assert/strict";
import { test, vi } from "vitest";

vi.mock("../repository.js", () => ({}));

const { redactProjectFinancials } = await import("../services.js");

const project = { id: "p1", name: "Casa Pérez", budget_estimate: 12000, contract_value: 15000 };

test("Obra: owner, admin, supervisor y ventas ven los montos", () => {
  for (const role of ["owner", "admin", "supervisor", "sales"]) {
    assert.equal(redactProjectFinancials(project, role).contract_value, 15000);
  }
});

test("Obra: presupuestista y equipo de campo la ven sin montos", () => {
  for (const role of ["estimator", "member", null]) {
    const visible = redactProjectFinancials(project, role);
    assert.equal(visible.contract_value, null);
    assert.equal(visible.budget_estimate, null);
    assert.equal(visible.financials_hidden, true);
    assert.equal(visible.name, "Casa Pérez");
  }
});
