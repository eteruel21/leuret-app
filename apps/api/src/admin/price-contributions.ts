export type PriceContributionStatus = "pending" | "approved" | "rejected";

export type PriceContributionRow = {
  id: string;
  catalog_item_id: string;
  unit_cost: number | string;
  store_name: string | null;
  notes: string | null;
  region_code: string | null;
  status: PriceContributionStatus;
  created_at: string | Date;
  reviewed_at: string | Date | null;
  review_notes: string | null;
  contributor_name: string | null;
  item_name: string;
  item_code: string | null;
  item_type: string;
  category_name: string | null;
  unit_symbol: string | null;
  current_unit_cost: number | string;
  current_sale_price: number | string;
};

export type PriceContributionEntry = {
  id: string;
  unitCost: number;
  storeName: string | null;
  notes: string | null;
  regionCode: string | null;
  status: PriceContributionStatus;
  contributorName: string | null;
  createdAt: string;
  reviewedAt: string | null;
  reviewNotes: string | null;
};

export type PriceContributionGroup = {
  itemId: string;
  name: string;
  code: string | null;
  itemType: string;
  categoryName: string | null;
  unitSymbol: string | null;
  currentUnitCost: number;
  currentSalePrice: number;
  /** Margen actual del insumo (venta / costo); 1.35 si no tiene precio. */
  currentMarkup: number;
  count: number;
  medianCost: number;
  minCost: number;
  maxCost: number;
  /** Venta sugerida: mediana × margen actual. */
  suggestedSalePrice: number;
  /** Diferencia de la mediana contra el costo actual, en %; null si no tenía precio. */
  changePercentage: number | null;
  /** true si los aportes difieren mucho entre sí (máximo > 1.5 × mínimo). */
  widespread: boolean;
  stores: string[];
  latestAt: string;
  entries: PriceContributionEntry[];
};

const DEFAULT_MARKUP = 1.35;

function toNumber(value: number | string | null | undefined): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function toIso(value: string | Date | null): string | null {
  if (value === null) return null;
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function median(values: number[]): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  const value = sorted.length % 2
    ? sorted[middle]!
    : (sorted[middle - 1]! + sorted[middle]!) / 2;
  return round2(value);
}

/**
 * Agrupa los aportes por insumo y calcula lo que el superadministrador
 * necesita para decidir: cuántos aportes hay, mediana, mínimo, máximo,
 * tiendas y la venta sugerida con el margen que ya tiene el insumo.
 * Ordena primero los insumos sin precio y luego los que tienen más aportes.
 */
export function groupPriceContributions(rows: PriceContributionRow[]): PriceContributionGroup[] {
  const groups = new Map<string, PriceContributionRow[]>();
  for (const row of rows) {
    const list = groups.get(row.catalog_item_id) ?? [];
    list.push(row);
    groups.set(row.catalog_item_id, list);
  }

  const result: PriceContributionGroup[] = [];
  for (const [itemId, list] of groups) {
    const first = list[0]!;
    const costs = list.map((row) => toNumber(row.unit_cost)).filter((cost) => cost > 0);
    const currentUnitCost = toNumber(first.current_unit_cost);
    const currentSalePrice = toNumber(first.current_sale_price);
    const currentMarkup = currentUnitCost > 0 && currentSalePrice > 0
      ? currentSalePrice / currentUnitCost
      : DEFAULT_MARKUP;
    const medianCost = median(costs);
    const minCost = costs.length ? Math.min(...costs) : 0;
    const maxCost = costs.length ? Math.max(...costs) : 0;
    const entries = list
      .map<PriceContributionEntry>((row) => ({
        id: row.id,
        unitCost: toNumber(row.unit_cost),
        storeName: row.store_name,
        notes: row.notes,
        regionCode: row.region_code,
        status: row.status,
        contributorName: row.contributor_name,
        createdAt: toIso(row.created_at)!,
        reviewedAt: toIso(row.reviewed_at),
        reviewNotes: row.review_notes,
      }))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

    result.push({
      itemId,
      name: first.item_name,
      code: first.item_code,
      itemType: first.item_type,
      categoryName: first.category_name,
      unitSymbol: first.unit_symbol,
      currentUnitCost,
      currentSalePrice,
      currentMarkup: Math.round(currentMarkup * 100) / 100,
      count: entries.length,
      medianCost,
      minCost,
      maxCost,
      suggestedSalePrice: round2(medianCost * currentMarkup),
      changePercentage: currentUnitCost > 0
        ? Math.round(((medianCost - currentUnitCost) / currentUnitCost) * 1000) / 10
        : null,
      widespread: minCost > 0 && maxCost > minCost * 1.5,
      stores: [...new Set(entries.map((entry) => entry.storeName).filter((name): name is string => Boolean(name)))],
      latestAt: entries[0]!.createdAt,
      entries,
    });
  }

  return result.sort((a, b) => {
    const aMissing = a.currentUnitCost <= 0 ? 0 : 1;
    const bMissing = b.currentUnitCost <= 0 ? 0 : 1;
    return aMissing - bMissing || b.count - a.count || b.latestAt.localeCompare(a.latestAt);
  });
}
