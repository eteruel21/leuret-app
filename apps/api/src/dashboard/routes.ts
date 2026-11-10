import type { FastifyInstance } from "fastify";
import { z } from "zod";

import { authenticateRequest, requireActiveUser, requireCompanyRole } from "../auth/authenticate.js";
import { getCompanyDashboardService } from "./services.js";
import { getRoleDashboardService } from "./role-services.js";

const paramsSchema = z.object({
  companyId: z.string().uuid()
});

export async function registerDashboardRoutes(app: FastifyInstance): Promise<void> {
  // Indicadores del negocio para el inicio del dueño/administrador.
  app.get(
    "/companies/:companyId/dashboard",
    {
      preHandler: [authenticateRequest, requireActiveUser, requireCompanyRole(["owner", "admin"])]
    },
    async (request, reply) => {
      const userId = request.authenticatedUser?.id;
      if (!userId) {
        return reply.status(401).send({ message: "Se requiere autenticación." });
      }

      const parsedParams = paramsSchema.safeParse(request.params);
      if (!parsedParams.success) {
        return reply.status(400).send({ message: "La empresa no es válida." });
      }

      const dashboard = await getCompanyDashboardService(userId, parsedParams.data.companyId);
      if (!dashboard) {
        return reply.status(404).send({ message: "No se encontró la empresa." });
      }

      return { dashboard };
    }
  );

  // Indicadores personales para Ventas y Presupuestista.
  app.get(
    "/companies/:companyId/dashboard/role",
    {
      preHandler: [authenticateRequest, requireActiveUser, requireCompanyRole(["owner", "admin", "sales", "estimator"])]
    },
    async (request, reply) => {
      const userId = request.authenticatedUser?.id;
      if (!userId) {
        return reply.status(401).send({ message: "Se requiere autenticación." });
      }

      const parsedParams = paramsSchema.safeParse(request.params);
      if (!parsedParams.success) {
        return reply.status(400).send({ message: "La empresa no es válida." });
      }

      const dashboard = await getRoleDashboardService(userId, parsedParams.data.companyId);
      if (!dashboard) {
        return reply.status(404).send({ message: "No se encontró la empresa." });
      }

      return { dashboard };
    }
  );
}
