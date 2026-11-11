import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { adminPool } from "../../db/test-db.js";
import { withUserTransaction } from "../../db/with-user-transaction.js";
import { submitPriceContributionRepo } from "../../catalog/repository.js";
import { groupPriceContributions } from "../price-contributions.js";
import {
  listPriceContributionRowsRepo,
  reviewPriceContributionsRepo
} from "../price-contributions-repository.js";

async function createActiveUser(email: string, role: "contractor" | "super_admin") {
  const result = await adminPool.query<{ id: string }>(
    `INSERT INTO app_auth.users (email, email_confirmed_at) VALUES ($1, now()) RETURNING id`,
    [email]
  );
  const id = result.rows[0]!.id;
  await adminPool.query(
    `UPDATE public.profiles SET active = true, approved_at = now(), role = $2::public.global_user_role WHERE id = $1`,
    [id, role]
  );
  return id;
}

async function createCatalogItem(code: string, name: string) {
  const result = await adminPool.query<{ id: string }>(
    `
      INSERT INTO public.platform_catalog_items (
        code, name, item_type, category_name, unit_name, unit_symbol,
        default_unit_cost, default_sale_price, default_waste_percentage, active
      )
      VALUES ($1, $2, 'material', 'Pisos y revestimientos', 'Bolsa', 'bolsa', 0, 0, 5, true)
      RETURNING id
    `,
    [code, name]
  );
  return result.rows[0]!.id;
}

async function effectivePrice(userId: string, itemId: string) {
  return withUserTransaction(userId, async (client) => {
    const result = await client.query<{ unit_cost: string; sale_price: string; has_override: boolean }>(
      `SELECT unit_cost, sale_price, has_override FROM public.effective_platform_catalog_prices WHERE id = $1`,
      [itemId]
    );
    return result.rows[0];
  });
}

/**
 * Cuenta los aportes que ve un usuario con el rol de la API. Los tests se
 * conectan como superusuario (que no aplica RLS), así que se cambia de rol
 * dentro de una transacción para probar las políticas.
 */
async function visibleContributionsAs(userId: string, itemId: string) {
  const client = await adminPool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SET LOCAL ROLE contractor_api");
    await client.query("SELECT set_config('app.user_id', $1, true)", [userId]);
    const result = await client.query<{ user_id: string }>(
      "SELECT user_id FROM public.catalog_price_contributions WHERE catalog_item_id = $1 AND status = 'pending'",
      [itemId]
    );
    await client.query("ROLLBACK");
    return result.rows.map((row) => row.user_id);
  } finally {
    client.release();
  }
}

describe("Aportes de precio de los usuarios al catálogo", () => {
  const suffix = Math.floor(Math.random() * 1_000_000);
  let superAdminId: string;
  let firstUserId: string;
  let secondUserId: string;
  let groutId: string;
  let spacerId: string;

  beforeAll(async () => {
    superAdminId = await createActiveUser(`aportes_admin_${suffix}@example.com`, "super_admin");
    firstUserId = await createActiveUser(`aportes_uno_${suffix}@example.com`, "contractor");
    secondUserId = await createActiveUser(`aportes_dos_${suffix}@example.com`, "contractor");
    groutId = await createCatalogItem(`test:aporte:boquilla:${suffix}`, `Boquilla de prueba ${suffix}`);
    spacerId = await createCatalogItem(`test:aporte:crucetas:${suffix}`, `Crucetas de prueba ${suffix}`);
  });

  afterAll(async () => {
    await adminPool.query(
      "DELETE FROM public.admin_audit_logs WHERE target_id = ANY($1::text[])",
      [[groutId, spacerId]]
    );
    await adminPool.query("DELETE FROM public.platform_catalog_items WHERE id = ANY($1::uuid[])", [[groutId, spacerId]]);
    await adminPool.query("DELETE FROM app_auth.users WHERE id = ANY($1::uuid[])", [
      [superAdminId, firstUserId, secondUserId]
    ]);
  });

  it("el usuario aporta un precio y lo usa de inmediato; repetir actualiza su aporte", async () => {
    const first = await submitPriceContributionRepo(firstUserId, groutId, {
      unitCost: 1.5,
      salePrice: null,
      storeName: "Cochez",
      notes: null
    });
    const second = await submitPriceContributionRepo(firstUserId, groutId, {
      unitCost: 1.8,
      salePrice: null,
      storeName: "Novey",
      notes: "Bolsa de 5 kg"
    });

    expect(second.contributionId).toBe(first.contributionId);
    expect(Number(second.item?.unit_cost)).toBe(1.8);
    expect(Number(second.item?.sale_price)).toBe(2.43);

    const own = await effectivePrice(firstUserId, groutId);
    expect(own?.has_override).toBe(true);
    const other = await effectivePrice(secondUserId, groutId);
    expect(Number(other?.unit_cost)).toBe(0);
  });

  it("rechaza precios que no son mayores que cero", async () => {
    await expect(
      submitPriceContributionRepo(secondUserId, groutId, { unitCost: 0, salePrice: null, storeName: null, notes: null })
    ).rejects.toThrow(/mayor que cero/);
  });

  it("cada usuario solo ve sus aportes y no puede aprobar", async () => {
    await submitPriceContributionRepo(secondUserId, groutId, {
      unitCost: 2.2,
      salePrice: 3,
      storeName: null,
      notes: null
    });

    expect(await visibleContributionsAs(firstUserId, groutId)).toEqual([firstUserId]);
    expect(await visibleContributionsAs(secondUserId, groutId)).toEqual([secondUserId]);
    expect((await visibleContributionsAs(superAdminId, groutId)).sort()).toEqual(
      [firstUserId, secondUserId].sort()
    );

    await expect(
      reviewPriceContributionsRepo(firstUserId, groutId, { action: "approve", unitCost: 2 })
    ).rejects.toThrow(/superadministrador/);
  });

  it("el superadministrador ve todos los aportes y al aprobar cambia el catálogo de todos", async () => {
    const rows = await listPriceContributionRowsRepo(superAdminId, "pending", String(suffix));
    const [group] = groupPriceContributions(rows).filter((entry) => entry.itemId === groutId);
    expect(group?.count).toBe(2);
    expect(group?.medianCost).toBe(2);

    const reviewed = await reviewPriceContributionsRepo(superAdminId, groutId, {
      action: "approve",
      unitCost: 2,
      salePrice: 2.7,
      reason: "Mediana de 2 aportes"
    });
    expect(reviewed).toBe(2);

    const item = await adminPool.query<{ default_unit_cost: string; default_sale_price: string }>(
      "SELECT default_unit_cost, default_sale_price FROM public.platform_catalog_items WHERE id = $1",
      [groutId]
    );
    expect(Number(item.rows[0]?.default_unit_cost)).toBe(2);
    expect(Number(item.rows[0]?.default_sale_price)).toBe(2.7);

    const history = await adminPool.query<{ source: string; previous_unit_cost: string }>(
      "SELECT source, previous_unit_cost FROM public.platform_catalog_price_history WHERE catalog_item_id = $1",
      [groutId]
    );
    expect(history.rows.map((row) => [row.source, Number(row.previous_unit_cost)])).toEqual([["aporte_usuarios", 0]]);

    const audit = await adminPool.query<{ action: string }>(
      "SELECT action FROM public.admin_audit_logs WHERE target_id = $1",
      [groutId]
    );
    expect(audit.rows.map((row) => row.action)).toEqual(["ADMIN_PRICE_CONTRIBUTIONS_APPROVED"]);

    const approved = await listPriceContributionRowsRepo(superAdminId, "approved", String(suffix));
    expect(approved.filter((row) => row.catalog_item_id === groutId)).toHaveLength(2);

    // Quien no aportó ve el precio nuevo del catálogo.
    const third = await createActiveUser(`aportes_tres_${suffix}@example.com`, "contractor");
    try {
      expect(Number((await effectivePrice(third, groutId))?.unit_cost)).toBe(2);
    } finally {
      await adminPool.query("DELETE FROM app_auth.users WHERE id = $1", [third]);
    }
  });

  it("rechazar exige motivo y no cambia el precio del catálogo", async () => {
    await submitPriceContributionRepo(firstUserId, spacerId, {
      unitCost: 99,
      salePrice: null,
      storeName: null,
      notes: null
    });

    await expect(
      reviewPriceContributionsRepo(superAdminId, spacerId, { action: "reject", reason: "no" })
    ).rejects.toThrow(/motivo/);

    expect(
      await reviewPriceContributionsRepo(superAdminId, spacerId, {
        action: "reject",
        reason: "Precio fuera de mercado"
      })
    ).toBe(1);

    const item = await adminPool.query<{ default_unit_cost: string }>(
      "SELECT default_unit_cost FROM public.platform_catalog_items WHERE id = $1",
      [spacerId]
    );
    expect(Number(item.rows[0]?.default_unit_cost)).toBe(0);

    // El usuario conserva su precio personal.
    expect(Number((await effectivePrice(firstUserId, spacerId))?.unit_cost)).toBe(99);
  });
});
