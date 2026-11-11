import type { FastifyInstance } from "fastify";

import { requireSuperAdmin } from "./authorize.js";
import {
  MAX_PRICE_CONTRIBUTION_ROWS,
  listPriceContributionRowsRepo,
  reviewPriceContributionsRepo
} from "./price-contributions-repository.js";
import { groupPriceContributions } from "./price-contributions.js";
import {
  priceContributionItemParamsSchema,
  priceContributionReviewSchema,
  priceContributionsQuerySchema
} from "./schemas.js";

function databaseErrorCode(error: unknown): string | null {
  if (typeof error === "object" && error !== null && "code" in error) {
    const code = (error as { code?: unknown }).code;
    return typeof code === "string" ? code : null;
  }
  return null;
}

/** Revisión de los precios que aportan los usuarios (solo superadministrador). */
export async function registerAdminPriceContributionRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    "/admin/price-contributions",
    { preHandler: requireSuperAdmin },
    async (request, reply) => {
      const query = priceContributionsQuerySchema.safeParse(request.query);
      if (!query.success) {
        return reply.status(400).send({ message: "Los filtros de aportes no son válidos." });
      }

      const rows = await listPriceContributionRowsRepo(
        request.authenticatedUser!.id,
        query.data.status,
        query.data.search || undefined
      );
      const groups = groupPriceContributions(rows);

      reply.header("Cache-Control", "private, no-store");
      return {
        status: query.data.status,
        totalContributions: rows.length,
        totalItems: groups.length,
        truncated: rows.length >= MAX_PRICE_CONTRIBUTION_ROWS,
        groups
      };
    }
  );

  app.post(
    "/admin/price-contributions/:itemId/review",
    { preHandler: requireSuperAdmin },
    async (request, reply) => {
      const params = priceContributionItemParamsSchema.safeParse(request.params);
      const body = priceContributionReviewSchema.safeParse(request.body);
      if (!params.success || !body.success) {
        return reply.status(400).send({
          message: body.success
            ? "El insumo no es válido."
            : body.error.issues[0]?.message ?? "Los datos de la revisión no son válidos."
        });
      }

      const input = body.data;
      try {
        const reviewed = await reviewPriceContributionsRepo(
          request.authenticatedUser!.id,
          params.data.itemId,
          input
        );

        if (reviewed === null) {
          return reply.status(404).send({ message: "El insumo no existe." });
        }

        return { success: true, reviewed };
      } catch (error) {
        const code = databaseErrorCode(error);
        if (code === "22023") {
          return reply.status(400).send({ message: "Revisa el precio y el motivo." });
        }
        if (code === "42501") {
          return reply.status(403).send({ message: "Solo el superadministrador puede revisar aportes." });
        }
        throw error;
      }
    }
  );
}
