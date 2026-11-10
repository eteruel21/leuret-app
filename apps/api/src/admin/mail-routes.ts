import type { FastifyInstance, FastifyReply } from "fastify";
import { z } from "zod";
import { requireSuperAdmin } from "./authorize.js";
import {
  MailProviderError,
  listMailThreads,
  listMailMessages,
  readMailMessage,
  markMailThreadRead,
  replyToMailMessage
} from "./mail-service.js";

const mailboxSchema = z.enum(["privacy", "legal"]);
const threadParamsSchema = z.object({
  mailbox: mailboxSchema,
  threadId: z.uuid()
});
const emailParamsSchema = threadParamsSchema.extend({
  emailId: z.uuid()
});
const querySchema = z.object({
  folder: z.enum(["inbox", "sent"]).default("inbox"),
  after: z.uuid().optional()
});
const cursorSchema = z.object({
  after: z.uuid().optional()
});
const replySchema = z.object({
  text: z.string().trim().min(1).max(20000),
  idempotencyKey: z.uuid()
}).strict();

function fail(reply: FastifyReply, error: unknown) {
  if (error instanceof MailProviderError) {
    return reply.status(error.statusCode).send({ message: error.message });
  }
  throw error;
}

export async function registerAdminMailRoutes(app: FastifyInstance): Promise<void> {
  app.get("/admin/mail/:mailbox/threads", { preHandler: requireSuperAdmin }, async (request, reply) => {
    reply.header("Cache-Control", "private, no-store");
    const mailbox = mailboxSchema.safeParse((request.params as { mailbox?: unknown }).mailbox);
    const query = querySchema.safeParse(request.query);
    if (!mailbox.success || !query.success) {
      return reply.status(400).send({ message: "Parámetros de correo no válidos." });
    }
    try {
      return await listMailThreads(mailbox.data, query.data.folder, query.data.after);
    } catch (error) {
      return fail(reply, error);
    }
  });

  app.get("/admin/mail/:mailbox/threads/:threadId/emails", { preHandler: requireSuperAdmin }, async (request, reply) => {
    reply.header("Cache-Control", "private, no-store");
    const params = threadParamsSchema.safeParse(request.params);
    const query = cursorSchema.safeParse(request.query);
    if (!params.success || !query.success) {
      return reply.status(400).send({ message: "Parámetros de correo no válidos." });
    }
    try {
      return await listMailMessages(params.data.mailbox, params.data.threadId, query.data.after);
    } catch (error) {
      return fail(reply, error);
    }
  });

  app.get("/admin/mail/:mailbox/threads/:threadId/emails/:emailId", { preHandler: requireSuperAdmin }, async (request, reply) => {
    reply.header("Cache-Control", "private, no-store");
    const params = emailParamsSchema.safeParse(request.params);
    if (!params.success) {
      return reply.status(400).send({ message: "Mensaje no válido." });
    }
    try {
      return await readMailMessage(params.data.mailbox, params.data.threadId, params.data.emailId);
    } catch (error) {
      return fail(reply, error);
    }
  });

  app.patch("/admin/mail/:mailbox/threads/:threadId/read", { preHandler: requireSuperAdmin }, async (request, reply) => {
    reply.header("Cache-Control", "private, no-store");
    const params = threadParamsSchema.safeParse(request.params);
    if (!params.success) {
      return reply.status(400).send({ message: "Mensaje no válido." });
    }
    try {
      await markMailThreadRead(params.data.mailbox, params.data.threadId);
      return { success: true };
    } catch (error) {
      return fail(reply, error);
    }
  });

  app.post("/admin/mail/:mailbox/threads/:threadId/emails/:emailId/reply", { preHandler: requireSuperAdmin }, async (request, reply) => {
    reply.header("Cache-Control", "private, no-store");
    const params = emailParamsSchema.safeParse(request.params);
    const body = replySchema.safeParse(request.body);
    if (!params.success || !body.success) {
      return reply.status(400).send({ message: "Revisa el texto de la respuesta y vuelve a intentarlo." });
    }
    try {
      const sent = await replyToMailMessage(
        params.data.mailbox,
        params.data.threadId,
        params.data.emailId,
        body.data.text,
        body.data.idempotencyKey
      );
      return { success: true, sent };
    } catch (error) {
      return fail(reply, error);
    }
  });
}
