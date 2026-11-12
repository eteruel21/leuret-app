import { withUserTransaction } from "../db/with-user-transaction.js";
import type { PriceContributionRow, PriceContributionStatus } from "./price-contributions.js";

export const MAX_PRICE_CONTRIBUTION_ROWS = 2000;

/** Aportes de precio con su insumo y quién los hizo (RLS: solo el superadministrador ve todos). */
export async function listPriceContributionRowsRepo(
  userId: string,
  status: PriceContributionStatus,
  search: string | undefined
) {
  return withUserTransaction(userId, async (client) => {
    const result = await client.query<PriceContributionRow>(
      `
        SELECT
          contribution.id,
          contribution.catalog_item_id,
          contribution.unit_cost,
          contribution.store_name,
          contribution.notes,
          contribution.region_code,
          contribution.status,
          contribution.created_at,
          contribution.reviewed_at,
          contribution.review_notes,
          contributor.full_name AS contributor_name,
          item.name AS item_name,
          item.code AS item_code,
          item.item_type::text AS item_type,
          item.category_name,
          item.unit_symbol,
          item.default_unit_cost AS current_unit_cost,
          item.default_sale_price AS current_sale_price
        FROM public.catalog_price_contributions AS contribution
        JOIN public.platform_catalog_items AS item
          ON item.id = contribution.catalog_item_id
        LEFT JOIN public.profiles AS contributor
          ON contributor.id = contribution.user_id
        WHERE contribution.status = $1
          AND (
            $2::text IS NULL OR
            item.name ILIKE $2 OR
            item.code ILIKE $2 OR
            item.category_name ILIKE $2 OR
            contribution.store_name ILIKE $2
          )
        ORDER BY contribution.created_at DESC
        LIMIT $3
      `,
      [status, search ? `%${search}%` : null, MAX_PRICE_CONTRIBUTION_ROWS]
    );
    return result.rows;
  });
}

export type PriceContributionReview =
  | { action: "approve"; unitCost: number; salePrice?: number | null | undefined; reason?: string | null | undefined }
  | { action: "reject"; reason: string };

/**
 * Aprueba (cambia el precio del catálogo de todos, con historial) o rechaza los
 * aportes pendientes de un insumo. Devuelve cuántos aportes se revisaron, o
 * null si el insumo no existe.
 */
export async function reviewPriceContributionsRepo(
  userId: string,
  itemId: string,
  input: PriceContributionReview
): Promise<number | null> {
  return withUserTransaction(userId, async (client) => {
    const result = await client.query<{ reviewed: number | null }>(
      `SELECT public.admin_review_price_contributions($1, $2, $3, $4, $5) AS reviewed`,
      [
        itemId,
        input.action,
        input.action === "approve" ? input.unitCost : null,
        input.action === "approve" ? input.salePrice ?? null : null,
        input.reason ?? null
      ]
    );
    return result.rows[0]?.reviewed ?? null;
  });
}
