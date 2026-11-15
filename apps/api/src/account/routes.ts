import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";

import { authenticateRequest } from "../auth/authenticate.js";
import { env } from "../config/env.js";
import { withUserTransaction } from "../db/with-user-transaction.js";
import { safeErrorDetails } from "../security/redaction.js";
import {
  generateAccountExportToken,
  verifyAccountExportToken
} from "../storage/signed-url.js";
import {
  isObjectStorageConfigured
} from "../storage/provider.js";
import {
  AccountNotAvailableError,
  buildAccountExport
} from "./export.js";
import {
  type AccountDeletionScope,
  type RawRetainedCategory,
  buildDeletionPreview,
  describeRetainedCategories
} from "./retention.js";
import { processAccountDeletionStorageQueue } from "./storage-cleanup.js";
import {
  accountLegalConfirmations,
  hasCurrentLegalVersions,
  legalDocumentTypes,
  loadCurrentLegalStatus,
  recordLegalConfirmations,
  staleLegalDocuments
} from "./legal-acceptances.js";
import { LEGAL_DOCUMENTS, LEGAL_STYLESHEET } from "./legal-content.js";

const EXPORT_LINK_MINUTES = 10;

type DeleteOwnAccountResult = {
  deletedAt: string;
  deleted: Record<string, number>;
  storageObjectsQueued: number;
  retained: RawRetainedCategory[];
  retentionUntil: string | null;
};

type DatabaseErrorLike = {
  code?: string;
  detail?: string;
  hint?: string;
  message?: string;
};

function getRefreshTokenClearOptions() {
  const isProductionOrStaging =
    env.NODE_ENV === "production" || env.NODE_ENV === "staging";
  const options: {
    path: string;
    httpOnly: boolean;
    secure: boolean;
    sameSite: "none" | "lax";
    domain?: string;
  } = {
    path: "/",
    httpOnly: true,
    secure: isProductionOrStaging,
    sameSite: isProductionOrStaging ? "none" : "lax"
  };

  if (env.COOKIE_DOMAIN) {
    options.domain = env.COOKIE_DOMAIN;
  }

  return options;
}

function requestOrigin(request: FastifyRequest): string {
  return `${request.protocol}://${request.host}`;
}

function exportFileName(): string {
  return `leuret-datos-${new Date().toISOString().slice(0, 10)}.json`;
}

function parseBlockers(detail: string | undefined): AccountDeletionScope["blockers"] {
  if (!detail) return [];
  try {
    const parsed: unknown = JSON.parse(detail);
    return Array.isArray(parsed) ? parsed as AccountDeletionScope["blockers"] : [];
  } catch {
    return [];
  }
}

async function sendAccountExport(
  app: FastifyInstance,
  request: FastifyRequest,
  reply: FastifyReply,
  userId: string
) {
  try {
    const exportData = await buildAccountExport(userId, requestOrigin(request));

    reply.header(
      "Content-Disposition",
      `attachment; filename="${exportFileName()}"`
    );
    reply.header("Content-Type", "application/json; charset=utf-8");
    reply.header("Cache-Control", "no-store");
    return exportData;
  } catch (error) {
    if (error instanceof AccountNotAvailableError) {
      return reply.status(410).send({
        message: "La cuenta ya no está disponible."
      });
    }

    app.log.error(safeErrorDetails(error), "Falló una operación de cuenta.");
    return reply.status(500).send({
      message: "Error al exportar los datos de la cuenta."
    });
  }
}

export async function registerAccountLegalRoutes(
  app: FastifyInstance
): Promise<void> {
  app.get("/legal/legal.css", async (_request, reply) =>
    reply.type("text/css; charset=utf-8").send(LEGAL_STYLESHEET)
  );

  for (const type of legalDocumentTypes) {
    const { document, html } = LEGAL_DOCUMENTS[type];
    app.get(`/legal/${type}`, async () => document);

    app.get<{ Params: { version: string } }>(
      `/legal/${type}/version/:version`,
      async (request, reply) => {
        if (request.params.version !== document.version) {
          return reply.status(409).type("text/plain; charset=utf-8").send(staleLegalDocuments.message);
        }
        return reply
          .header(
            "Content-Security-Policy",
            "default-src 'none'; style-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'"
          )
          .type("text/html; charset=utf-8")
          .send(html);
      }
    );
  }

  app.get("/account/legal-acceptances", { preHandler: authenticateRequest }, async (request, reply) => {
    const userId = request.authenticatedUser?.id;
    if (!userId) return reply.status(401).send({ message: "Se requiere autenticación." });
    return withUserTransaction(userId, loadCurrentLegalStatus);
  });

  app.post("/account/legal-acceptances", { preHandler: authenticateRequest }, async (request, reply) => {
    const userId = request.authenticatedUser?.id;
    if (!userId) return reply.status(401).send({ message: "Se requiere autenticación." });

    const parsed = accountLegalConfirmations.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ message: "Selecciona los documentos que quieres confirmar." });
    }
    if (!hasCurrentLegalVersions(parsed.data)) {
      return reply.status(409).send(staleLegalDocuments);
    }

    const status = await withUserTransaction(userId, async (client) => {
      const account = await client.query(
        `SELECT id FROM app_auth.users
         WHERE id = app.current_user_id() AND deleted_at IS NULL
         FOR UPDATE`
      );
      if (!account.rows[0]) return null;

      await recordLegalConfirmations(client, parsed.data, "account");
      if (parsed.data.terms) {
        await client.query(
          `UPDATE public.profiles SET terms_accepted = true
           WHERE id = app.current_user_id() AND terms_accepted IS DISTINCT FROM true`
        );
      }
      return loadCurrentLegalStatus(client);
    });

    return status ?? reply.status(404).send({ message: "No se encontró la cuenta." });
  });

  // Exportación de datos (acceso y portabilidad). Incluye un índice de los
  // documentos y fotos del usuario con enlaces firmados de 24 horas.
  app.get(
    "/account/export",
    {
      preHandler: authenticateRequest,
      config: { rateLimit: { max: 10, timeWindow: "1 minute" } }
    },
    async (request, reply) => {
      const userId = request.authenticatedUser?.id;
      if (!userId) {
        return reply.status(401).send({
          message: "Se requiere autenticación."
        });
      }

      return sendAccountExport(app, request, reply, userId);
    }
  );

  // En iOS y Android la app no puede guardar el JSON como archivo: pide un
  // enlace de 10 minutos y lo abre en el navegador, que lo descarga.
  app.post(
    "/account/export/link",
    {
      preHandler: authenticateRequest,
      config: { rateLimit: { max: 10, timeWindow: "1 minute" } }
    },
    async (request, reply) => {
      const userId = request.authenticatedUser?.id;
      if (!userId) {
        return reply.status(401).send({
          message: "Se requiere autenticación."
        });
      }

      const token = await generateAccountExportToken(userId, EXPORT_LINK_MINUTES);
      reply.header("Cache-Control", "no-store");
      return {
        path: `/account/export/download?token=${encodeURIComponent(token)}`,
        expiresAt: new Date(Date.now() + EXPORT_LINK_MINUTES * 60_000).toISOString()
      };
    }
  );

  app.get(
    "/account/export/download",
    {
      config: { rateLimit: { max: 10, timeWindow: "1 minute" } }
    },
    async (request, reply) => {
      const token = (request.query as { token?: unknown }).token;
      const userId =
        typeof token === "string" && token
          ? await verifyAccountExportToken(token)
          : null;

      if (!userId) {
        return reply.status(403).send({
          message: "El enlace de descarga no es válido o venció. Genera uno nuevo desde la app."
        });
      }

      reply.header("Referrer-Policy", "no-referrer");
      return sendAccountExport(app, request, reply, userId);
    }
  );

  // Qué se eliminará, qué se conserva y por qué, y si algo lo impide.
  app.get(
    "/account/deletion-preview",
    {
      preHandler: authenticateRequest
    },
    async (request, reply) => {
      const userId = request.authenticatedUser?.id;
      if (!userId) {
        return reply.status(401).send({
          message: "Se requiere autenticación."
        });
      }

      try {
        const scope = await withUserTransaction(userId, async (client) => {
          const result = await client.query<{ scope: AccountDeletionScope; legalAcceptances: number }>(
            `SELECT private.account_deletion_preview() AS scope,
                    (SELECT count(*)::integer FROM app_auth.legal_acceptances
                     WHERE user_id = app.current_user_id()) AS "legalAcceptances"`
          );
          const row = result.rows[0];
          if (row?.scope && row.legalAcceptances > 0) {
            row.scope.toDelete.legalAcceptances = row.legalAcceptances;
          }
          return row?.scope;
        });

        if (!scope) {
          return reply.status(404).send({
            message: "No se encontró la cuenta."
          });
        }

        reply.header("Cache-Control", "no-store");
        return buildDeletionPreview(scope);
      } catch (error) {
        app.log.error(safeErrorDetails(error), "Falló una operación de cuenta.");
        return reply.status(500).send({
          message: "No se pudo preparar la eliminación de la cuenta."
        });
      }
    }
  );

  // Eliminación de cuenta. Toda la lógica de datos vive en
  // private.delete_own_account() (migración 045), en una sola transacción.
  app.delete(
    "/account",
    {
      preHandler: authenticateRequest
    },
    async (request, reply) => {
      const userId = request.authenticatedUser?.id;
      if (!userId) {
        return reply.status(401).send({
          message: "Se requiere autenticación."
        });
      }

      const requiresExternalStorage =
        env.NODE_ENV === "production" || env.NODE_ENV === "staging";

      if (requiresExternalStorage && !isObjectStorageConfigured()) {
        app.log.error("El almacenamiento de objetos no está configurado; no se elimina la cuenta.");
        return reply.status(503).send({
          message: "No podemos eliminar la cuenta en este momento. Inténtalo más tarde."
        });
      }

      let deletion: DeleteOwnAccountResult;

      try {
        const result = await withUserTransaction(userId, async (client) => {
          const response = await client.query<{ result: DeleteOwnAccountResult }>(
            `SELECT private.delete_own_account() AS result`
          );
          return response.rows[0]?.result;
        });

        if (!result) {
          throw new Error("La eliminación no devolvió resultado.");
        }
        deletion = result;
      } catch (error) {
        const databaseError = error as DatabaseErrorLike;

        if (
          databaseError.code === "55000" &&
          databaseError.hint === "account_deletion_blocked_by_company_ownership"
        ) {
          return reply.status(409).send({
            code: "COMPANY_OWNERSHIP_TRANSFER_REQUIRED",
            message:
              "Eres el único propietario de una empresa con otros miembros. Transfiere la propiedad o elimina a los miembros antes de eliminar tu cuenta.",
            blockers: parseBlockers(databaseError.detail)
          });
        }

        if (databaseError.code === "55000") {
          return reply.status(409).send({
            code: "ACCOUNT_ALREADY_DELETED",
            message: "La cuenta ya fue eliminada."
          });
        }

        app.log.error(safeErrorDetails(error), "Falló una operación de cuenta.");
        return reply.status(500).send({
          message: "Error al procesar la eliminación de la cuenta."
        });
      }

      const objectCount = Number(deletion.storageObjectsQueued ?? 0);
      let completedStorageObjectCount = 0;
      let failedStorageObjectCount = 0;

      if (objectCount > 0) {
        try {
          const cleanupResult = await processAccountDeletionStorageQueue({
            userId,
            limit: objectCount
          });

          completedStorageObjectCount = Math.min(cleanupResult.completed, objectCount);
          failedStorageObjectCount = cleanupResult.failed;
        } catch (error) {
          app.log.error(
            safeErrorDetails(error),
            "La cuenta fue anonimizada; la cola durable realizará la limpieza pendiente."
          );
        }
      }

      const pendingStorageObjectCount = Math.max(
        objectCount - completedStorageObjectCount,
        0
      );

      const retained = describeRetainedCategories(deletion.retained);
      const sharedProjectPhotosPreserved =
        retained.find((item) => item.category === "team_contributions")
          ?.counts.projectPhotos ?? 0;

      reply.clearCookie(
        "refreshToken",
        getRefreshTokenClearOptions()
      );

      return {
        success: true,
        accountStatus: "deleted",
        deletedAt: deletion.deletedAt,
        authenticationDisabled: true,
        profilePersonalDataAnonymized: true,
        sessionsRevoked: true,
        deleted: deletion.deleted,
        retained,
        retentionUntil: deletion.retentionUntil,
        storageCleanup: {
          status:
            objectCount === 0
              ? "not_required"
              : pendingStorageObjectCount === 0
                ? "completed"
                : "queued_for_retry",
          objectCount,
          completedObjectCount: completedStorageObjectCount,
          pendingObjectCount: pendingStorageObjectCount,
          failedObjectCount: failedStorageObjectCount,
          retryScheduled: pendingStorageObjectCount > 0,
          sharedProjectPhotosPreserved,
          note:
            objectCount === 0
              ? "No había archivos personales que eliminar."
              : pendingStorageObjectCount === 0
                ? "Tus documentos y fotos personales fueron eliminados."
                : "La cuenta fue anonimizada; el sistema volverá a intentar eliminar los archivos pendientes."
        }
      };
    }
  );
}
