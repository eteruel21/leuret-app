export type PriceAlertKind =
  | "big_change"
  | "no_price"
  | "negative_margin"
  | "low_margin"
  | "stale";

export type PriceAlertSeverity = "high" | "medium" | "low";

export type PriceAlertRow = {
  id: string;
  code: string | null;
  name: string;
  item_type: string;
  category_name: string | null;
  unit_symbol: string | null;
  default_unit_cost: number | string;
  default_sale_price: number | string;
  updated_at: string | Date;
  window_from_cost: number | string | null;
  window_changes: number | string | null;
  last_price_change: string | Date | null;
};

export type PriceAlert = {
  itemId: string;
  code: string | null;
  name: string;
  itemType: string;
  categoryName: string | null;
  unitSymbol: string | null;
  unitCost: number;
  salePrice: number;
  kind: PriceAlertKind;
  severity: PriceAlertSeverity;
  message: string;
  changePercentage: number | null;
  lastPriceChange: string | null;
};

export type PriceAlertOptions = {
  changeThreshold: number;
  windowDays: number;
  staleDays: number;
  minMargin: number;
  now?: Date;
};

const SEVERITY_ORDER: Record<PriceAlertSeverity, number> = {
  high: 0,
  medium: 1,
  low: 2
};

function toNumber(value: number | string | null | undefined) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function toIso(value: string | Date | null | undefined) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function round(value: number, digits = 1) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

/**
 * Clasifica los ítems del catálogo global en alertas. Un ítem puede generar
 * varias alertas (por ejemplo, cambio fuerte y margen negativo).
 */
export function classifyPriceAlerts(
  rows: PriceAlertRow[],
  options: PriceAlertOptions
): PriceAlert[] {
  const now = options.now ?? new Date();
  const staleLimit = now.getTime() - options.staleDays * 86_400_000;
  const alerts: PriceAlert[] = [];

  for (const row of rows) {
    const unitCost = toNumber(row.default_unit_cost);
    const salePrice = toNumber(row.default_sale_price);
    const lastChange = toIso(row.last_price_change) ?? toIso(row.updated_at);

    const base = {
      itemId: row.id,
      code: row.code,
      name: row.name,
      itemType: row.item_type,
      categoryName: row.category_name,
      unitSymbol: row.unit_symbol,
      unitCost,
      salePrice,
      lastPriceChange: lastChange
    };

    if (unitCost <= 0 && salePrice <= 0) {
      alerts.push({
        ...base,
        kind: "no_price",
        severity: "high",
        message: "Sin costo ni precio de venta.",
        changePercentage: null
      });
      continue;
    }

    const fromCost = toNumber(row.window_from_cost);
    if (fromCost > 0 && toNumber(row.window_changes) > 0) {
      const change = round(((unitCost - fromCost) / fromCost) * 100);
      if (Math.abs(change) >= options.changeThreshold) {
        alerts.push({
          ...base,
          kind: "big_change",
          severity: Math.abs(change) >= options.changeThreshold * 2 ? "high" : "medium",
          message: `El costo ${change > 0 ? "subió" : "bajó"} ${Math.abs(change)}% en ${options.windowDays} días.`,
          changePercentage: change
        });
      }
    }

    if (salePrice > 0 && unitCost > 0) {
      const margin = round(((salePrice - unitCost) / salePrice) * 100);
      if (salePrice < unitCost) {
        alerts.push({
          ...base,
          kind: "negative_margin",
          severity: "high",
          message: `El precio de venta está por debajo del costo (margen ${margin}%).`,
          changePercentage: null
        });
      } else if (margin < options.minMargin) {
        alerts.push({
          ...base,
          kind: "low_margin",
          severity: "low",
          message: `Margen de ${margin}%, por debajo del ${options.minMargin}%.`,
          changePercentage: null
        });
      }
    }

    if (lastChange && new Date(lastChange).getTime() < staleLimit) {
      const days = Math.floor((now.getTime() - new Date(lastChange).getTime()) / 86_400_000);
      alerts.push({
        ...base,
        kind: "stale",
        severity: "low",
        message: `Sin actualizar desde hace ${days} días.`,
        changePercentage: null
      });
    }
  }

  return alerts.sort(
    (a, b) =>
      SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] ||
      Math.abs(b.changePercentage ?? 0) - Math.abs(a.changePercentage ?? 0) ||
      a.name.localeCompare(b.name, "es")
  );
}
