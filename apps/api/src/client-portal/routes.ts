import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";

import { authenticateRequest, requireActiveUser } from "../auth/authenticate.js";
import { getStorageSignedUrl } from "../storage/provider.js";

import {
  findClientInvoicesRepo,
  findClientUpcomingActivitiesRepo,
  getClientInvoiceDetailRepo,
  getClientProjectDetailRepo,
  getClientSummaryRepo
} from "./repository.js";

const invoiceParamsSchema = z.object({ invoiceId: z.string().uuid() });
const projectParamsSchema = z.object({ projectId: z.string().uuid() });

function authenticatedUserId(request: FastifyRequest, reply: FastifyReply): string | null {
  const userId = request.authenticatedUser?.id;
  if (!userId) {
    reply.status(401).send({ message: "Se requiere autenticación." });
    return null;
  }
  return userId;
}

/**
 * Portal del cliente final. Solo lectura: lo que el cliente puede hacer
 * (aprobar o rechazar presupuestos) sigue en /budgets/:id/approve|reject.
 */
export async function registerClientPortalRoutes(app: FastifyInstance): Promise<void> {
  const preHandler = [authenticateRequest, requireActiveUser];

  app.get("/client/summary", { preHandler }, async (request, reply) => {
    const userId = authenticatedUserId(request, reply);
    if (!userId) return;

    const summary = await getClientSummaryRepo(userId);
    const activities = await findClientUpcomingActivitiesRepo(userId);

    return {
      summary: {
        ...summary,
        next_activity: activities[0] ?? null
      }
    };
  });

  app.get("/client/activities", { preHandler }, async (request, reply) => {
    const userId = authenticatedUserId(request, reply);
    if (!userId) return;

    const activities = await findClientUpcomingActivitiesRepo(userId);
    return { activities };
  });

  app.get("/client/invoices", { preHandler }, async (request, reply) => {
    const userId = authenticatedUserId(request, reply);
    if (!userId) return;

    const invoices = await findClientInvoicesRepo(userId);
    return { invoices };
  });

  app.get("/client/invoices/:invoiceId", { preHandler }, async (request, reply) => {
    const userId = authenticatedUserId(request, reply);
    if (!userId) return;

    const parsed = invoiceParamsSchema.safeParse(request.params);
    if (!parsed.success) {
      return reply.status(400).send({ message: "Identificador de factura no válido." });
    }

    const invoice = await getClientInvoiceDetailRepo(userId, parsed.data.invoiceId);
    if (!invoice) {
      return reply.status(404).send({ message: "No se encontró la factura." });
    }

    return { invoice };
  });

  app.get("/client/projects/:projectId", { preHandler }, async (request, reply) => {
    const userId = authenticatedUserId(request, reply);
    if (!userId) return;

    const parsed = projectParamsSchema.safeParse(request.params);
    if (!parsed.success) {
      return reply.status(400).send({ message: "Identificador de proyecto no válido." });
    }

    const project = await getClientProjectDetailRepo(userId, parsed.data.projectId);
    if (!project) {
      return reply.status(404).send({ message: "No se encontró el proyecto." });
    }

    // La ruta interna del archivo nunca sale del servidor: solo la URL firmada.
    const photos = await Promise.all(
      (project.photos as { id: string; storage_path: string; caption: string | null; created_at: string }[]).map(
        async ({ storage_path, ...photo }) => ({
          ...photo,
          signedUrl: await getStorageSignedUrl(photo.id, storage_path, 60)
        })
      )
    );

    return { project: { ...project, photos } };
  });
}
