import type { FastifyInstance } from "fastify";
import { z } from "zod";

import { env } from "../config/env.js";
import { withUserTransaction } from "../db/with-user-transaction.js";
import { authenticateRequest, requireActiveUser } from "./authenticate.js";
import {
  decryptMfaSecret,
  encryptMfaSecret,
  generateRecoveryCodes,
  hashRecoveryCode,
  isMfaConfigured,
  MFA_KEY_VERSION
} from "./mfa-crypto.js";
import {
  consumeMfaChallenge,
  consumeRecoveryCode,
  consumeTotpStep,
  findMfaChallenge,
  getMfaRecord,
  isMfaLocked,
  isSessionMfaVerified,
  logMfaEvent,
  markSessionMfaVerified,
  registerMfaFailure,
  replaceRecoveryCodes,
  resetMfaFailures,
  upsertPendingMfa
} from "./mfa-repository.js";
import {
  createSession,
  getUserStatus,
  loadOwnProfile,
  toPublicUserProfile,
  updateUserSignIn
} from "./repository.js";
import { getCookieOptions, getRefreshCookie, isTrustedWebOrigin } from "./routes.js";
import { requestUserAgent } from "./services.js";
import { hashSecureToken } from "./tokens.js";
import { base32Encode, buildOtpauthUri, generateTotpSecret, verifyTotp } from "./totp.js";
import { getClientIp } from "../security/client-ip.js";

const MFA_ISSUER = "Leuret";

const codeSchema = z.object({ code: z.string().trim().min(6).max(12) });

const verifySchema = z
  .object({
    mfaToken: z.string().trim().min(32).max(256),
    code: z.string().trim().min(6).max(12).optional(),
    recoveryCode: z.string().trim().min(8).max(16).optional(),
    clientType: z.enum(["native", "web", "app-web"]).optional()
  })
  .refine((value) => Boolean(value.code) !== Boolean(value.recoveryCode));

const notConfigured = {
  message: "La verificación en dos pasos no está configurada en el servidor."
} as const;
const lockedMessage = {
  message: "Demasiados intentos fallidos. Espera 15 minutos e inténtalo nuevamente."
} as const;

export async function registerMfaRoutes(app: FastifyInstance) {
  const preHandler = [authenticateRequest, requireActiveUser];

  app.addHook("onSend", async (_request, reply, payload) => {
    reply.header("Cache-Control", "no-store");
    return payload;
  });

  app.get("/auth/mfa/status", { preHandler }, async (request) => {
    const user = request.authenticatedUser!;
    return withUserTransaction(user.id, async (client) => {
      const record = await getMfaRecord(client, user.id);
      return {
        configured: isMfaConfigured(),
        enabled: Boolean(record?.confirmed_at),
        required: env.ADMIN_MFA_REQUIRED,
        sessionVerified: await isSessionMfaVerified(client, user.sessionId)
      };
    });
  });

  // Paso 1 de la activación: genera el secreto (sin confirmar) y la URI del QR.
  app.post(
    "/auth/mfa/enroll",
    { preHandler, config: { rateLimit: { max: env.NODE_ENV === "production" ? 5 : 100, timeWindow: "1 minute" } } },
    async (request, reply) => {
      if (!isMfaConfigured()) return reply.status(503).send(notConfigured);
      const userId = request.authenticatedUser!.id;

      return withUserTransaction(userId, async (client) => {
        const account = await client.query<{ role: string; email: string }>(
          `
            SELECT profile.role, account.email
            FROM public.profiles AS profile
            JOIN app_auth.users AS account ON account.id = profile.id
            WHERE profile.id = app.current_user_id()
          `
        );
        const row = account.rows[0];
        if (!row || row.role !== "super_admin") {
          return reply.status(403).send({ message: "Esta cuenta no puede activar la verificación en dos pasos." });
        }

        const existing = await getMfaRecord(client, userId, true);
        if (existing?.confirmed_at) {
          return reply.status(409).send({ message: "La verificación en dos pasos ya está activada." });
        }

        const secret = generateTotpSecret();
        const encrypted = encryptMfaSecret(secret);
        await upsertPendingMfa(client, userId, encrypted.ciphertext, encrypted.iv, MFA_KEY_VERSION);

        return {
          secret: base32Encode(secret),
          otpauthUri: buildOtpauthUri({ secret, accountName: row.email, issuer: MFA_ISSUER })
        };
      });
    }
  );

  // Paso 2: confirma con un código, entrega los códigos de recuperación (una sola vez)
  // y marca la sesión actual como verificada.
  app.post(
    "/auth/mfa/confirm",
    { preHandler, config: { rateLimit: { max: env.NODE_ENV === "production" ? 10 : 100, timeWindow: "1 minute" } } },
    async (request, reply) => {
      if (!isMfaConfigured()) return reply.status(503).send(notConfigured);
      const body = codeSchema.safeParse(request.body);
      if (!body.success) return reply.status(400).send({ message: "Introduce el código de 6 dígitos." });

      const user = request.authenticatedUser!;

      return withUserTransaction(user.id, async (client) => {
        const record = await getMfaRecord(client, user.id, true);
        if (!record || record.confirmed_at) {
          return reply.status(409).send({ message: "No hay una activación pendiente." });
        }
        if (isMfaLocked(record)) return reply.status(429).send(lockedMessage);

        const secret = decryptMfaSecret(record.secret_ciphertext, record.secret_iv);
        const step = verifyTotp(secret, body.data.code);
        if (step === null) {
          const locked = await registerMfaFailure(client, user.id);
          return reply.status(locked ? 429 : 400).send(
            locked ? lockedMessage : { message: "El código no es correcto. Revisa la hora de tu teléfono." }
          );
        }

        if (!(await consumeTotpStep(client, user.id, step, true))) {
          return reply.status(409).send({ message: "No se pudo confirmar. Inténtalo con un código nuevo." });
        }

        const recoveryCodes = generateRecoveryCodes();
        await replaceRecoveryCodes(client, user.id, recoveryCodes.map(hashRecoveryCode));
        await markSessionMfaVerified(client, user.sessionId, user.id);
        await logMfaEvent(client, user.id, "MFA_ENROLLED", { ip: getClientIp(request) });

        return { enabled: true, recoveryCodes };
      });
    }
  );

  // Segundo paso del login: canjea el desafío (mfaToken) por una sesión verificada.
  app.post(
    "/auth/mfa/verify",
    { config: { rateLimit: { max: env.NODE_ENV === "production" ? 10 : 100, timeWindow: "1 minute" } } },
    async (request, reply) => {
      if (!isMfaConfigured()) return reply.status(503).send(notConfigured);
      const body = verifySchema.safeParse(request.body);
      if (!body.success) {
        return reply.status(400).send({ message: "Introduce el código de verificación." });
      }

      const { mfaToken, code, recoveryCode, clientType } = body.data;
      const cookieName = getRefreshCookie(clientType);
      if (cookieName && !isTrustedWebOrigin(request, cookieName)) {
        return reply.status(403).send({ message: "El origen no está autorizado." });
      }

      const tokenHash = hashSecureToken(mfaToken);
      const challenge = await findMfaChallenge(tokenHash);
      if (!challenge) {
        return reply.status(401).send({ message: "La verificación expiró. Inicia sesión nuevamente." });
      }
      const userId = challenge.user_id;

      try {
        return await withUserTransaction(userId, async (client) => {
          const record = await getMfaRecord(client, userId, true);
          if (!record?.confirmed_at) {
            return reply.status(401).send({ message: "La verificación expiró. Inicia sesión nuevamente." });
          }
          if (isMfaLocked(record)) return reply.status(429).send(lockedMessage);

          let verified = false;
          let recoveryCodesRemaining: number | null = null;

          if (code) {
            const secret = decryptMfaSecret(record.secret_ciphertext, record.secret_iv);
            const lastUsed = record.last_used_step === null ? null : Number(record.last_used_step);
            const step = verifyTotp(secret, code, { lastUsedStep: lastUsed });
            verified = step !== null && (await consumeTotpStep(client, userId, step, false));
          } else if (recoveryCode) {
            recoveryCodesRemaining = await consumeRecoveryCode(client, userId, hashRecoveryCode(recoveryCode));
            verified = recoveryCodesRemaining !== null;
            if (verified) await resetMfaFailures(client, userId);
          }

          if (!verified) {
            const locked = await registerMfaFailure(client, userId);
            await logMfaEvent(client, userId, locked ? "MFA_LOCKED" : "MFA_FAILED", {
              ip: getClientIp(request),
              method: code ? "totp" : "recovery_code"
            });
            if (locked) await consumeMfaChallenge(client, tokenHash);
            return reply.status(locked ? 429 : 401).send(
              locked ? lockedMessage : { message: "El código no es correcto." }
            );
          }

          if (!(await consumeMfaChallenge(client, tokenHash))) {
            return reply.status(401).send({ message: "La verificación expiró. Inicia sesión nuevamente." });
          }

          const profile = await loadOwnProfile(client);
          if (!profile) return reply.status(404).send({ message: "No se encontró el perfil." });

          const status = getUserStatus(profile);
          if (status === "suspended" || status === "deactivated") {
            return reply.status(403).send({ message: "Esta cuenta está suspendida o desactivada." });
          }

          const tokens = await createSession(client, userId, request.ip, requestUserAgent(request));
          await markSessionMfaVerified(client, tokens.sessionId, userId);
          await updateUserSignIn(client, userId);
          await logMfaEvent(
            client,
            userId,
            recoveryCodesRemaining === null ? "MFA_VERIFIED" : "MFA_RECOVERY_CODE_USED",
            { ip: getClientIp(request), ...(recoveryCodesRemaining === null ? {} : { remaining: recoveryCodesRemaining }) }
          );

          const publicProfile = toPublicUserProfile(profile, status);
          const extra = recoveryCodesRemaining === null ? {} : { recoveryCodesRemaining };

          if (cookieName) {
            const { refreshToken, ...restTokens } = tokens;
            reply.setCookie(cookieName, refreshToken, getCookieOptions(cookieName));
            return { ...restTokens, user: publicProfile, requiresApproval: status !== "active", ...extra };
          }

          return { ...tokens, user: publicProfile, requiresApproval: status !== "active", ...extra };
        });
      } catch (error) {
        request.log.error(
          { operation: "mfa-verify", errorType: error instanceof Error ? error.name : typeof error },
          "Falló la verificación en dos pasos."
        );
        return reply.status(500).send({ message: "No se pudo completar la verificación." });
      }
    }
  );
}
