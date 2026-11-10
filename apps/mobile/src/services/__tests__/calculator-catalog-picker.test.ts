import { describe, expect, it } from "vitest";
import {
  filterCalculatorCatalogItems,
  type CalculatorCatalogEntry
} from "../calculators/catalog-picker";

const items: CalculatorCatalogEntry[] = [
  { name: "Cemento Portland 42.5 kg (saco)", item_type: "material", category: { name: "Cementos y morteros" } },
  { name: "Arena lavada para concreto (m³)", item_type: "material", category: { name: "Agregados" } },
  { name: "Piedra triturada para concreto (m³)", item_type: "material", category: { name: "Agregados" } },
  { name: "Bloque de concreto de 6 pulgadas", item_type: "material", category: { name: "Bloques" } },
  { name: "Mano de obra de colocación de concreto (m³)", item_type: "labor", category: { name: "Mano de obra" } },
  { name: "Mano de obra de colocación de bloques (m²)", item_type: "labor", category: { name: "Mano de obra" } },
  { name: "Mano de obra de repello (m²)", item_type: "labor", category: { name: "Mano de obra" } },
  { name: "PARED DE BLOQUES DE CEMENTO (SUMINISTRO E INSTALACIÓN)", item_type: "service", category: { name: "Mampostería" } }
];

describe("selector de insumos de las calculadoras", () => {
  it("selecciona cemento individual, sin tratar un servicio de mampostería como cemento", () => {
    expect(filterCalculatorCatalogItems(items, "cement", "").map((i) => i.name))
      .toEqual(["Cemento Portland 42.5 kg (saco)"]);
  });

  it("separa arena y piedra de cemento, bloques y servicios", () => {
    expect(filterCalculatorCatalogItems(items, "sand", "")).toHaveLength(1);
    expect(filterCalculatorCatalogItems(items, "gravel", "")).toHaveLength(1);
    expect(filterCalculatorCatalogItems(items, "block", "")).toHaveLength(1);
  });

  it("para mano de obra de concreto no incluye partidas de suministro e instalación", () => {
    expect(filterCalculatorCatalogItems(items, "labor", "").map((i) => i.name))
      .toEqual(["Mano de obra de colocación de concreto (m³)"]);
  });

  it("distingue mano de obra de bloques y repello", () => {
    expect(filterCalculatorCatalogItems(items, "masonryLabor", "").map((i) => i.name))
      .toEqual(["Mano de obra de colocación de bloques (m²)"]);
    expect(filterCalculatorCatalogItems(items, "plasterLabor", "").map((i) => i.name))
      .toEqual(["Mano de obra de repello (m²)"]);
  });

  it("busca por SKU, nombre o categoría sin sensibilidad a mayúsculas ni acentos", () => {
    const searchable = [{ name: "Áridos", sku: "ARENA-PAN-01", item_type: "material" as const, category: { name: "Agregados" } }];
    expect(filterCalculatorCatalogItems(searchable, "sand", "ARENA")).toHaveLength(0);
    expect(filterCalculatorCatalogItems(items, "cement", "PÓRTLAND")).toHaveLength(1);
    expect(filterCalculatorCatalogItems(items, "sand", "agregados")).toHaveLength(1);
    expect(filterCalculatorCatalogItems(items, "cement", "inexistente")).toEqual([]);
  });
});
