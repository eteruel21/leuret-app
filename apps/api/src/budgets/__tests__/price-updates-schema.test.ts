import assert from "node:assert/strict";
import { test } from "vitest";

import { applyPriceUpdatesSchema } from "../schemas.js";

const companyId = "00000000-0000-4000-8000-000000000001";
const itemId = "00000000-0000-4000-8000-000000000002";

test("valida la actualización de precios de partidas", () => {
  assert.equal(applyPriceUpdatesSchema.safeParse({ companyId, itemIds: [itemId] }).success, true);
  assert.equal(applyPriceUpdatesSchema.safeParse({ companyId, itemIds: [] }).success, false);
  assert.equal(applyPriceUpdatesSchema.safeParse({ companyId, itemIds: ["no-uuid"] }).success, false);
  assert.equal(applyPriceUpdatesSchema.safeParse({ itemIds: [itemId] }).success, false);
});
