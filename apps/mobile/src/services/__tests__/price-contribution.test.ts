import { describe, expect, it } from "vitest";
import { preparePriceContribution } from "../price-contribution";

describe("aporte de precio", () => {
  it("exige un costo mayor que cero y acepta coma decimal", () => {
    expect(preparePriceContribution({ unitCost: "", salePrice: "" })).toEqual({
      error: "Escribe lo que te cuesta el insumo (mayor que cero).",
    });
    expect(preparePriceContribution({ unitCost: "4,505", salePrice: "" })).toEqual({
      unitCost: 4.51,
      salePrice: null,
    });
  });

  it("la venta es opcional, pero si se escribe debe ser válida", () => {
    expect(preparePriceContribution({ unitCost: "10", salePrice: "13.5" })).toEqual({
      unitCost: 10,
      salePrice: 13.5,
    });
    expect(preparePriceContribution({ unitCost: "10", salePrice: "0" })).toEqual({
      error: "El precio de venta debe ser mayor que cero, o déjalo vacío.",
    });
    expect(preparePriceContribution({ unitCost: "2000000", salePrice: "" })).toEqual({
      error: "El precio es demasiado alto.",
    });
  });
});
