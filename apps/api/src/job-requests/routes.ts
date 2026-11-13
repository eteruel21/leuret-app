import crypto from "node:crypto";

import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";

import { authenticateRequest, requireActiveUser, requireCompanyRole } from "../auth/authenticate.js";
import { notifyJobRequestCreated, notifyJobRequestMessage } from "../notifications/event-service.js";
import { safeErrorDetails } from "../security/redaction.js";
import { deleteStorageFile, getStorageSignedUrl, uploadStorageFile } from "../storage/provider.js";

import {
  addJobRequestPhotoRepo,
  closeJobRequestRepo,
  createJobRequestRepo,
  deleteJobRequestPhotoRepo,
  findJobRequestFeedRepo,
  findMatchingRecipientsRepo,
  findMyJobRequestsRepo,
  getContractorJobRequestRepo,
  getConversationRepo,
  getMyJobRequestRepo,
  sendJobRequestMessageRepo,
  startJobRequestQuoteRepo,
  type JobRequestMessageRow,
  type JobRequestPhotoRow
} from "./repository.js";
import {
  closeJobRequestSchema,
  companyParamsSchema,
  companyRequestParamsSchema,
  conversationParamsSchema,
  createJobRequestSchema,
  feedQuerySchema,
  photoParamsSchema,
  requestParamsSchema,
  sendJobRequestMessageSchema,
  uploadJobRequestPhotoSchema
} from "./schemas.js";

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const SIGNED_URL_MINUTES = 60;

function authenticatedUserId(request: FastifyRequest, reply: FastifyReply): string | null {
  const userId = request.authenticatedUser?.id;
  if (!userId) {
    reply.status(401).send({ message: "Se requiere autenticación." });
    return null;
  }
  return userId;
}

/**
 * Las funciones de la migración 042 lanzan mensajes en español con un código
 * conocido. Se devuelven tal cual; cualquier otro error sigue al manejador global.
 */
function sendDatabaseError(error: unknown, reply: FastifyReply): boolean {
  if (typeof error !== "object" || error === null || !("code" in error)) return false;
  const code = (error as { code?: unknown }).code;
  const message = error instanceof Error ? error.message : "No se pudo completar la acción.";
  const status =
    code === "22023" ? 400
      : code === "42501" ? 403
        : code === "P0002" ? 404
          : code === "55000" ? 409
            : null;
  if (!status) return false;
  reply.status(status).send({ message });
  return true;
}

function decodeImage(fileData: string): Buffer {
  return Buffer.from(fileData.replace(/^data:image\/[a-z]+;base64,/, ""), "base64");
}

function extensionFor(mimeType: string): string {
  return mimeType === "image/png" ? ".png" : mimeType === "image/webp" ? ".webp" : ".jpg";
}

function requestStorageKey(requestId: string, mimeType: string, folder?: "messages"): string {
  const base = folder ? `job-requests/${requestId}/${folder}` : `job-requests/${requestId}`;
  return `${base}/${crypto.randomUUID()}${extensionFor(mimeType)}`;
}

// La ruta interna del archivo nunca sale del servidor: solo la URL firmada.
async function signPhotos(photos: JobRequestPhotoRow[]) {
  return Promise.all(
    photos.map(async ({ storage_path, ...photo }) => ({
      ...photo,
      signedUrl: await getStorageSignedUrl(photo.id, storage_path, SIGNED_URL_MINUTES)
    }))
  );
}

async function signCover<T extends { cover_photo?: unknown }>(row: T) {
  const cover = row.cover_photo as { id?: string; storage_path?: string } | null | undefined;
  const coverUrl = cover?.id && cover.storage_path
    ? await getStorageSignedUrl(cover.id, cover.storage_path, SIGNED_URL_MINUTES)
    : null;
  const { cover_photo: _cover, ...rest } = row;
  return { ...rest, cover_photo_url: coverUrl };
}

async function signMessage(message: JobRequestMessageRow) {
  const { photo_storage_path, ...rest } = message;
  return {
    ...rest,
    photoUrl: photo_storage_path
      ? await getStorageSignedUrl(message.id, photo_storage_path, SIGNED_URL_MINUTES)
      : null
  };
}

async function removeUploadedFile(request: FastifyRequest, storagePath: string) {
  try {
    await deleteStorageFile(storagePath);
  } catch (cleanupError) {
    request.log.error({ cleanupError: safeErrorDetails(cleanupError), storagePath }, "No se pudo revertir la carga de una foto.");
  }
}

export async function registerJobRequestRoutes(app: FastifyInstance): Promise<void> {
  const activeUser = [authenticateRequest, requireActiveUser];
  const contractorRoles = requireCompanyRole(["owner", "admin", "estimator", "sales"]);
  const quotingRoles = requireCompanyRole(["owner", "admin", "estimator"]);

  // --- Cliente --------------------------------------------------------------

  app.post("/job-requests", { preHandler: activeUser }, async (request, reply) => {
    const userId = authenticatedUserId(request, reply);
    if (!userId) return;

    const parsed = createJobRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        message: "Revisa la petición: título (5–120), descripción (20–4000), tipo de trabajo, provincia y dirección.",
        errors: parsed.error.flatten().fieldErrors
      });
    }

    let requestId: string;
    try {
      requestId = await createJobRequestRepo(userId, parsed.data);
    } catch (error) {
      if (sendDatabaseError(error, reply)) return;
      throw error;
    }

    // Aviso a los contratistas de la categoría y zona (best-effort).
    try {
      const recipients = await findMatchingRecipientsRepo(userId, requestId);
      await notifyJobRequestCreated(recipients, {
        id: requestId,
        title: parsed.data.title,
        category: parsed.data.category,
        province: parsed.data.province
      });
    } catch (error) {
      request.log.error(safeErrorDetails(error), "No se pudo avisar de la petición nueva.");
    }

    return reply.status(201).send({ requestId });
  });

  app.get("/job-requests/mine", { preHandler: activeUser }, async (request, reply) => {
    const userId = authenticatedUserId(request, reply);
    if (!userId) return;

    const rows = await findMyJobRequestsRepo(userId);
    return { requests: await Promise.all(rows.map(signCover)) };
  });

  app.get("/job-requests/mine/:requestId", { preHandler: activeUser }, async (request, reply) => {
    const userId = authenticatedUserId(request, reply);
    if (!userId) return;

    const params = requestParamsSchema.safeParse(request.params);
    if (!params.success) return reply.status(400).send({ message: "Identificador de petición no válido." });

    const detail = await getMyJobRequestRepo(userId, params.data.requestId);
    if (!detail) return reply.status(404).send({ message: "No se encontró la petición." });

    return {
      request: detail.request,
      photos: await signPhotos(detail.photos),
      conversations: detail.conversations
    };
  });

  app.post("/job-requests/:requestId/close", { preHandler: activeUser }, async (request, reply) => {
    const userId = authenticatedUserId(request, reply);
    if (!userId) return;

    const params = requestParamsSchema.safeParse(request.params);
    const body = closeJobRequestSchema.safeParse(request.body ?? {});
    if (!params.success || !body.success) {
      return reply.status(400).send({ message: "El motivo admite 500 caracteres." });
    }

    try {
      const closed = await closeJobRequestRepo(userId, params.data.requestId, body.data.reason ?? null);
      if (!closed) return reply.status(409).send({ message: "La petición ya estaba cerrada o no es tuya." });
      return { closed: true };
    } catch (error) {
      if (sendDatabaseError(error, reply)) return;
      throw error;
    }
  });

  app.post("/job-requests/:requestId/photos", { preHandler: activeUser }, async (request, reply) => {
    const userId = authenticatedUserId(request, reply);
    if (!userId) return;

    const params = requestParamsSchema.safeParse(request.params);
    const body = uploadJobRequestPhotoSchema.safeParse(request.body);
    if (!params.success || !body.success) {
      return reply.status(400).send({ message: "La foto no es válida (JPG, PNG o WebP)." });
    }

    const buffer = decodeImage(body.data.fileData);
    if (buffer.length === 0) return reply.status(400).send({ message: "La foto está vacía." });
    if (buffer.length > MAX_IMAGE_BYTES) {
      return reply.status(413).send({ message: "La foto excede el tamaño máximo de 5 MB." });
    }

    const storagePath = requestStorageKey(params.data.requestId, body.data.mimeType);
    await uploadStorageFile({ storagePath, buffer, mimeType: body.data.mimeType });

    try {
      const photo = await addJobRequestPhotoRepo(
        userId,
        params.data.requestId,
        storagePath,
        body.data.mimeType,
        buffer.length
      );
      const [signed] = await signPhotos([photo]);
      return reply.status(201).send({ photo: signed });
    } catch (error) {
      await removeUploadedFile(request, storagePath);
      if (sendDatabaseError(error, reply)) return;
      throw error;
    }
  });

  app.delete("/job-requests/:requestId/photos/:photoId", { preHandler: activeUser }, async (request, reply) => {
    const userId = authenticatedUserId(request, reply);
    if (!userId) return;

    const params = photoParamsSchema.safeParse(request.params);
    if (!params.success) return reply.status(400).send({ message: "Parámetros no válidos." });

    try {
      const storagePath = await deleteJobRequestPhotoRepo(userId, params.data.requestId, params.data.photoId);
      if (!storagePath) return reply.status(404).send({ message: "No se encontró la foto o la petición está cerrada." });
      await removeUploadedFile(request, storagePath);
      return { success: true };
    } catch (error) {
      if (sendDatabaseError(error, reply)) return;
      throw error;
    }
  });

  // --- Contratista ----------------------------------------------------------

  app.get(
    "/companies/:companyId/job-requests",
    { preHandler: [...activeUser, contractorRoles] },
    async (request, reply) => {
      const userId = authenticatedUserId(request, reply);
      if (!userId) return;

      const params = companyParamsSchema.safeParse(request.params);
      const query = feedQuerySchema.safeParse(request.query ?? {});
      if (!params.success || !query.success) {
        return reply.status(400).send({ message: "Filtros no válidos." });
      }

      const feed = await findJobRequestFeedRepo(userId, params.data.companyId, query.data);
      return {
        requests: await Promise.all(feed.requests.map(signCover)),
        counts: feed.counts,
        limit: query.data.limit,
        offset: query.data.offset
      };
    }
  );

  app.get(
    "/companies/:companyId/job-requests/:requestId",
    { preHandler: [...activeUser, contractorRoles] },
    async (request, reply) => {
      const userId = authenticatedUserId(request, reply);
      if (!userId) return;

      const params = companyRequestParamsSchema.safeParse(request.params);
      if (!params.success) return reply.status(400).send({ message: "Parámetros no válidos." });

      const detail = await getContractorJobRequestRepo(userId, params.data.companyId, params.data.requestId);
      if (!detail) {
        return reply.status(404).send({ message: "La petición no existe o ya no está disponible." });
      }

      return {
        request: detail.request,
        photos: await signPhotos(detail.photos),
        quote: detail.quote
      };
    }
  );

  app.post(
    "/companies/:companyId/job-requests/:requestId/quote",
    { preHandler: [...activeUser, quotingRoles] },
    async (request, reply) => {
      const userId = authenticatedUserId(request, reply);
      if (!userId) return;

      const params = companyRequestParamsSchema.safeParse(request.params);
      if (!params.success) return reply.status(400).send({ message: "Parámetros no válidos." });

      try {
        const budgetId = await startJobRequestQuoteRepo(userId, params.data.companyId, params.data.requestId);
        return reply.status(201).send({ budgetId });
      } catch (error) {
        if (sendDatabaseError(error, reply)) return;
        throw error;
      }
    }
  );

  // --- Conversación (ambos lados) ---------------------------------------------

  app.get(
    "/job-requests/:requestId/conversations/:companyId",
    { preHandler: activeUser },
    async (request, reply) => {
      const userId = authenticatedUserId(request, reply);
      if (!userId) return;

      const params = conversationParamsSchema.safeParse(request.params);
      if (!params.success) return reply.status(400).send({ message: "Parámetros no válidos." });

      const conversation = await getConversationRepo(userId, params.data.requestId, params.data.companyId);
      if (!conversation) return reply.status(404).send({ message: "No se encontró la conversación." });

      return {
        ...conversation,
        messages: await Promise.all(conversation.messages.map(signMessage))
      };
    }
  );

  app.post(
    "/job-requests/:requestId/conversations/:companyId/messages",
    { preHandler: activeUser },
    async (request, reply) => {
      const userId = authenticatedUserId(request, reply);
      if (!userId) return;

      const params = conversationParamsSchema.safeParse(request.params);
      const body = sendJobRequestMessageSchema.safeParse(request.body);
      if (!params.success || !body.success) {
        return reply.status(400).send({ message: "Escribe un mensaje (máximo 2000 caracteres) o adjunta una foto." });
      }

      let storagePath: string | null = null;
      const mimeType = body.data.mimeType ?? "image/jpeg";
      if (body.data.fileData) {
        const buffer = decodeImage(body.data.fileData);
        if (buffer.length === 0) return reply.status(400).send({ message: "La foto está vacía." });
        if (buffer.length > MAX_IMAGE_BYTES) {
          return reply.status(413).send({ message: "La foto excede el tamaño máximo de 5 MB." });
        }
        storagePath = requestStorageKey(params.data.requestId, mimeType, "messages");
        await uploadStorageFile({ storagePath, buffer, mimeType });
      }

      let result: Awaited<ReturnType<typeof sendJobRequestMessageRepo>>;
      try {
        result = await sendJobRequestMessageRepo(
          userId,
          params.data.requestId,
          params.data.companyId,
          body.data.body ?? null,
          storagePath,
          storagePath ? mimeType : null
        );
      } catch (error) {
        if (storagePath) await removeUploadedFile(request, storagePath);
        if (sendDatabaseError(error, reply)) return;
        throw error;
      }

      const { company_name, title, requester_first_name, ...message } = result.message;

      try {
        await notifyJobRequestMessage(result.recipientIds, {
          requestId: params.data.requestId,
          companyId: params.data.companyId,
          senderSide: message.sender_side,
          companyName: company_name,
          requesterFirstName: requester_first_name,
          title,
          body: message.body
        });
      } catch (error) {
        request.log.error(safeErrorDetails(error), "No se pudo avisar del mensaje.");
      }

      return reply.status(201).send({ message: await signMessage(message) });
    }
  );
}
