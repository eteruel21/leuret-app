import type {
  FastifyInstance,
  FastifyReply,
  FastifyRequest
} from "fastify";

import {
  authenticateRequest,
  requireActiveUser,
  requireCompanyRole
} from "../auth/authenticate.js";
import { safeErrorDetails } from "../security/redaction.js";

import {
  budgetParamsSchema,
  budgetItemParamsSchema,
  listBudgetSchema,
  companyQuerySchema,
  createBudgetSchema,
  createBudgetItemSchema,
  approveBudgetSchema,
  rejectBudgetSchema,
  sendBudgetSchema,
  convertCalculationSchema,
  applyPriceUpdatesSchema
} from "./schemas.js";

import {
  getClientBudgetsService,
  getClientBudgetDetailService,
  getCompanyBudgetsService,
  createProjectBudgetService,
  getBudgetDetailsService,
  addBudgetItemService,
  deleteBudgetItemService,
  approveBudgetService,
  clientBudgetResponseError,
  rejectBudgetService,
  sendBudgetService,
  getBudgetHistoryService,
  getBudgetPriceUpdatesService,
  applyBudgetPriceUpdatesService
} from "./services.js";
import { BudgetLockedError, BudgetNotDraftError, BudgetSendError } from "./repository.js";

import { getCalculationDetailService } from "../calculations/services.js";

function authenticatedUserId(
  request: FastifyRequest,
  reply: FastifyReply
): string | null {
  const userId = request.authenticatedUser?.id;

  if (!userId) {
    reply.status(401).send({
      message: "Se requiere autenticación."
    });
    return null;
  }

  return userId;
}

export async function registerBudgetRoutes(
  app: FastifyInstance
): Promise<void> {
  app.get(
    "/budgets/client",
    {
      preHandler: [authenticateRequest, requireActiveUser]
    },
    async (request, reply) => {
      const userId = authenticatedUserId(request, reply);
      if (!userId) return;

      const budgets = await getClientBudgetsService(userId);
      return { budgets };
    }
  );

  app.get(
    "/budgets/client/:budgetId",
    {
      preHandler: [authenticateRequest, requireActiveUser]
    },
    async (request, reply) => {
      const userId = authenticatedUserId(request, reply);
      if (!userId) return;

      const parsedParams = budgetParamsSchema.safeParse(request.params);
      if (!parsedParams.success) {
        return reply.status(400).send({
          message: "Identificador de presupuesto no válido."
        });
      }

      const budget = await getClientBudgetDetailService(userId, parsedParams.data.budgetId);
      if (!budget) {
        return reply.status(404).send({
          message: "No se encontró el presupuesto."
        });
      }

      return { budget };
    }
  );

  app.get(
    "/budgets",
    {
      preHandler: [authenticateRequest, requireActiveUser, requireCompanyRole(["owner", "admin", "estimator"])]
    },
    async (request, reply) => {
      const userId = authenticatedUserId(request, reply);
      if (!userId) return;

      const parsedQuery = listBudgetSchema.safeParse(request.query);
      if (!parsedQuery.success) {
        return reply.status(400).send({
          message: "La empresa o el proyecto no son válidos."
        });
      }

      const input = parsedQuery.data;
      const budgets = await getCompanyBudgetsService(userId, input.companyId, input.projectId);
      return { budgets };
    }
  );

  app.post(
    "/budgets/from-project",
    {
      preHandler: [authenticateRequest, requireActiveUser, requireCompanyRole(["owner", "admin", "estimator"])]
    },
    async (request, reply) => {
      const userId = authenticatedUserId(request, reply);
      if (!userId) return;

      const parsedBody = createBudgetSchema.safeParse(request.body);
      if (!parsedBody.success) {
        return reply.status(400).send({
          message: "Los datos del presupuesto no son válidos."
        });
      }

      const input = parsedBody.data;
      const budgetId = await createProjectBudgetService(userId, input.companyId, input.projectId, input.title);

      if (!budgetId) {
        return reply.status(500).send({
          message: "No se pudo crear el presupuesto."
        });
      }

      return reply.status(201).send({ budgetId });
    }
  );

  app.get(
    "/budgets/:budgetId",
    {
      preHandler: [authenticateRequest, requireActiveUser, requireCompanyRole(["owner", "admin", "estimator"])]
    },
    async (request, reply) => {
      const userId = authenticatedUserId(request, reply);
      if (!userId) return;

      const parsedParams = budgetParamsSchema.safeParse(request.params);
      const parsedQuery = companyQuerySchema.safeParse(request.query);

      if (!parsedParams.success || !parsedQuery.success) {
        return reply.status(400).send({
          message: "El presupuesto o la empresa no son válidos."
        });
      }

      const details = await getBudgetDetailsService(userId, parsedParams.data.budgetId, parsedQuery.data.companyId);

      if (!details) {
        return reply.status(404).send({
          message: "No se encontró el presupuesto."
        });
      }

      return { budget: details };
    }
  );

  app.post(
    "/budgets/:budgetId/items",
    {
      preHandler: [authenticateRequest, requireActiveUser, requireCompanyRole(["owner", "admin", "estimator"])]
    },
    async (request, reply) => {
      const userId = authenticatedUserId(request, reply);
      if (!userId) return;

      const parsedParams = budgetParamsSchema.safeParse(request.params);
      const parsedBody = createBudgetItemSchema.safeParse(request.body);

      if (!parsedParams.success || !parsedBody.success) {
        return reply.status(400).send({
          message: "Los datos de la partida no son válidos.",
          fields: parsedBody.success ? undefined : parsedBody.error.flatten().fieldErrors
        });
      }

      try {
        const item = await addBudgetItemService(userId, parsedParams.data.budgetId, parsedBody.data);
        if (!item) {
          return reply.status(500).send({ message: "No se pudo crear la partida." });
        }
        return reply.status(201).send({ item });
      } catch (error) {
        if (error instanceof BudgetLockedError) {
          return reply.status(409).send({ message: error.message });
        }
        request.log.error(safeErrorDetails(error), "No se pudo añadir la partida.");
        return reply.status(400).send({ message: "Error al añadir la partida." });
      }
    }
  );

  app.delete(
    "/budgets/:budgetId/items/:itemId",
    {
      preHandler: [authenticateRequest, requireActiveUser, requireCompanyRole(["owner", "admin", "estimator"])]
    },
    async (request, reply) => {
      const userId = authenticatedUserId(request, reply);
      if (!userId) return;

      const parsedParams = budgetItemParamsSchema.safeParse(request.params);
      const parsedQuery = companyQuerySchema.safeParse(request.query);

      if (!parsedParams.success || !parsedQuery.success) {
        return reply.status(400).send({
          message: "La partida no es válida."
        });
      }

      try {
        await deleteBudgetItemService(
          userId,
          parsedParams.data.budgetId,
          parsedParams.data.itemId,
          parsedQuery.data.companyId
        );
        return { success: true };
      } catch (error) {
        if (error instanceof BudgetLockedError) {
          return reply.status(409).send({ message: error.message });
        }
        request.log.error(safeErrorDetails(error), "No se pudo eliminar la partida.");
        return reply.status(400).send({ message: "Error al eliminar la partida." });
      }
    }
  );

  app.post(
    "/budgets/:budgetId/approve",
    {
      preHandler: [authenticateRequest, requireActiveUser]
    },
    async (request, reply) => {
      const userId = authenticatedUserId(request, reply);
      if (!userId) return;

      const parsedParams = budgetParamsSchema.safeParse(request.params);
      const parsedBody = approveBudgetSchema.safeParse(request.body || {});

      if (!parsedParams.success || !parsedBody.success) {
        return reply.status(400).send({ message: "Datos no válidos para la aprobación." });
      }

      try {
        const budget = await approveBudgetService(userId, parsedParams.data.budgetId, parsedBody.data.companyId);
        return { budget };
      } catch (error) {
        const known = clientBudgetResponseError(error);
        if (known) return reply.status(known.status).send({ message: known.message });
        request.log.error(safeErrorDetails(error), "No se pudo aprobar el presupuesto.");
        return reply.status(400).send({ message: "Error al aprobar el presupuesto." });
      }
    }
  );

  app.post(
    "/budgets/:budgetId/send",
    {
      preHandler: [authenticateRequest, requireActiveUser, requireCompanyRole(["owner", "admin", "estimator", "sales"])]
    },
    async (request, reply) => {
      const userId = authenticatedUserId(request, reply);
      if (!userId) return;

      const parsedParams = budgetParamsSchema.safeParse(request.params);
      const parsedBody = sendBudgetSchema.safeParse(request.body);

      if (!parsedParams.success || !parsedBody.success) {
        return reply.status(400).send({ message: "Datos no válidos para enviar el presupuesto." });
      }

      try {
        const budget = await sendBudgetService(
          userId,
          parsedParams.data.budgetId,
          parsedBody.data.companyId,
          parsedBody.data.validUntil
        );
        return { budget };
      } catch (error) {
        if (error instanceof BudgetSendError) {
          const status = error.code === "not_found" ? 404 : error.code === "not_draft" ? 409 : 400;
          return reply.status(status).send({ message: error.message });
        }
        request.log.error(safeErrorDetails(error), "No se pudo enviar el presupuesto.");
        return reply.status(400).send({ message: "Error al enviar el presupuesto." });
      }
    }
  );

  app.post(
    "/budgets/:budgetId/reject",
    {
      preHandler: [authenticateRequest, requireActiveUser]
    },
    async (request, reply) => {
      const userId = authenticatedUserId(request, reply);
      if (!userId) return;

      const parsedParams = budgetParamsSchema.safeParse(request.params);
      const parsedBody = rejectBudgetSchema.safeParse(request.body);

      if (!parsedParams.success || !parsedBody.success) {
        return reply.status(400).send({
          message: "Motivo de rechazo o identificador no válido.",
          fields: parsedBody.success ? undefined : parsedBody.error.flatten().fieldErrors
        });
      }

      try {
        const budget = await rejectBudgetService(
          userId,
          parsedParams.data.budgetId,
          parsedBody.data.rejectionReason,
          parsedBody.data.companyId
        );
        return { budget };
      } catch (error) {
        const known = clientBudgetResponseError(error);
        if (known) return reply.status(known.status).send({ message: known.message });
        request.log.error(safeErrorDetails(error), "No se pudo rechazar el presupuesto.");
        return reply.status(400).send({ message: "Error al rechazar el presupuesto." });
      }
    }
  );

  app.get(
    "/budgets/:budgetId/history",
    {
      preHandler: [authenticateRequest, requireActiveUser]
    },
    async (request, reply) => {
      const userId = authenticatedUserId(request, reply);
      if (!userId) return;

      const parsedParams = budgetParamsSchema.safeParse(request.params);
      const parsedQuery = companyQuerySchema.safeParse(request.query || {});

      if (!parsedParams.success) {
        return reply.status(400).send({ message: "Identificador de presupuesto no válido." });
      }

      const history = await getBudgetHistoryService(userId, parsedParams.data.budgetId, parsedQuery.data?.companyId);
      return { history };
    }
  );

  app.post(
    "/budgets/:budgetId/items/from-calculation",
    {
      preHandler: [authenticateRequest, requireActiveUser, requireCompanyRole(["owner", "admin", "estimator"])]
    },
    async (request, reply) => {
      const userId = authenticatedUserId(request, reply);
      if (!userId) return;

      const parsedParams = budgetParamsSchema.safeParse(request.params);
      const parsedBody = convertCalculationSchema.safeParse(request.body);

      if (!parsedParams.success || !parsedBody.success) {
        return reply.status(400).send({
          message: "Datos de conversión de cálculo no válidos.",
          fields: parsedBody.success ? undefined : parsedBody.error.flatten().fieldErrors
        });
      }

      const { companyId, calculationId, sectionId, items } = parsedBody.data;

      let itemsToInsert = items || [];

      if (calculationId) {
        const savedCalc = await getCalculationDetailService(userId, calculationId, companyId);
        if (!savedCalc) {
          return reply.status(404).send({ message: "No se encontró el cálculo guardado." });
        }

        const lineItems = savedCalc.results_data?.lineItems || [];
        if (lineItems.length > 0) {
          // Una línea con cantidad 0 o inválida no es una partida: antes se
          // convertía en cantidad 1 y sumaba su precio al presupuesto.
          itemsToInsert = lineItems
            .filter((li: any) => Number.isFinite(Number(li.quantity)) && Number(li.quantity) > 0)
            .map((li: any) => ({
            sectionId: sectionId ?? null,
            catalogItemId: null,
            platformCatalogItemId: null,
            itemType: li.itemType || "manual",
            description: li.description || "Partida de cálculo",
            unitName: li.unitName || "unidad",
            quantity: Number(li.quantity),
            unitCost: Number(li.unitCost) || 0,
            unitPrice: Number(li.unitPrice) || 0,
            discountPercentage: 0,
            taxable: true,
            notes: `Generado desde cálculo: ${savedCalc.title}`
          }));
        }
      }

      if (itemsToInsert.length === 0) {
        return reply.status(400).send({ message: "No hay partidas para convertir o insertar." });
      }

      const createdItems = [];
      try {
        for (const itemInput of itemsToInsert) {
          const item = await addBudgetItemService(userId, parsedParams.data.budgetId, {
            companyId,
            ...itemInput
          });
          if (item) createdItems.push(item);
        }
      } catch (error) {
        if (error instanceof BudgetLockedError) {
          return reply.status(409).send({ message: error.message });
        }
        throw error;
      }

      return reply.status(201).send({ items: createdItems });
    }
  );

  app.get(
    "/budgets/:budgetId/price-updates",
    {
      preHandler: [authenticateRequest, requireActiveUser, requireCompanyRole(["owner", "admin", "estimator"])]
    },
    async (request, reply) => {
      const userId = authenticatedUserId(request, reply);
      if (!userId) return;

      const parsedParams = budgetParamsSchema.safeParse(request.params);
      const parsedQuery = companyQuerySchema.safeParse(request.query);

      if (!parsedParams.success || !parsedQuery.success) {
        return reply.status(400).send({ message: "El presupuesto no es válido." });
      }

      const result = await getBudgetPriceUpdatesService(
        userId,
        parsedParams.data.budgetId,
        parsedQuery.data.companyId
      );

      if (!result) {
        return reply.status(404).send({ message: "Presupuesto no encontrado." });
      }

      return result;
    }
  );

  app.post(
    "/budgets/:budgetId/price-updates",
    {
      preHandler: [authenticateRequest, requireActiveUser, requireCompanyRole(["owner", "admin", "estimator"])]
    },
    async (request, reply) => {
      const userId = authenticatedUserId(request, reply);
      if (!userId) return;

      const parsedParams = budgetParamsSchema.safeParse(request.params);
      const parsedBody = applyPriceUpdatesSchema.safeParse(request.body);

      if (!parsedParams.success || !parsedBody.success) {
        return reply.status(400).send({ message: "Las partidas a actualizar no son válidas." });
      }

      try {
        const result = await applyBudgetPriceUpdatesService(
          userId,
          parsedParams.data.budgetId,
          parsedBody.data.companyId,
          parsedBody.data.itemIds
        );

        if (!result) {
          return reply.status(404).send({ message: "Presupuesto no encontrado." });
        }

        return { success: true, updatedCount: result.updatedCount };
      } catch (error) {
        if (error instanceof BudgetNotDraftError) {
          return reply.status(409).send({ message: error.message });
        }
        request.log.error(safeErrorDetails(error), "No se pudieron actualizar los precios.");
        return reply.status(400).send({ message: "Error al actualizar los precios." });
      }
    }
  );

}