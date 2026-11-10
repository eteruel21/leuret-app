import type { CatalogItemType } from "../../types/catalog";

/**
 * Reglas compartidas para elegir precios del catálogo dentro de las calculadoras.
 *
 * - Un precio de mano de obra solo puede salir de un concepto `labor`. Las
 *   partidas `service` (por ejemplo las 1,169 de la Contraloría) ya incluyen
 *   materiales y equipo; usarlas como mano de obra duplica el costo.
 * - Un precio de material solo puede salir de un concepto `material`.
 * - El campo de precio de la calculadora guarda el precio al cliente (venta).
 *   El costo real se recuerda aparte para que el presupuesto registre
 *   `unit_cost` y `unit_price` por separado.
 */

export type CalculatorPickerKind = "material" | "labor";

export type CalculatorPricedEntry = {
  name: string;
  sku?: string | null;
  item_type: CatalogItemType;
  unit_cost: number;
  sale_price: number;
  category?: { name: string } | null;
};

export type TrackedPrice = { price: number; cost: number };

export function normalizeCatalogText(value: string): string {
  return value
    .toLocaleLowerCase("es")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim();
}

function positive(value: number | null | undefined): number {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/** Precio que se cobra al cliente: venta si existe, si no el costo. */
export function catalogClientPrice(item: Pick<CalculatorPricedEntry, "unit_cost" | "sale_price">): number {
  return positive(item.sale_price) || positive(item.unit_cost);
}

/** Costo real del insumo: costo si existe, si no la venta. */
export function catalogUnitCost(item: Pick<CalculatorPricedEntry, "unit_cost" | "sale_price">): number {
  return positive(item.unit_cost) || positive(item.sale_price);
}

export function trackCatalogPrice(item: Pick<CalculatorPricedEntry, "unit_cost" | "sale_price">): TrackedPrice {
  return { price: catalogClientPrice(item), cost: catalogUnitCost(item) };
}

/**
 * Filtra y ordena los conceptos del catálogo para un campo de la calculadora.
 * Solo devuelve el tipo correcto; los que coinciden con las palabras clave van
 * primero, y el resto queda disponible por si el catálogo usa otro nombre.
 */
export function rankCalculatorCatalogItems<T extends CalculatorPricedEntry>(
  items: T[],
  kind: CalculatorPickerKind,
  keywords: RegExp | null,
  search = ""
): T[] {
  const query = normalizeCatalogText(search);
  const allowed = items.filter((item) => {
    if (item.item_type !== kind) return false;
    if (!query) return true;
    return [item.name, item.sku ?? "", item.category?.name ?? ""].some((value) =>
      normalizeCatalogText(value).includes(query)
    );
  });

  const score = (item: T) => (keywords && keywords.test(normalizeCatalogText(item.name)) ? 0 : 1);

  return allowed
    .map((item, index) => ({ item, index, rank: score(item) }))
    .sort((a, b) => a.rank - b.rank || a.index - b.index)
    .map(({ item }) => item);
}

/**
 * Devuelve una copia del formulario con el costo real en cada campo de precio
 * que vino del catálogo y que el usuario no modificó después.
 */
export function withCatalogCosts<F extends Record<string, string>>(
  form: F,
  tracked: Partial<Record<keyof F, TrackedPrice>>
): F {
  const next: F = { ...form };
  for (const key of Object.keys(tracked) as (keyof F)[]) {
    const entry = tracked[key];
    if (!entry) continue;
    const current = Number(String(form[key] ?? "").replace(",", ".").trim());
    if (Number.isFinite(current) && Math.abs(current - entry.price) < 0.005) {
      next[key] = String(entry.cost) as F[keyof F];
    }
  }
  return next;
}

/** Costo unitario para el presupuesto a partir del costo total calculado. */
export function budgetUnitCost(totalCost: number, quantity: number, fallback: number): number {
  if (!Number.isFinite(totalCost) || !Number.isFinite(quantity) || quantity <= 0) return fallback;
  return Math.round((totalCost / quantity) * 100) / 100;
}
