import assert from "node:assert/strict";
import { test, vi } from "vitest";

vi.mock("../repository.js", () => ({}));
vi.mock("../../notifications/event-service.js", () => ({ notifyBudgetDecision: vi.fn() }));

const { clientBudgetResponseError } = await import("../services.js");

test("respuesta del cliente: traduce los errores de la base a mensajes claros", () => {
  assert.deepEqual(clientBudgetResponseError(new Error("budget_response_not_pending")), {
    status: 409,
    message: "Este presupuesto ya fue respondido."
  });
  assert.equal(clientBudgetResponseError(new Error("budget_response_expired"))?.status, 409);
  assert.equal(clientBudgetResponseError(new Error("budget_response_reason_required"))?.status, 400);
  assert.equal(clientBudgetResponseError(new Error("budget_response_not_found"))?.status, 404);
});

test("respuesta del cliente: otros errores no se disfrazan", () => {
  assert.equal(clientBudgetResponseError(new Error("connection refused")), null);
  assert.equal(clientBudgetResponseError("texto"), null);
});
