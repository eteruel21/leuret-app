import assert from "node:assert/strict";
import { test } from "vitest";

import { classifyPriceAlerts, type PriceAlertRow } from "../price-alerts.js";

const now = new Date("2026-11-10T12:00:00Z");
const options = { changeThreshold: 15, windowDays: 60, staleDays: 180, minMargin: 5, now };

function row(overrides: Partial<PriceAlertRow>): PriceAlertRow {
  return {
    id: overrides.id ?? "item",
    code: "code",
    name: "Ítem",
    item_type: "material",
    category_name: "General",
    unit_symbol: "und.",
    default_unit_cost: 10,
    default_sale_price: 13,
    updated_at: "2026-11-01T00:00:00Z",
    window_from_cost: null,
    window_changes: null,
    last_price_change: "2026-11-01T00:00:00Z",
    ...overrides
  };
}

test("detecta cambios fuertes de costo y su severidad", () => {
  const alerts = classifyPriceAlerts(
    [
      row({ id: "a", name: "Cable", default_unit_cost: "12.40", default_sale_price: 15, window_from_cost: "10", window_changes: "1" }),
      row({ id: "b", name: "Varilla", default_unit_cost: 14, default_sale_price: 18, window_from_cost: 10, window_changes: 2 }),
      row({ id: "c", name: "Arena", default_unit_cost: 10.5, window_from_cost: 10, window_changes: 1 })
    ],
    options
  );

  assert.deepEqual(
    alerts.map((alert) => [alert.itemId, alert.kind, alert.severity, alert.changePercentage]),
    [
      ["b", "big_change", "high", 40],
      ["a", "big_change", "medium", 24]
    ]
  );
});

test("marca ítems sin precio, con margen negativo, margen bajo y desactualizados", () => {
  const alerts = classifyPriceAlerts(
    [
      row({ id: "zero", name: "Sin precio", default_unit_cost: 0, default_sale_price: 0 }),
      row({ id: "neg", name: "Negativo", default_unit_cost: 12, default_sale_price: 10 }),
      row({ id: "low", name: "Bajo", default_unit_cost: 10, default_sale_price: 10.3 }),
      row({ id: "old", name: "Viejo", last_price_change: null, updated_at: "2026-01-01T00:00:00Z" })
    ],
    options
  );

  const kinds = Object.fromEntries(alerts.map((alert) => [alert.itemId, alert.kind]));
  assert.deepEqual(kinds, { zero: "no_price", neg: "negative_margin", low: "low_margin", old: "stale" });
  assert.equal(alerts[0]?.severity, "high");
  assert.match(alerts.find((alert) => alert.itemId === "old")!.message, /313 días/);
});
