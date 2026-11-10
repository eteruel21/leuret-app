import type { FastifyInstance, FastifyReply } from "fastify";
import { requireSuperAdmin } from "./authorize.js";
import {
  adminListQuerySchema,
  adminSearchQuerySchema,
  entityParamsSchema,
  revokeSessionsSchema,
  userParamsSchema
} from "./schemas.js";
import {
  adminGlobalSearchService,
  getAdminBudgetDetailService,
  getAdminInvoiceDetailService,
  getAdminOverviewService,
  getAdminProjectDetailService,
  listAdminAuditLogsService,
  listAdminBudgetsService,
  listAdminClientsService,
  listAdminInvoicesService,
  listAdminProjectsService,
  listAdminUserSessionsService,
  revokeAdminUserSessionsService
} from "./operations-services.js";
import type { ListFilters } from "./operations-repository.js";

const noStore = (reply: FastifyReply) => reply.header("Cache-Control", "private, no-store");

/**
 * Centro de control del superadministrador: lectura global de la operación
 * de todas las empresas y acciones de soporte auditadas.
 */
export async function registerAdminOperationsRoutes(app: FastifyInstance): Promise<void> {
  const listRoute = (
    path: string,
    service: (userId: string, filters: ListFilters) => Promise<unknown>
  ) => {
    app.get(path, { preHandler: requireSuperAdmin }, async (request, reply) => {
      const query = adminListQuerySchema.safeParse(request.query);
      if (!query.success) {
        return reply.status(400).send({ message: query.error.issues[0]?.message ?? "Los filtros no son válidos." });
      }
      noStore(reply);
      return service(request.authenticatedUser!.id, query.data);
    });
  };

  const detailRoute = (
    path: string,
    service: (userId: string, id: string) => Promise<unknown | null>,
    notFound: string
  ) => {
    app.get(path, { preHandler: requireSuperAdmin }, async (request, reply) => {
      const params = entityParamsSchema.safeParse(request.params);
      if (!params.success) {
        return reply.status(400).send({ message: "El identificador no es válido." });
      }
      const detail = await service(request.authenticatedUser!.id, params.data.id);
      if (!detail) {
        return reply.status(404).send({ message: notFound });
      }
      noStore(reply);
      return detail;
    });
  };

  app.get("/admin/overview", { preHandler: requireSuperAdmin }, async (request, reply) => {
    noStore(reply);
    return getAdminOverviewService(request.authenticatedUser!.id);
  });

  app.get("/admin/search", { preHandler: requireSuperAdmin }, async (request, reply) => {
    const query = adminSearchQuerySchema.safeParse(request.query);
    if (!query.success) {
      return reply.status(400).send({ message: "Escribe al menos 2 caracteres para buscar." });
    }
    noStore(reply);
    return adminGlobalSearchService(request.authenticatedUser!.id, query.data.q);
  });

  listRoute("/admin/projects", listAdminProjectsService);
  detailRoute("/admin/projects/:id", getAdminProjectDetailService, "No se encontró la obra.");

  listRoute("/admin/budgets", listAdminBudgetsService);
  detailRoute("/admin/budgets/:id", getAdminBudgetDetailService, "No se encontró el presupuesto.");

  listRoute("/admin/invoices", listAdminInvoicesService);
  detailRoute("/admin/invoices/:id", getAdminInvoiceDetailService, "No se encontró la factura.");

  listRoute("/admin/clients", listAdminClientsService);
  listRoute("/admin/audit-logs", listAdminAuditLogsService);

  app.get("/admin/users/:userId/sessions", { preHandler: requireSuperAdmin }, async (request, reply) => {
    const params = userParamsSchema.safeParse(request.params);
    if (!params.success) {
      return reply.status(400).send({ message: "El usuario indicado no es válido." });
    }
    noStore(reply);
    return { sessions: await listAdminUserSessionsService(request.authenticatedUser!.id, params.data.userId) };
  });

  app.post("/admin/users/:userId/sessions/revoke", { preHandler: requireSuperAdmin }, async (request, reply) => {
    const params = userParamsSchema.safeParse(request.params);
    const body = revokeSessionsSchema.safeParse(request.body);
    if (!params.success || !body.success) {
      return reply.status(400).send({
        message: body.success ? "El usuario indicado no es válido." : body.error.issues[0]?.message ?? "Datos no válidos."
      });
    }

    const adminId = request.authenticatedUser!.id;
    if (params.data.userId === adminId) {
      return reply.status(400).send({
        message: "Para cerrar tus propias sesiones usa la opción de seguridad de tu cuenta."
      });
    }

    const result = await revokeAdminUserSessionsService(adminId, params.data.userId, body.data.reason);
    if (!result) {
      return reply.status(404).send({ message: "No se encontró el usuario." });
    }

    request.log.warn(
      { targetUserId: params.data.userId, adminId, revokedCount: result.revokedCount },
      "Sesiones de usuario cerradas desde el panel."
    );
    return { success: true, revokedCount: result.revokedCount };
  });
}
