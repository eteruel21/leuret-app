import type { FastifyInstance } from "fastify";
import { z } from "zod";

import { authenticateRequest, requireActiveUser, requireCompanyRole } from "../auth/authenticate.js";
import { getSalesPerformanceRepo } from "./repository.js";

const paramsSchema = z.object({ companyId: z.string().uuid() });
const querySchema = z.object({
  year: z.coerce.number().int().min(2000).max(2100).optional(),
  userId: z.string().uuid().optional()
});

function databaseErrorStatus(error: unknown): number | null {
  const code = typeof error === "object" && error && "code" in error ? String((error as { code?: unknown }).code) : "";
  if (code === "42501") return 403;
  if (code === "22023") return 400;
  return null;
}

export async function registerSalesRoutes(app: FastifyInstance): Promise<void> {
  // Cuánto cotizó, aprobó, facturó y cobró cada persona de ventas, mes a mes.
  // Propietario y administrador ven a todo el personal de ventas; ventas, solo a sí misma.
  app.get(
    "/companies/:companyId/sales-performance",
    {
      preHandler: [authenticateRequest, requireActiveUser, requireCompanyRole(["owner", "admin", "sales"])]
    },
    async (request, reply) => {
      const userId = request.authenticatedUser?.id;
      if (!userId) return reply.status(401).send({ message: "Se requiere autenticación." });

      const params = paramsSchema.safeParse(request.params);
      const query = querySchema.safeParse(request.query ?? {});
      if (!params.success || !query.success) {
        return reply.status(400).send({ message: "La empresa, el año o la persona no son válidos." });
      }

      const year = query.data.year ?? new Date().getUTCFullYear();
      try {
        const people = await getSalesPerformanceRepo(userId, params.data.companyId, year, query.data.userId ?? null);
        return { year, people };
      } catch (error) {
        const status = databaseErrorStatus(error);
        if (!status) throw error;
        const message = error instanceof Error ? error.message : "No se pudo cargar el informe.";
        return reply.status(status).send({ message });
      }
    }
  );
}
