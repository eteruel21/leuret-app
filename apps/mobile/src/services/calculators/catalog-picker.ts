import type { CatalogItemType } from "../../types/catalog";

export type CalculatorCatalogTarget =
  | "cement"
  | "sand"
  | "gravel"
  | "block"
  | "labor"
  | "masonryLabor"
  | "plasterLabor";

export type CalculatorCatalogEntry = {
  name: string;
  sku?: string | null;
  item_type: CatalogItemType;
  category?: { name: string } | null;
};

function normalize(value: string): string {
  return value.toLocaleLowerCase("es")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

function matchesTarget(item: CalculatorCatalogEntry, target: CalculatorCatalogTarget): boolean {
  const name = normalize(item.name);
  const isLabor = target === "labor" || target === "masonryLabor" || target === "plasterLabor";

  // Un precio de una partida de obra incluye insumos distintos de un material.
  // No se debe utilizar una partida de servicio como precio unitario de cemento o arena.
  if (isLabor) {
    if (item.item_type !== "labor") return false;
  } else if (item.item_type !== "material") {
    return false;
  }

  switch (target) {
    case "cement":
      return /cemento|portland|\bcement\b/.test(name);
    case "sand":
      return /arena|\bsand\b/.test(name);
    case "gravel":
      return /gravilla|\bgrava\b|piedra triturada|agregado grueso|\bripio\b/.test(name);
    case "block":
      return /bloque|\bblock\b/.test(name);
    case "labor":
      return /concreto|hormigon|vaciado|colado|fundido|mezcla/.test(name);
    case "masonryLabor":
      return /bloque|mamposteria/.test(name);
    case "plasterLabor":
      return /repello|enlucido|panete/.test(name);
  }
}

export function filterCalculatorCatalogItems<T extends CalculatorCatalogEntry>(
  items: T[],
  target: CalculatorCatalogTarget,
  search: string
): T[] {
  const query = normalize(search);
  return items.filter((item) => {
    if (!matchesTarget(item, target)) return false;
    if (!query) return true;

    return [
      item.name,
      item.sku ?? "",
      item.category?.name ?? ""
    ].some((value) => normalize(value).includes(query));
  });
}
