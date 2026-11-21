import { describe, expect, it } from "vitest";

import { createClientBudgetSchema } from "../schemas.js";

const valid = {
  companyId: "c91f6c0a-c0f8-46ce-9428-37e393378cbd",
  clientId: "bdbbd527-f303-4967-8e04-86ed825b1011",
  title: "Pintura de paredes",
  item: { description: "Pintura de paredes", quantity: 39, unitName: "m²", unitPrice: 9.28 }
};

describe("nuevo presupuesto del cliente", () => {
  it("acepta una partida válida con los valores por defecto del presupuesto", () => {
    const parsed = createClientBudgetSchema.parse(valid);
    expect(parsed.item.itemType).toBe("manual");
    expect(parsed.item.taxable).toBe(true);
  });

  it("exige cliente, título y una partida con precio y cantidad válidos", () => {
    expect(createClientBudgetSchema.safeParse({ ...valid, clientId: "otro-cliente" }).success).toBe(false);
    expect(createClientBudgetSchema.safeParse({ ...valid, title: " " }).success).toBe(false);
    expect(createClientBudgetSchema.safeParse({ ...valid, item: { ...valid.item, quantity: 0 } }).success).toBe(false);
    expect(createClientBudgetSchema.safeParse({ ...valid, item: { ...valid.item, unitPrice: -1 } }).success).toBe(false);
  });
});
