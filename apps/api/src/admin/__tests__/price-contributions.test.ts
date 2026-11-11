import assert from "node:assert/strict";
import { test } from "vitest";

import { groupPriceContributions, median, type PriceContributionRow } from "../price-contributions.js";

function row(overrides: Partial<PriceContributionRow>): PriceContributionRow {
  return {
    id: overrides.id ?? "c",
    catalog_item_id: "item-a",
    unit_cost: 10,
    store_name: null,
    notes: null,
    region_code: "panama_metro",
    status: "pending",
    created_at: "2026-11-10T12:00:00Z",
    reviewed_at: null,
    review_notes: null,
    contributor_name: "Usuario",
    item_name: "Boquilla",
    item_code: "leuret:material:piso:boquilla",
    item_type: "material",
    category_name: "Pisos y revestimientos",
    unit_symbol: "saco",
    current_unit_cost: 0,
    current_sale_price: 0,
    ...overrides
  };
}

test("calcula la mediana con cantidad par e impar", () => {
  assert.equal(median([3, 1, 2]), 2);
  assert.equal(median([4, 1, 3, 2]), 2.5);
  assert.equal(median([]), 0);
});

test("agrupa por insumo con mediana, rango, tiendas y venta sugerida al 35 %", () => {
  const [group] = groupPriceContributions([
    row({ id: "1", unit_cost: "4.50", store_name: "Cochez", created_at: "2026-11-09T10:00:00Z" }),
    row({ id: "2", unit_cost: 5, store_name: "Novey", created_at: "2026-11-11T10:00:00Z" }),
    row({ id: "3", unit_cost: 5.5, store_name: "Cochez", created_at: "2026-11-10T10:00:00Z" })
  ]);

  assert.ok(group);
  assert.equal(group.count, 3);
  assert.equal(group.medianCost, 5);
  assert.equal(group.minCost, 4.5);
  assert.equal(group.maxCost, 5.5);
  assert.equal(group.suggestedSalePrice, 6.75);
  assert.equal(group.changePercentage, null);
  assert.equal(group.widespread, false);
  assert.deepEqual(group.stores, ["Novey", "Cochez"]);
  assert.equal(group.entries[0]?.id, "2");
  assert.equal(group.latestAt, "2026-11-11T10:00:00.000Z");
});

test("usa el margen actual del insumo y marca aportes muy dispersos", () => {
  const [group] = groupPriceContributions([
    row({ id: "1", unit_cost: 10, current_unit_cost: 8, current_sale_price: 12 }),
    row({ id: "2", unit_cost: 20, current_unit_cost: 8, current_sale_price: 12 })
  ]);

  assert.ok(group);
  assert.equal(group.medianCost, 15);
  assert.equal(group.suggestedSalePrice, 22.5);
  assert.equal(group.changePercentage, 87.5);
  assert.equal(group.widespread, true);
});

test("ordena primero los insumos sin precio y luego por cantidad de aportes", () => {
  const groups = groupPriceContributions([
    row({ id: "1", catalog_item_id: "con-precio", current_unit_cost: 3, current_sale_price: 4 }),
    row({ id: "2", catalog_item_id: "con-precio", current_unit_cost: 3, current_sale_price: 4 }),
    row({ id: "3", catalog_item_id: "sin-precio-uno" }),
    row({ id: "4", catalog_item_id: "sin-precio-dos" }),
    row({ id: "5", catalog_item_id: "sin-precio-dos" })
  ]);

  assert.deepEqual(groups.map((group) => group.itemId), ["sin-precio-dos", "sin-precio-uno", "con-precio"]);
});
