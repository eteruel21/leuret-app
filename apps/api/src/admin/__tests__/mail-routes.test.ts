import Fastify from "fastify";
import { beforeEach, describe, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  listMailThreads: vi.fn(),
  listMailMessages: vi.fn(),
  readMailMessage: vi.fn(),
  getMailAttachmentDownload: vi.fn(),
  markMailThreadRead: vi.fn(),
  deleteMailThread: vi.fn(),
  restoreMailThread: vi.fn(),
  replyToMailMessage: vi.fn()
}));

vi.mock("../authorize.js", () => ({
  requireSuperAdmin: async (request: any, reply: any) => {
    if (request.headers.authorization !== "Bearer authorized-test-admin") {
      return reply.status(403).send({ message: "Acceso restringido." });
    }
  }
}));

vi.mock("../mail-service.js", () => ({
  MailProviderError: class MailProviderError extends Error {
    constructor(message: string, public statusCode = 503) {
      super(message);
    }
  },
  ...mocks
}));

import { registerAdminMailRoutes } from "../mail-routes.js";

const THREAD_ID = "11111111-1111-4111-8111-111111111111";
const EMAIL_ID = "22222222-2222-4222-8222-222222222222";
const IDEMPOTENCY_KEY = "33333333-3333-4333-8333-333333333333";

async function createApp() {
  const app = Fastify();
  await app.register(registerAdminMailRoutes);
  return app;
}

function auth() {
  return { authorization: "Bearer authorized-test-admin" };
}

describe("LEURET ADMIN - correos Resend", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.listMailThreads.mockResolvedValue({ data: [], hasMore: false });
    mocks.listMailMessages.mockResolvedValue({ data: [], hasMore: false });
    mocks.readMailMessage.mockResolvedValue({ id: EMAIL_ID, text: "Consulta" });
    mocks.getMailAttachmentDownload.mockResolvedValue({ filename: "archivo.pdf", downloadUrl: "https://example.com/signed" });
    mocks.markMailThreadRead.mockResolvedValue(undefined);
    mocks.replyToMailMessage.mockResolvedValue({ id: "email-outbound-1" });
    mocks.deleteMailThread.mockResolvedValue({ deleted: true });
    mocks.restoreMailThread.mockResolvedValue(undefined);
  });

  test("bloquea la lectura sin superadministrador", async () => {
    const app = await createApp();
    const response = await app.inject({ method: "GET", url: "/admin/mail/privacy/threads" });
    expect(response.statusCode).toBe(403);
    expect(mocks.listMailThreads).not.toHaveBeenCalled();
    await app.close();
  });

  test("valida el buzón antes de consultar el proveedor", async () => {
    const app = await createApp();
    const response = await app.inject({ method: "GET", url: "/admin/mail/unknown/threads", headers: auth() });
    expect(response.statusCode).toBe(400);
    expect(mocks.listMailThreads).not.toHaveBeenCalled();
    await app.close();
  });

  test("lee la bandeja legal y fuerza no-store", async () => {
    const app = await createApp();
    const response = await app.inject({
      method: "GET",
      url: "/admin/mail/legal/threads?folder=sent",
      headers: auth()
    });
    expect(response.statusCode).toBe(200);
    expect(response.headers["cache-control"]).toBe("private, no-store");
    expect(mocks.listMailThreads).toHaveBeenCalledWith("legal", "sent", undefined);
    await app.close();
  });

  test("no acepta identificadores arbitrarios en una ruta de mensajes", async () => {
    const app = await createApp();
    const response = await app.inject({
      method: "GET",
      url: "/admin/mail/privacy/threads/not-a-uuid/emails",
      headers: auth()
    });
    expect(response.statusCode).toBe(400);
    expect(mocks.listMailMessages).not.toHaveBeenCalled();
    await app.close();
  });

  test("lee el correo de una conversación autorizada", async () => {
    const app = await createApp();
    const response = await app.inject({
      method: "GET",
      url: `/admin/mail/privacy/threads/${THREAD_ID}/emails/${EMAIL_ID}`,
      headers: auth()
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().text).toBe("Consulta");
    expect(mocks.readMailMessage).toHaveBeenCalledWith("privacy", THREAD_ID, EMAIL_ID);
    await app.close();
  });


  test("el adjunto exige autenticación y UUID válidos", async () => {
    const app = await createApp();
    const url = `/admin/mail/privacy/threads/${THREAD_ID}/emails/${EMAIL_ID}/attachments/${IDEMPOTENCY_KEY}`;
    const blocked = await app.inject({ method: "GET", url });
    expect(blocked.statusCode).toBe(403);
    expect(mocks.getMailAttachmentDownload).not.toHaveBeenCalled();
    const allowed = await app.inject({ method: "GET", url, headers: auth() });
    expect(allowed.statusCode).toBe(200);
    expect(mocks.getMailAttachmentDownload).toHaveBeenCalledWith(
      "privacy", THREAD_ID, EMAIL_ID, IDEMPOTENCY_KEY
    );
    await app.close();
  });

  test("rechaza respuestas vacías antes de enviar correo", async () => {
    const app = await createApp();
    const response = await app.inject({
      method: "POST",
      url: `/admin/mail/privacy/threads/${THREAD_ID}/emails/${EMAIL_ID}/reply`,
      headers: auth(),
      payload: { text: " ", idempotencyKey: IDEMPOTENCY_KEY }
    });
    expect(response.statusCode).toBe(400);
    expect(mocks.replyToMailMessage).not.toHaveBeenCalled();
    await app.close();
  });

  test("envía solo una respuesta explícita con clave de idempotencia", async () => {
    const app = await createApp();
    const response = await app.inject({
      method: "POST",
      url: `/admin/mail/legal/threads/${THREAD_ID}/emails/${EMAIL_ID}/reply`,
      headers: auth(),
      payload: { text: "Gracias por escribir.", idempotencyKey: IDEMPOTENCY_KEY }
    });
    expect(response.statusCode).toBe(200);
    expect(mocks.replyToMailMessage).toHaveBeenCalledWith(
      "legal", THREAD_ID, EMAIL_ID, "Gracias por escribir.", IDEMPOTENCY_KEY
    );
    await app.close();
  });

  test("rechaza respuestas sin superadministrador", async () => {
    const app = await createApp();
    const response = await app.inject({
      method: "POST",
      url: `/admin/mail/privacy/threads/${THREAD_ID}/emails/${EMAIL_ID}/reply`,
      payload: { text: "Secreto", idempotencyKey: IDEMPOTENCY_KEY }
    });
    expect(response.statusCode).toBe(403);
    expect(mocks.replyToMailMessage).not.toHaveBeenCalled();
    await app.close();
  });

  test("eliminar exige superadministrador", async () => {
    const app = await createApp();
    const response = await app.inject({
      method: "DELETE",
      url: `/admin/mail/privacy/threads/${THREAD_ID}`
    });
    expect(response.statusCode).toBe(403);
    expect(mocks.deleteMailThread).not.toHaveBeenCalled();
    await app.close();
  });

  test("eliminar valida el buzón y el identificador", async () => {
    const app = await createApp();
    const badBox = await app.inject({ method: "DELETE", url: `/admin/mail/otro/threads/${THREAD_ID}`, headers: auth() });
    const badId = await app.inject({ method: "DELETE", url: "/admin/mail/legal/threads/not-a-uuid", headers: auth() });
    expect(badBox.statusCode).toBe(400);
    expect(badId.statusCode).toBe(400);
    expect(mocks.deleteMailThread).not.toHaveBeenCalled();
    await app.close();
  });

  test("elimina la conversación (papelera) de la bandeja indicada", async () => {
    const app = await createApp();
    const response = await app.inject({
      method: "DELETE",
      url: `/admin/mail/legal/threads/${THREAD_ID}`,
      headers: auth()
    });
    expect(response.statusCode).toBe(200);
    expect(response.headers["cache-control"]).toBe("private, no-store");
    expect(response.json()).toEqual({ success: true, deleted: true });
    expect(mocks.deleteMailThread).toHaveBeenCalledWith("legal", THREAD_ID);
    await app.close();
  });

  test("restaura una conversación de la papelera", async () => {
    const app = await createApp();
    const blocked = await app.inject({ method: "POST", url: `/admin/mail/privacy/threads/${THREAD_ID}/restore` });
    expect(blocked.statusCode).toBe(403);
    const response = await app.inject({
      method: "POST",
      url: `/admin/mail/privacy/threads/${THREAD_ID}/restore`,
      headers: auth()
    });
    expect(response.statusCode).toBe(200);
    expect(mocks.restoreMailThread).toHaveBeenCalledTimes(1);
    expect(mocks.restoreMailThread).toHaveBeenCalledWith("privacy", THREAD_ID);
    await app.close();
  });

  test("lista la papelera", async () => {
    const app = await createApp();
    const response = await app.inject({ method: "GET", url: "/admin/mail/privacy/threads?folder=trash", headers: auth() });
    expect(response.statusCode).toBe(200);
    expect(mocks.listMailThreads).toHaveBeenCalledWith("privacy", "trash", undefined);
    await app.close();
  });
});
