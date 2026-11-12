import { describe, expect, it } from "vitest";

import { buildCalculationPayload, readCalculationState } from "../saved-calculation";

const line = {
  itemType: "service" as const,
  description: "Pintura de paredes (2 manos)",
  unitName: "m²",
  quantity: 40,
  unitCost: 3.2,
  unitPrice: 4.5,
  taxable: true,
};

describe("saved calculation payload", () => {
  it("guarda el estado, la partida y el total redondeado", () => {
    const payload = buildCalculationPayload({ state: { form: { area: "40" }, primer: true }, line, totalCost: 180.005 });
    expect(payload.inputData).toEqual({ version: 1, state: { form: { area: "40" }, primer: true } });
    expect(payload.resultsData.lineItems).toEqual([line]);
    expect(payload.totalCost).toBe(180.01);
  });

  it("un total inválido o negativo se guarda como 0", () => {
    expect(buildCalculationPayload({ state: {}, line, totalCost: Number.NaN }).totalCost).toBe(0);
    expect(buildCalculationPayload({ state: {}, line, totalCost: -3 }).totalCost).toBe(0);
  });

  it("lee el estado guardado y rechaza formatos desconocidos", () => {
    expect(readCalculationState({ version: 1, state: { primer: false } })).toEqual({ primer: false });
    expect(readCalculationState({})).toBeNull();
    expect(readCalculationState({ state: [1, 2] })).toBeNull();
    expect(readCalculationState(null)).toBeNull();
  });
});
