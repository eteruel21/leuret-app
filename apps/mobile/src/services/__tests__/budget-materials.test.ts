import { describe, expect, it } from "vitest";
import {
  buildShoppingList,
  compactMaterials,
  material,
  rankCatalogMatches,
  shoppingListText,
  withAddedUnitCosts,
} from "../budget-materials";
import type { BudgetItem } from "../../types/budget";

function item(overrides: Partial<BudgetItem>): BudgetItem {
  return {
    id: overrides.id ?? Math.random().toString(36),
    company_id: "c",
    budget_id: "b",
    section_id: null,
    catalog_item_id: null,
    platform_catalog_item_id: null,
    calculation_run_id: null,
    item_type: "service",
    description: "Partida",
    unit_name: "m²",
    quantity: 1,
    unit_cost: 0,
    unit_price: 0,
    discount_percentage: 0,
    subtotal: 0,
    taxable: true,
    sort_order: 0,
    notes: null,
    created_at: "",
    updated_at: "",
    ...overrides,
  };
}

describe("material", () => {
  it("descarta cantidades no positivas y costos vacíos", () => {
    expect(material("Cemento", 0, "saco", 10)).toBeNull();
    expect(material("Cemento", 3, "saco", 0)).toEqual({
      name: "Cemento",
      quantity: 3,
      unit: "saco",
    });
    expect(compactMaterials([null, false, material("Arena", 1, "m³", 25)])).toHaveLength(1);
  });
});

describe("buildShoppingList", () => {
  it("suma materiales iguales de varias partidas y omite la mano de obra", () => {
    const list = buildShoppingList([
      item({
        description: "Concreto losa",
        materials: [
          { name: "Cemento", quantity: 10, unit: "saco", cost: 85 },
          { name: "Arena", quantity: 0.5, unit: "m³", cost: 15 },
        ],
      }),
      item({
        description: "Muro de bloques",
        materials: [
          { name: "cemento", quantity: 4, unit: "Saco", cost: 34 },
          { name: "Bloque", quantity: 120, unit: "und." },
        ],
      }),
      item({ item_type: "labor", description: "Albañil", quantity: 16 }),
      item({
        item_type: "material",
        description: "Varilla 1/2",
        unit_name: "und.",
        quantity: 20,
        unit_cost: 8.5,
      }),
      item({ description: "Instalación sin desglose", notes: "a destajo" }),
    ]);

    const cement = list.lines.find((line) => line.name === "Cemento");
    expect(cement?.quantity).toBe(14);
    expect(cement?.cost).toBe(119);
    expect(cement?.sources).toEqual(["Concreto losa", "Muro de bloques"]);
    expect(list.lines.find((line) => line.name === "Varilla 1/2")?.cost).toBe(170);
    expect(list.lines.some((line) => line.name === "Albañil")).toBe(false);
    expect(list.unbrokenItems.map((entry) => entry.description)).toEqual([
      "Instalación sin desglose",
    ]);
    expect(list.knownCost).toBe(304);
    expect(list.linesWithoutCost).toBe(1);
  });

  it("genera un texto para compartir", () => {
    const list = buildShoppingList([
      item({ materials: [{ name: "Pintura", quantity: 6, unit: "gal", cost: 120 }] }),
    ]);
    const text = shoppingListText(list, {
      title: "P-001",
      formatMoney: (value) => `B/.${value.toFixed(2)}`,
    });
    expect(text).toContain("• 6 gal — Pintura (B/.120.00)");
    expect(text).toContain("Costo estimado: B/.120.00");
  });
});

describe("precios agregados en la lista de compras", () => {
  const catalog = [
    { id: "1", name: "Boquilla (fragua) para cerámica y porcelanato 5 kg (bolsa)", item_type: "material" },
    { id: "2", name: "Cemento Portland 42.5 kg (saco)", item_type: "material" },
    { id: "3", name: "Mano de obra de colocación de cerámica o porcelanato (m²)", item_type: "labor" },
    { id: "4", name: "Cerámica de piso 60 x 60 cm (m²)", item_type: "material" },
  ];

  it("sugiere los insumos con más palabras en común y deja fuera la mano de obra", () => {
    const ranked = rankCatalogMatches("Boquilla para cerámica", catalog);
    expect(ranked.map((entry) => entry.id)).toEqual(["1", "4"]);
  });

  it("con búsqueda filtra por el texto escrito", () => {
    expect(rankCatalogMatches("Boquilla", catalog, "portland").map((entry) => entry.id)).toEqual(["2"]);
  });

  it("aplica el costo agregado solo a las líneas sin costo", () => {
    const list = buildShoppingList([
      item({ description: "Piso", item_type: "service", materials: [
        { name: "Boquilla", quantity: 3, unit: "bolsa" },
        { name: "Cerámica", quantity: 10, unit: "m²", cost: 99.9 },
      ] }),
    ]);
    const boquilla = list.lines.find((line) => line.name === "Boquilla")!;
    const priced = withAddedUnitCosts(list, { [boquilla.key]: 4.5 });

    expect(priced.lines.find((line) => line.name === "Boquilla")?.cost).toBe(13.5);
    expect(priced.knownCost).toBe(113.4);
    expect(priced.linesWithoutCost).toBe(0);
  });
});
