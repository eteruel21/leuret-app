import type { FastifyInstance } from "fastify";
import { z } from "zod";

import { authenticateRequest, requireActiveUser } from "../auth/authenticate.js";
import { notifyClientConnectionRequest } from "../notifications/event-service.js";
import { listClientConnections, requestClientConnection, respondToClientConnection, type ConnectionDecision } from "./repository.js";

const createSchema = z.object({
  companyId: z.uuid().optional(),
  clientId: z.uuid().optional(),
  email: z.string().trim().email().max(254).optional(),
  phone: z.string().trim().max(30).refine((value) => {
    const digits = value.replace(/\D/g, "").replace(/^00/, "");
    return /^[+0-9().\s-]+$/.test(value) && digits.length >= 7 && digits.length <= 15;
  }).optional()
}).refine((value) => Boolean(value.email) !== Boolean(value.phone))
  .refine((value) => !value.clientId || Boolean(value.companyId));

const decisionSchema = z.object({
  action: z.enum(["accept", "reject", "cancel"]),
  phoneCode: z.string().trim().max(32).optional()
});

type RequestOutcome = Awaited<ReturnType<typeof requestClientConnection>>["outcome"];
type ErrorOutcome = Exclude<RequestOutcome | ConnectionDecision, "sent" | "pending" | "linked" | "accepted" | "rejected" | "cancelled">;

const outcomes: Record<ErrorOutcome, { code: number; message: string }> = {
  not_found: { code: 404, message: "No encontramos una cuenta activa con ese correo o celular." },
  ambiguous: { code: 409, message: "Ese celular coincide con más de una cuenta. Usa el correo registrado del cliente." },
  ambiguous_company: { code: 409, message: "Ese contacto coincide con más de una empresa. Usa el correo o celular de la empresa que deseas vincular." },
  ambiguous_record: { code: 409, message: "Hay varias fichas con ese contacto. Abre la ficha que deseas vincular y envía la solicitud desde allí." },
  unavailable_record: { code: 409, message: "La ficha o sus datos de contacto cambiaron. Revisa los datos antes de volver a enviar la solicitud." },
  forbidden: { code: 403, message: "No tienes permiso para realizar esta acción." },
  resolved: { code: 409, message: "La solicitud ya fue respondida o cancelada." },
  invalid_code: { code: 400, message: "El código de confirmación no es válido. Revísalo con tu contratista." }
};

export async function registerClientConnectionRoutes(app: FastifyInstance) {
  const preHandler = [authenticateRequest, requireActiveUser];

  app.get("/client-connections", { preHandler }, async (request, reply) => {
    const pendingOnly = (request.query as { pending?: unknown } | null)?.pending === "true";
    reply.header("Cache-Control", "private, no-store");
    return { requests: await listClientConnections(request.authenticatedUser!.id, pendingOnly) };
  });

  app.post("/client-connections", {
    preHandler,
    config: { rateLimit: { max: 12, timeWindow: "1 minute" } }
  }, async (request, reply) => {
    const parsed = createSchema.safeParse(request.body);
    if (!parsed.success) return reply.status(400).send({ message: "Introduce un correo o celular válido." });

    const result = await requestClientConnection(request.authenticatedUser!.id, parsed.data);
    if (result.outcome === "sent") {
      await notifyClientConnectionRequest(result.request_id, result.notify_user_ids);
      return reply.status(201).send({ outcome: result.outcome });
    }
    if (result.outcome === "pending" || result.outcome === "linked") return { outcome: result.outcome };

    const error = outcomes[result.outcome];
    return reply.status(error.code).send({ message: error.message });
  });

  app.patch("/client-connections/:id", {
    preHandler,
    config: { rateLimit: { max: 20, timeWindow: "1 minute" } }
  }, async (request, reply) => {
    const id = z.uuid().safeParse((request.params as { id: string }).id);
    const body = decisionSchema.safeParse(request.body);
    if (!id.success || !body.success) return reply.status(400).send({ message: "La solicitud no es válida." });

    const { action, phoneCode } = body.data;
    const outcome = await respondToClientConnection(request.authenticatedUser!.id, id.data, action, phoneCode);
    if (outcome === "not_found") return reply.status(404).send({ message: "No se encontró la solicitud." });
    if (outcome === "accepted" || outcome === "rejected" || outcome === "cancelled") return { outcome };
    const error = outcomes[outcome];
    return reply.status(error.code).send({ message: error.message });
  });
}
