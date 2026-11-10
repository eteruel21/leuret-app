import { describe, expect, it } from "vitest";
import {
  budgetUnitCost,
  catalogClientPrice,
  catalogUnitCost,
  rankCalculatorCatalogItems,
  trackCatalogPrice,
  withCatalogCosts,
  type CalculatorPricedEntry
} from "../calculators/catalog-pricing";

const items: CalculatorPricedEntry[] = [
  { name: "PINTURA DE PAREDES INTERIORES (DOS MANOS)", item_type: "service", unit_cost: 4.1, sale_price: 5.54 },
  { name: "Pintor calificado (hora)", item_type: "labor", unit_cost: 8.47, sale_price: 11.43 },
  { name: "Ayudante general / peón (hora)", item_type: "labor", unit_cost: 6.61, sale_price: 8.92 },
  { name: "Sellador acrílico para concreto (galón)", item_type: "material", unit_cost: 19.99, sale_price: 26.99 },
  { name: "Pintura acrílica mate interior/exterior (galón)", item_type: "material", unit_cost: 27.99, sale_price: 37.79 },
  { name: "Cemento Portland 42.5 kg (saco)", item_type: "material", unit_cost: 8.4, sale_price: 0 }
];

describe("precios del catálogo en calculadoras", () => {
  it("la mano de obra nunca acepta partidas de servicio completas", () => {
    const labor = rankCalculatorCatalogItems(items, "labor", /pint/, "");
    expect(labor.map((i) => i.name)).toEqual(["Pintor calificado (hora)"]);
    expect(rankCalculatorCatalogItems(items, "labor", null, "").map((i) => i.item_type)).toEqual(["labor", "labor"]);
  });

  it("sin búsqueda solo muestra los materiales del campo", () => {
    const paint = rankCalculatorCatalogItems(items, "material", /pintura/, "");
    expect(paint.map((i) => i.name)).toEqual(["Pintura acrílica mate interior/exterior (galón)"]);
  });

  it("no mezcla materiales de construcción con equipos de sistemas especiales", () => {
    const catalog: CalculatorPricedEntry[] = [
      ...items,
      {
        name: "Cámara analógica bala 2 MP",
        item_type: "material",
        unit_cost: 24.35,
        sale_price: 32.87,
        category: { name: "Sistemas especiales y seguridad" }
      },
      {
        name: "Detector de movimiento PIR inalámbrico",
        item_type: "material",
        unit_cost: 34.46,
        sale_price: 46.52,
        category: { name: "Sistemas especiales y seguridad" }
      }
    ];
    expect(rankCalculatorCatalogItems(catalog, "material", /camara/, "").map((i) => i.name)).toEqual([
      "Cámara analógica bala 2 MP"
    ]);
    expect(rankCalculatorCatalogItems(catalog, "material", /camara/, "", /sistemas especiales/).map((i) => i.name)).toEqual([
      "Cámara analógica bala 2 MP",
      "Detector de movimiento PIR inalámbrico"
    ]);
    expect(rankCalculatorCatalogItems(catalog, "material", /dvr|nvr/, "")).toEqual([]);
  });

  it("la búsqueda recorre todo el catálogo del tipo", () => {
    expect(rankCalculatorCatalogItems(items, "material", /pintura/, "cemento").map((i) => i.name)).toEqual([
      "Cemento Portland 42.5 kg (saco)"
    ]);
  });

  it("la búsqueda ignora acentos y mayúsculas", () => {
    expect(rankCalculatorCatalogItems(items, "material", null, "ACRÍLIC").map((i) => i.name)).toEqual([
      "Sellador acrílico para concreto (galón)",
      "Pintura acrílica mate interior/exterior (galón)"
    ]);
  });

  it("separa precio al cliente y costo real", () => {
    expect(catalogClientPrice(items[4])).toBe(37.79);
    expect(catalogUnitCost(items[4])).toBe(27.99);
    expect(catalogClientPrice(items[5])).toBe(8.4);
    expect(trackCatalogPrice(items[5])).toEqual({ price: 8.4, cost: 8.4 });
  });

  it("sustituye el costo solo en campos que el usuario no cambió", () => {
    const form = { paintPrice: "37.79", laborPrice: "12", coats: "2" };
    const costs = withCatalogCosts(form, {
      paintPrice: { price: 37.79, cost: 27.99 },
      laborPrice: { price: 11.43, cost: 8.47 }
    });
    expect(costs).toEqual({ paintPrice: "27.99", laborPrice: "12", coats: "2" });
  });

  it("calcula el costo unitario del presupuesto", () => {
    expect(budgetUnitCost(100, 8, 0)).toBe(12.5);
    expect(budgetUnitCost(100, 0, 3)).toBe(3);
  });
});
