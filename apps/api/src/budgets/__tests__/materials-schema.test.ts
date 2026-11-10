import assert from "node:assert/strict";
import { test } from "vitest";

import { createBudgetItemSchema } from "../schemas.js";

const base = {
  companyId: "00000000-0000-4000-8000-000000000001",
  itemType: "service",
  description: "Pintura de paredes",
  unitName: "m²",
  quantity: 40,
  unitPrice: 6.5
};

test("acepta partidas con desglose de materiales", () => {
  const parsed = createBudgetItemSchema.safeParse({
    ...base,
    materials: [
      { name: "Pintura", quantity: 6, unit: "gal", cost: 120.5 },
      { name: "Primer", quantity: 2, unit: "gal" }
    ]
  });

  assert.equal(parsed.success, true);
  assert.equal(parsed.success && parsed.data.materials?.length, 2);
});

test("las partidas sin materiales siguen siendo válidas", () => {
  assert.equal(createBudgetItemSchema.safeParse(base).success, true);
});

test("rechaza materiales inválidos", () => {
  assert.equal(
    createBudgetItemSchema.safeParse({
      ...base,
      materials: [{ name: "", quantity: 1, unit: "und." }]
    }).success,
    false
  );
  assert.equal(
    createBudgetItemSchema.safeParse({
      ...base,
      materials: [{ name: "Cemento", quantity: 0, unit: "saco" }]
    }).success,
    false
  );
  assert.equal(
    createBudgetItemSchema.safeParse({
      ...base,
      materials: Array.from({ length: 51 }, () => ({ name: "X", quantity: 1, unit: "und." }))
    }).success,
    false
  );
});
