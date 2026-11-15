import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";

import { authenticateRequest, requireActiveUser } from "../auth/authenticate.js";
import { findClientContractorProfile } from "../clients/processes.js";
import { notifyInvoiceRequested } from "../notifications/event-service.js";
import { safeErrorDetails } from "../security/redaction.js";
import { getStorageSignedUrl } from "../storage/provider.js";

import {
  findClientInvoicesRepo,
  findClientUpcomingActivitiesRepo,
  getClientInvoiceDetailRepo,
  getClientProjectDetailRepo,
  getClientSummaryRepo,
  requestProjectInvoiceRepo
} from "./repository.js";

const invoiceParamsSchema = z.object({ invoiceId: z.string().uuid() });
const projectParamsSchema = z.object({ projectId: z.string().uuid() });
const companyParamsSchema = z.object({ companyId: z.string().uuid() });
const invoiceRequestBodySchema = z.object({
  note: z.string().trim().max(500).nullable().optional().transform((value) => value || null)
});

/** Mensajes en español de las funciones de la base → 4xx. */
function databaseErrorStatus(error: unknown): { status: number; message: string } | null {
  if (typeof error !== "object" || error === null || !("code" in error)) return null;
  const code = String((error as { code?: unknown }).code ?? "");
  const message = error instanceof Error && error.message ? error.message : "No se pudo completar la acción.";
  const status = code === "55000" || code === "23505" ? 409
    : code === "22023" ? 400
      : code === "42501" ? 403
        : code === "P0002" ? 404
          : null;
  return status ? { status, message } : null;
}

function authenticatedUserId(request: FastifyRequest, reply: FastifyReply): string | null {
  const userId = request.authenticatedUser?.id;
  if (!userId) {
    reply.status(401).send({ message: "Se requiere autenticación." });
    return null;
  }
  return userId;
}

/**
 * Consultas de solo lectura del portal del cliente.
 */
export async function registerClientPortalRoutes(app: FastifyInstance): Promise<void> {
  const preHandler = [authenticateRequest, requireActiveUser];

  app.get("/client/contractors/:companyId", { preHandler }, async (request, reply) => {
    const userId = authenticatedUserId(request, reply);
    if (!userId) return;

    const parsed = companyParamsSchema.safeParse(request.params);
    if (!parsed.success) return reply.status(400).send({ message: "Identificador de contratista no válido." });

    const profile = await findClientContractorProfile(userId, parsed.data.companyId);
    if (!profile) return reply.status(404).send({ message: "No se encontró el contratista vinculado." });
    reply.header("Cache-Control", "private, no-store");
    return profile;
  });

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

  // El cliente pide la factura de una obra terminada.
  app.post("/client/projects/:projectId/invoice-request", { preHandler }, async (request, reply) => {
    const userId = authenticatedUserId(request, reply);
    if (!userId) return;

    const params = projectParamsSchema.safeParse(request.params);
    const body = invoiceRequestBodySchema.safeParse(request.body ?? {});
    if (!params.success || !body.success) {
      return reply.status(400).send({ message: "La solicitud no es válida." });
    }

    let result: Awaited<ReturnType<typeof requestProjectInvoiceRepo>>;
    try {
      result = await requestProjectInvoiceRepo(userId, params.data.projectId, body.data.note);
    } catch (error) {
      const known = databaseErrorStatus(error);
      if (known) return reply.status(known.status).send({ message: known.message });
      throw error;
    }

    if (!result.already_requested) {
      try {
        await notifyInvoiceRequested(result.recipient_ids, {
          requestId: result.request_id,
          companyId: result.company_id,
          budgetId: result.budget_id,
          projectId: params.data.projectId,
          clientName: result.client_name,
          projectName: result.project_name
        });
      } catch (error) {
        request.log.error(safeErrorDetails(error), "No se pudo avisar de la solicitud de factura.");
      }
    }

    return reply.status(result.already_requested ? 200 : 201).send({
      request: { id: result.request_id, status: "pending", already_requested: result.already_requested }
    });
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
          signedUrl: await getStorageSignedUrl(photo.id, storage_path)
        })
      )
    );

    return { project: { ...project, photos } };
  });
}
