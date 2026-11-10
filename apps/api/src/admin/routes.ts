import { Buffer as NodeBuffer } from "node:buffer";
import type { FastifyInstance } from "fastify";
import { requireSuperAdmin } from "./authorize.js";
import { getAdminCompanyDetailService, listAdminCompaniesService, updateAdminCompanyStatusService } from "./companies-services.js";
import {
  getContractorDocument,
  getContractorReview,
  isContractorDocumentType
} from "./contractor-review.js";
import { getUserProfileDetails } from "../profile/details.js";
import {
  companyParamsSchema,
  companyStatusSchema,
  userParamsSchema,
  userSchema,
  categorySchema,
  itemSchema,
  unitSchema,
  yieldSchema,
  formulaSchema,
  globalPriceParamsSchema,
  globalPriceSchema,
  adjustPricesSchema,
  priceHistoryQuerySchema,
  priceAlertsQuerySchema
} from "./schemas.js";
import {
  getAdminDashboardService,
  updateAdminUserService,
  saveCategoryService,
  saveItemService,
  saveUnitService,
  saveYieldService,
  saveFormulaService,
  saveGlobalPriceService,
  adjustPricesService,
  listPriceHistoryService,
  getPriceAlertsService
} from "./services.js";

export async function registerAdminRoutes(app: FastifyInstance): Promise<void> {
  // 1. Dashboard principal
  app.get(
    "/admin/dashboard",
    {
      preHandler: requireSuperAdmin
    },
    async (request) => {
      const userId = request.authenticatedUser!.id;
      return getAdminDashboardService(userId);
    }
  );

  // Empresas registradas (solo lectura para el super administrador)
  app.get(
    "/admin/companies",
    {
      preHandler: requireSuperAdmin
    },
    async (request, reply) => {
      const companies = await listAdminCompaniesService(request.authenticatedUser!.id);
      reply.header("Cache-Control", "private, no-store");
      return { companies };
    }
  );

  app.get(
    "/admin/companies/:companyId",
    {
      preHandler: requireSuperAdmin
    },
    async (request, reply) => {
      const params = companyParamsSchema.safeParse(request.params);
      if (!params.success) {
        return reply.status(400).send({ message: "La empresa indicada no es válida." });
      }

      const detail = await getAdminCompanyDetailService(request.authenticatedUser!.id, params.data.companyId);
      if (!detail) {
        return reply.status(404).send({ message: "No se encontró la empresa." });
      }

      reply.header("Cache-Control", "private, no-store");
      return detail;
    }
  );

  app.patch(
    "/admin/companies/:companyId/status",
    {
      preHandler: requireSuperAdmin
    },
    async (request, reply) => {
      const params = companyParamsSchema.safeParse(request.params);
      const body = companyStatusSchema.safeParse(request.body);
      if (!params.success || !body.success) {
        return reply.status(400).send({
          message: body.success ? "La empresa indicada no es válida." : body.error.issues[0]?.message ?? "Datos no válidos."
        });
      }

      const company = await updateAdminCompanyStatusService(
        request.authenticatedUser!.id,
        params.data.companyId,
        body.data.active,
        body.data.reason
      );
      if (!company) {
        return reply.status(404).send({ message: "No se encontró la empresa." });
      }

      request.log.warn(
        { companyId: company.id, active: company.active, adminId: request.authenticatedUser!.id },
        company.active ? "Empresa reactivada desde el panel." : "Empresa suspendida desde el panel."
      );
      return { company };
    }
  );

  // 2. Revisión profesional de contratistas
  app.get(
    "/admin/users/:userId/profile",
    {
      preHandler: requireSuperAdmin
    },
    async (request, reply) => {
      const adminUserId = request.authenticatedUser!.id;
      const params = userParamsSchema.safeParse(request.params);

      if (!params.success) {
        return reply.status(400).send({
          message: "El usuario indicado no es válido."
        });
      }

      const profile = await getUserProfileDetails(
        adminUserId,
        params.data.userId
      );

      if (!profile) {
        return reply.status(404).send({
          message: "No se encontró el perfil del usuario."
        });
      }

      reply.header("Cache-Control", "private, no-store");
      return profile;
    }
  );

  app.get(
    "/admin/users/:userId/review",
    {
      preHandler: requireSuperAdmin
    },
    async (request, reply) => {
      const adminUserId =
        request.authenticatedUser!.id;

      const params =
        userParamsSchema.safeParse(
          request.params
        );

      if (!params.success) {
        return reply.status(400).send({
          message:
            "El usuario indicado no es válido."
        });
      }

      const contractor =
        await getContractorReview(
          adminUserId,
          params.data.userId
        );

      if (!contractor) {
        return reply.status(404).send({
          message:
            "No se encontró el perfil profesional del contratista."
        });
      }

      return contractor;
    }
  );

  app.get(
    "/admin/users/:userId/documents/:documentType",
    {
      preHandler: requireSuperAdmin
    },
    async (request, reply) => {
      const adminUserId =
        request.authenticatedUser!.id;

      const params =
        userParamsSchema.safeParse(
          request.params
        );

      const documentType =
        (
          request.params as {
            documentType?: unknown;
          }
        ).documentType;

      if (
        !params.success ||
        !isContractorDocumentType(
          documentType
        )
      ) {
        return reply.status(400).send({
          message:
            "El documento solicitado no es válido."
        });
      }

      try {
        const document =
          await getContractorDocument(
            adminUserId,
            params.data.userId,
            documentType
          );

        if (!document) {
          return reply.status(404).send({
            message:
              "El contratista no ha cargado este documento."
          });
        }

        reply.header(
          "Cache-Control",
          "private, no-store"
        );

        return {
          fileName: document.fileName,
          mimeType:
            document.mimeType ??
            "application/octet-stream",
          base64:
            NodeBuffer.from(
              document.buffer
            ).toString(
              "base64"
            )
        };
      } catch (error) {
        if (
          error instanceof Error &&
          error.message
            .toLowerCase()
            .includes("no encontrado")
        ) {
          return reply.status(404).send({
            message:
              "El archivo ya no existe en el almacenamiento."
          });
        }

        throw error;
      }
    }
  );

  // 3. Usuarios
  app.patch(
    "/admin/users/:userId",
    {
      preHandler: requireSuperAdmin
    },
    async (request, reply) => {
      const userId = request.authenticatedUser!.id;
      const params = userParamsSchema.safeParse(request.params);
      const body = userSchema.safeParse(request.body);

      if (!params.success || !body.success) {
        return reply.status(400).send({
          message: "Los datos del usuario no son válidos."
        });
      }

      const updated = await updateAdminUserService(userId, params.data.userId, body.data);

      if (!updated) {
        return reply.status(404).send({
          message: "No se encontró el usuario."
        });
      }

      return { success: true };
    }
  );

  // 3. Categorías
  app.post(
    "/admin/categories/save",
    {
      preHandler: requireSuperAdmin
    },
    async (request, reply) => {
      const userId = request.authenticatedUser!.id;
      const body = categorySchema.safeParse(request.body);

      if (!body.success) {
        return reply.status(400).send({
          message: "Los datos de la categoría no son válidos."
        });
      }

      const result = await saveCategoryService(userId, body.data);
      return { success: true, category: result };
    }
  );

  // 4. Ítems de Catálogo
  app.post(
    "/admin/catalog/items/save",
    {
      preHandler: requireSuperAdmin
    },
    async (request, reply) => {
      const userId = request.authenticatedUser!.id;
      const body = itemSchema.safeParse(request.body);

      if (!body.success) {
        return reply.status(400).send({
          message: "Los datos del concepto de catálogo no son válidos."
        });
      }

      const result = await saveItemService(userId, body.data);
      return { success: true, item: result };
    }
  );

  // 5. Unidades
  app.post(
    "/admin/units/save",
    {
      preHandler: requireSuperAdmin
    },
    async (request, reply) => {
      const userId = request.authenticatedUser!.id;
      const body = unitSchema.safeParse(request.body);

      if (!body.success) {
        return reply.status(400).send({
          message: "Los datos de la unidad no son válidos."
        });
      }

      const result = await saveUnitService(userId, body.data);
      return { success: true, unit: result };
    }
  );

  // 6. Rendimientos
  app.post(
    "/admin/yields/save",
    {
      preHandler: requireSuperAdmin
    },
    async (request, reply) => {
      const userId = request.authenticatedUser!.id;
      const body = yieldSchema.safeParse(request.body);

      if (!body.success) {
        return reply.status(400).send({
          message: "Los datos del rendimiento no son válidos."
        });
      }

      const result = await saveYieldService(userId, body.data);
      return { success: true, yield: result };
    }
  );

  // 7. Fórmulas
  app.post(
    "/admin/formulas/save",
    {
      preHandler: requireSuperAdmin
    },
    async (request, reply) => {
      const userId = request.authenticatedUser!.id;
      const body = formulaSchema.safeParse(request.body);

      if (!body.success) {
        return reply.status(400).send({
          message: "Los datos de la fórmula no son válidos."
        });
      }

      const result = await saveFormulaService(userId, body.data);
      return { success: true, formula: result };
    }
  );

  // 8. Precios Globales (Edición individual)
  app.patch(
    "/admin/platform-pricing/:itemId",
    {
      preHandler: requireSuperAdmin
    },
    async (request, reply) => {
      const userId = request.authenticatedUser!.id;
      const params = globalPriceParamsSchema.safeParse(request.params);
      const body = globalPriceSchema.safeParse(request.body);

      if (!params.success || !body.success) {
        return reply.status(400).send({
          message: "Los datos de precios globales no son válidos."
        });
      }

      const updated = await saveGlobalPriceService(userId, params.data.itemId, body.data);

      if (!updated) {
        return reply.status(404).send({
          message: "No se encontró el ítem del catálogo global."
        });
      }

      return { success: true };
    }
  );

  // 9. Precios Globales (Ajuste porcentual masivo)
  app.post(
    "/admin/platform-pricing/adjust",
    {
      preHandler: requireSuperAdmin
    },
    async (request, reply) => {
      const userId = request.authenticatedUser!.id;
      const body = adjustPricesSchema.safeParse(request.body);

      if (!body.success) {
        return reply.status(400).send({
          message: "Los datos del ajuste de precios no son válidos."
        });
      }

      const adjustedCount = await adjustPricesService(userId, body.data);
      return { success: true, adjustedCount };
    }
  );

  // 10. Historial de cambios de precios globales
  app.get(
    "/admin/platform-pricing/history",
    {
      preHandler: requireSuperAdmin
    },
    async (request, reply) => {
      const query = priceHistoryQuerySchema.safeParse(request.query);
      if (!query.success) {
        return reply.status(400).send({
          message: "Los filtros del historial no son válidos."
        });
      }

      const entries = await listPriceHistoryService(request.authenticatedUser!.id, query.data);
      reply.header("Cache-Control", "private, no-store");
      return { entries };
    }
  );

  // 11. Alertas de precios globales
  app.get(
    "/admin/platform-pricing/alerts",
    {
      preHandler: requireSuperAdmin
    },
    async (request, reply) => {
      const query = priceAlertsQuerySchema.safeParse(request.query);
      if (!query.success) {
        return reply.status(400).send({
          message: "Los parámetros de alertas no son válidos."
        });
      }

      reply.header("Cache-Control", "private, no-store");
      return getPriceAlertsService(request.authenticatedUser!.id, query.data);
    }
  );

}
