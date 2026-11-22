import type { FastifyInstance, FastifyRequest } from "fastify";
import {
  hasCurrentLegalVersions,
  recordLegalConfirmations,
  staleLegalDocuments
} from "../account/legal-acceptances.js";
import { env, webAuthOrigins } from "../config/env.js";
import { getClientIp } from "../security/client-ip.js";
import { pool } from "../db/pool.js";
import { withUserTransaction } from "../db/with-user-transaction.js";
import { authenticateRequest } from "./authenticate.js";
import {
  createAccessToken,
  createRefreshToken,
  generateSecureToken,
  hashSecureToken,
  hashRefreshToken
} from "./tokens.js";
import {
  loginSchema,
  logoutSchema,
  registerSchema,
  refreshSchema,
  verifyEmailSchema,
  resendVerificationSchema,
  recoverPasswordSchema,
  resetPasswordSchema,
  revokeSessionSchema
} from "./schemas.js";
import {
  findUserByEmail,
  insertUser,
  insertIdentity,
  insertToken,
  invalidateOldTokens,
  getUserStatus,
  toPublicUserProfile,
  loadOwnProfile,
  createSession,
  updateUserSignIn,
  findSessionByRefreshTokenHash,
  updateSessionRotation,
  revokeSession,
  consumeTokenByHash,
  confirmEmail,
  updateUserPassword,
  revokeAllUserSessions
} from "./repository.js";
import { getMfaRecord } from "./mfa-repository.js";
import { isMfaConfigured } from "./mfa-crypto.js";
import {
  verifyCaptcha,
  requestUserAgent,
  hashPassword,
  comparePassword,
  comparePasswordAgainstDummy
} from "./services.js";
import {
  sendVerificationEmail,
  sendPasswordResetEmail
} from "../services/email.js";

function logAuthError(
  request: FastifyRequest,
  operation: string,
  error: unknown
): void {
  request.log.error(
    {
      operation,
      errorType: error instanceof Error ? error.name : typeof error
    },
    "Falló una operación de autenticación."
  );
}

const genericVerificationResponse = {
  success: true,
  message: "Si el correo está registrado, recibirás un nuevo enlace de verificación."
} as const;

const genericPasswordRecoveryResponse = {
  success: true,
  message: "Si tu correo está registrado, recibirás un enlace para restablecer tu contraseña."
} as const;

export function getRefreshCookie(clientType: "native" | "web" | "app-web" | undefined) {
  if (clientType === "app-web") return "appRefreshToken";
  if (clientType === "web") return "refreshToken";
  return undefined;
}

export function isTrustedWebOrigin(request: FastifyRequest, cookieName: keyof typeof webAuthOrigins): boolean {
  const origin = request.headers.origin;
  return typeof origin === "string" && webAuthOrigins[cookieName].includes(origin);
}

export function getCookieOptions(cookieName: "refreshToken" | "appRefreshToken") {
  const isProductionOrStaging = env.NODE_ENV === "production" || env.NODE_ENV === "staging";
  const maxAgeSeconds = env.REFRESH_TOKEN_DAYS * 24 * 60 * 60;
  const expiresDate = new Date(Date.now() + maxAgeSeconds * 1000);

  const options: {
    path: string;
    httpOnly: boolean;
    secure: boolean;
    sameSite: "none" | "lax";
    maxAge: number;
    expires: Date;
    domain?: string;
  } = {
    path: cookieName === "appRefreshToken" ? "/auth" : "/",
    httpOnly: true,
    secure: isProductionOrStaging,
    sameSite: isProductionOrStaging ? "none" : "lax",
    maxAge: maxAgeSeconds,
    expires: expiresDate
  };

  if (cookieName === "refreshToken" && env.COOKIE_DOMAIN) {
    options.domain = env.COOKIE_DOMAIN;
  }

  return options;
}

export async function registerAuthRoutes(app: FastifyInstance): Promise<void> {
  app.post(
    "/auth/register",
    {
      config: {
        rateLimit: {
          max: env.NODE_ENV === "production" ? 5 : 100,
          timeWindow: "1 hour"
        }
      }
    },
    async (request, reply) => {
      const parsedBody = registerSchema.safeParse(request.body);
      if (!parsedBody.success) {
        const fields = parsedBody.error.flatten().fieldErrors;
        if (fields.legalConfirmations) {
          return reply.status(400).send({
            code: "LEGAL_CONFIRMATIONS_REQUIRED",
            message: "Para registrarte, acepta los Términos y confirma que leíste la Política de Privacidad. Si aparece una sola casilla, actualiza Leuret App."
          });
        }
        return reply.status(400).send({
          message: "Los datos del registro no son válidos.",
          fields
        });
      }

      const input = parsedBody.data;
      if (!hasCurrentLegalVersions(input.legalConfirmations)) {
        return reply.status(409).send(staleLegalDocuments);
      }

      // CAPTCHA check
      const isCaptchaValid = await verifyCaptcha(input.captchaToken, getClientIp(request), "register");
      if (!isCaptchaValid) {
        return reply.status(400).send({
          message: "Protección contra robots inválida. Inténtalo de nuevo."
        });
      }

      const passwordHash = await hashPassword(input.password);
      const metadata = {
        full_name: input.fullName,
        first_name: input.firstName,
        last_name: input.lastName,
        phone: input.phone,
        role: input.role,
        province: input.province,
        district: input.district,
        corregimiento: input.corregimiento,
        terms_accepted: input.legalConfirmations.terms.accepted,
        notifications_opt_in: input.notificationsOptIn,
        registration_ip: request.ip,
        registration_device: input.registrationDevice
      };

      const { token: verificationToken, hash: verificationTokenHash } = generateSecureToken();
      const tokenExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours
      const client = await pool.connect();
      try {
        await client.query("BEGIN");

        const userId = await insertUser(client, input.email, passwordHash, metadata);
        await insertIdentity(client, userId, input.email);

        await client.query("SELECT set_config('app.user_id', $1, true)", [userId]);
        await recordLegalConfirmations(client, input.legalConfirmations, "registration");
        await insertToken(client, userId, "email_verification", verificationTokenHash, tokenExpiresAt);

        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK");
        const databaseError = error as { code?: string };
        if (databaseError.code === "23505") {
          return reply.status(409).send({
            message: "Ya existe una cuenta con ese correo."
          });
        }
        logAuthError(request, "register", error);
        return reply.status(500).send({
          message: "No se pudo completar el registro."
        });
      } finally {
        client.release();
      }

      const delivery = await sendVerificationEmail({
        to: input.email,
        fullName: input.fullName,
        token: verificationToken
      });

      if (!delivery.sent) {
        request.log.warn(
          { operation: "register_verification_email", reason: delivery.reason },
          "No se pudo entregar un correo de autenticación."
        );
      }

      return reply.status(201).send({
        requiresEmailConfirmation: true,
        emailDeliverySucceeded: delivery.sent,
        message: delivery.sent
          ? "Registro completado con éxito. Por favor, verifica tu correo electrónico para activar tu cuenta."
          : "La cuenta fue creada, pero el correo de verificación no pudo enviarse. Solicita un nuevo enlace más tarde."
      });
    }
  );

  app.post(
    "/auth/login",
    {
      config: {
        rateLimit: {
          max: env.NODE_ENV === "production" ? 5 : 100,
          timeWindow: "1 minute"
        }
      }
    },
    async (request, reply) => {
      const parsedBody = loginSchema.safeParse(request.body);
      if (!parsedBody.success) {
        return reply.status(400).send({
          message: "Correo o contraseña inválidos."
        });
      }

      const { email, password, clientType, captchaToken } = parsedBody.data;
      const cookieName = getRefreshCookie(clientType);
      if (cookieName && !isTrustedWebOrigin(request, cookieName)) {
        return reply.status(403).send({ message: "El origen no está autorizado." });
      }
      const isCaptchaValid = await verifyCaptcha(captchaToken, getClientIp(request), "login");
      if (!isCaptchaValid) {
        return reply.status(400).send({ message: "No pudimos validar la verificación de seguridad. Inténtalo de nuevo." });
      }

      const user = await findUserByEmail(email);

      const passwordMatches = user?.password_hash
        ? await comparePassword(password, user.password_hash)
        : await comparePasswordAgainstDummy(password);

      if (!user || !passwordMatches || user.deleted_at) {
        return reply.status(401).send({
          message: "Correo o contraseña incorrectos."
        });
      }

      if (!user.email_confirmed_at) {
        return reply.status(401).send({
          message: "Por favor verifica tu correo electrónico para activar tu cuenta."
        });
      }

      try {
        return await withUserTransaction(user.id, async (client) => {
          const loginAccount = await client.query(`
            SELECT id FROM app_auth.users
            WHERE id = $1 AND password_hash = $2
              AND email_confirmed_at IS NOT NULL AND deleted_at IS NULL
            FOR UPDATE
          `, [user.id, user.password_hash]);
          if (!loginAccount.rows[0]) {
            return reply.status(401).send({ message: "Correo o contraseña incorrectos." });
          }

          const profile = await loadOwnProfile(client);
          if (!profile) {
            return reply.status(404).send({
              message: "No se encontró el perfil."
            });
          }

          const status = getUserStatus(profile);
          if (status === "suspended" || status === "deactivated") {
            return reply.status(403).send({
              message: "Esta cuenta está suspendida o desactivada."
            });
          }

          // Con MFA activo no se crea sesión todavía: se devuelve un desafío de
          // 5 minutos que /auth/mfa/verify canjea por una sesión verificada.
          const mfaRecord = await getMfaRecord(client, user.id);
          if (mfaRecord?.confirmed_at) {
            if (!isMfaConfigured()) {
              return reply.status(503).send({
                message: "La verificación en dos pasos no está disponible. Inténtalo más tarde."
              });
            }
            const challenge = generateSecureToken();
            await invalidateOldTokens(client, user.id, "mfa_challenge");
            await insertToken(
              client,
              user.id,
              "mfa_challenge",
              challenge.hash,
              new Date(Date.now() + 5 * 60 * 1000)
            );
            return { mfaRequired: true, mfaToken: challenge.token, expiresIn: 300 };
          }

          const tokens = await createSession(
            client,
            user.id,
            request.ip,
            requestUserAgent(request)
          );

          await updateUserSignIn(client, user.id);

          // El superadministrador debe activar el segundo factor (ver /auth/mfa/enroll).
          const mfaEnrollmentRequired = profile.role === "super_admin" && isMfaConfigured();

          if (cookieName) {
            const { refreshToken, ...restTokens } = tokens;
            reply.setCookie(cookieName, refreshToken, getCookieOptions(cookieName));
            return {
              ...restTokens,
              user: toPublicUserProfile(profile, status),
              requiresApproval: status !== "active",
              ...(mfaEnrollmentRequired ? { mfaEnrollmentRequired } : {})
            };
          }

          return {
            ...tokens,
            user: toPublicUserProfile(profile, status),
            requiresApproval: status !== "active",
            ...(mfaEnrollmentRequired ? { mfaEnrollmentRequired } : {})
          };
        });
      } catch (error) {
        logAuthError(request, "login", error);
        return reply.status(500).send({
          message: "No se pudo iniciar sesión."
        });
      }
    }
  );

  app.post(
    "/auth/refresh",
    {
      config: {
        rateLimit: {
          max: env.NODE_ENV === "production" ? 10 : 100,
          timeWindow: "1 minute"
        }
      }
    },
    async (request, reply) => {
      const parsedBody = refreshSchema.safeParse(request.body);
      if (!parsedBody.success) {
        return reply.status(400).send({
          message: "El token de renovación no es válido."
        });
      }

      const { refreshToken, clientType, sessionId } = parsedBody.data;
      const cookieName = getRefreshCookie(clientType);
      if (cookieName && !isTrustedWebOrigin(request, cookieName)) {
        return reply.status(403).send({ message: "El origen no está autorizado." });
      }
      const tokenValue = cookieName ? request.cookies[cookieName] : refreshToken;

      if (!tokenValue) {
        return reply.status(401).send({
          message: "La sesión expiró o fue cerrada."
        });
      }

      const refreshTokenHash = hashRefreshToken(tokenValue);
      const client = await pool.connect();
      try {
        await client.query("BEGIN");

        const session = await findSessionByRefreshTokenHash(client, refreshTokenHash);
        if (!session || (sessionId && session.session_id !== sessionId)) {
          await client.query("ROLLBACK");
          return reply.status(401).send({
            message: "La sesión expiró o fue cerrada."
          });
        }

        await client.query(
          `SELECT set_config('app.user_id', $1, true)`,
          [session.user_id]
        );

        const profile = await loadOwnProfile(client);
        if (!profile) {
          await client.query("ROLLBACK");
          return reply.status(401).send({
            message: "La cuenta ya no está disponible."
          });
        }

        const status = getUserStatus(profile);
        if (status !== "active" && status !== "pending_approval") {
          await revokeAllUserSessions(client, session.user_id);
          await client.query("COMMIT");
          if (cookieName) reply.clearCookie(cookieName, getCookieOptions(cookieName));
          return reply.status(403).send({
            message: "Esta cuenta está suspendida o desactivada."
          });
        }

        const newRefreshToken = createRefreshToken();
        const newRefreshTokenHash = hashRefreshToken(newRefreshToken);
        const newExpiration = new Date(
          Date.now() + env.REFRESH_TOKEN_DAYS * 24 * 60 * 60 * 1000
        );

        await updateSessionRotation(
          client,
          session.session_id,
          newRefreshTokenHash,
          newExpiration,
          request.ip,
          requestUserAgent(request)
        );

        const accessToken = await createAccessToken(session.user_id, session.session_id);

        await client.query("COMMIT");

        if (cookieName) {
          reply.setCookie(cookieName, newRefreshToken, getCookieOptions(cookieName));
          return {
            accessToken,
            expiresIn: env.ACCESS_TOKEN_MINUTES * 60,
            sessionId: session.session_id,
            user: toPublicUserProfile(profile, status),
            requiresApproval: status !== "active"
          };
        }

        return {
          accessToken,
          refreshToken: newRefreshToken,
          expiresIn: env.ACCESS_TOKEN_MINUTES * 60,
          sessionId: session.session_id,
          user: toPublicUserProfile(profile, status),
          requiresApproval: status !== "active"
        };
      } catch (error) {
        await client.query("ROLLBACK");
        logAuthError(request, "refresh_session", error);
        return reply.status(500).send({
          message: "No se pudo renovar la sesión."
        });
      } finally {
        client.release();
      }
    }
  );

  app.post(
    "/auth/logout",
    {
      preHandler: authenticateRequest
    },
    async (request, reply) => {
      const authenticatedUser = request.authenticatedUser;
      if (!authenticatedUser) {
        return reply.status(401).send({
          message: "Se requiere autenticación."
        });
      }

      const parsedBody = logoutSchema.safeParse(request.body ?? {});
      if (!parsedBody.success) {
        return reply.status(400).send({ message: "Los datos de la sesión no son válidos." });
      }

      const cookieName = getRefreshCookie(parsedBody.data.clientType ?? "web");
      await revokeSession(authenticatedUser.sessionId, authenticatedUser.id);

      if (cookieName && isTrustedWebOrigin(request, cookieName)) {
        reply.clearCookie(cookieName, getCookieOptions(cookieName));
      }

      return {
        success: true
      };
    }
  );

  app.get(
    "/auth/me",
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
        const profile = await withUserTransaction(userId, loadOwnProfile);
        if (!profile) {
          return reply.status(404).send({
            message: "No se encontró el perfil."
          });
        }

        const status = getUserStatus(profile);
        return {
          user: toPublicUserProfile(profile, status),
          requiresApproval: status !== "active"
        };
      } catch (error) {
        logAuthError(request, "load_profile", error);
        return reply.status(500).send({
          message: "No se pudo cargar el perfil."
        });
      }
    }
  );

  app.post(
    "/auth/verify-email",
    {
      config: {
        rateLimit: {
          max: env.NODE_ENV === "production" ? 10 : 100,
          timeWindow: "1 minute"
        }
      }
    },
    async (request, reply) => {
      const parsedBody = verifyEmailSchema.safeParse(request.body);
      if (!parsedBody.success) {
        return reply.status(400).send({ message: "Token inválido." });
      }

      const { token } = parsedBody.data;
      const hashedToken = hashSecureToken(token);

      const client = await pool.connect();
      try {
        await client.query("BEGIN");

        const tokenRecord = await consumeTokenByHash(client, hashedToken, "email_verification");
        if (!tokenRecord) {
          await client.query("ROLLBACK");
          return reply.status(400).send({
            message: "El enlace de verificación es inválido o ha expirado."
          });
        }

        await confirmEmail(client, tokenRecord.user_id);

        await client.query("COMMIT");
        return { success: true, message: "Correo verificado con éxito." };
      } catch (error) {
        await client.query("ROLLBACK");
        logAuthError(request, "verify_email", error);
        return reply.status(500).send({ message: "No se pudo verificar el correo." });
      } finally {
        client.release();
      }
    }
  );

  app.post(
    "/auth/resend-verification",
    {
      config: {
        rateLimit: {
          max: env.NODE_ENV === "production" ? 3 : 100,
          timeWindow: "1 minute"
        }
      }
    },
    async (request, reply) => {
      const parsedBody = resendVerificationSchema.safeParse(request.body);
      if (!parsedBody.success) {
        return reply.status(400).send({ message: "Correo inválido." });
      }

      const { email, captchaToken } = parsedBody.data;
      const isCaptchaValid = await verifyCaptcha(captchaToken, getClientIp(request), "resend_verification");
      if (!isCaptchaValid) {
        return reply.status(400).send({ message: "No pudimos validar la verificación de seguridad. Inténtalo de nuevo." });
      }

      const user = await findUserByEmail(email);
      if (!user || user.email_confirmed_at) {
        return genericVerificationResponse;
      }

      // Check frequency: limit resend rate
      const recentResult = await pool.query<{ id: string }>(
        `
          SELECT id
          FROM app_auth.tokens
          WHERE user_id = $1
            AND token_type = 'email_verification'
            AND created_at > now() - interval '60 seconds'
          LIMIT 1
        `,
        [user.id]
      );

      if (recentResult.rows[0]) {
        return genericVerificationResponse;
      }

      const { token: verificationToken, hash: verificationTokenHash } = generateSecureToken();
      const tokenExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours
      const client = await pool.connect();
      try {
        await client.query("BEGIN");

        await client.query(
          `
            UPDATE app_auth.tokens
            SET used_at = now()
            WHERE user_id = $1
              AND token_type = 'email_verification'
              AND used_at IS NULL
          `,
          [user.id]
        );

        await insertToken(client, user.id, "email_verification", verificationTokenHash, tokenExpiresAt);

        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK");
        logAuthError(request, "resend_verification", error);
        return genericVerificationResponse;
      } finally {
        client.release();
      }

      const delivery = await sendVerificationEmail({
        to: user.email,
        fullName: null,
        token: verificationToken
      });

      if (!delivery.sent) {
        request.log.warn(
          { operation: "resend_verification_email", reason: delivery.reason },
          "No se pudo entregar un correo de autenticación."
        );
      }

      return genericVerificationResponse;
    }
  );

  app.post(
    "/auth/recover-password",
    {
      config: {
        rateLimit: {
          max: env.NODE_ENV === "production" ? 3 : 100,
          timeWindow: "1 minute"
        }
      }
    },
    async (request, reply) => {
      const parsedBody = recoverPasswordSchema.safeParse(request.body);
      if (!parsedBody.success) {
        return reply.status(400).send({ message: "Correo inválido." });
      }

      const { email, captchaToken } = parsedBody.data;
      const isCaptchaValid = await verifyCaptcha(captchaToken, getClientIp(request), "recover_password");
      if (!isCaptchaValid) {
        return reply.status(400).send({ message: "No pudimos validar la verificación de seguridad. Inténtalo de nuevo." });
      }

      const user = await findUserByEmail(email);

      if (!user) {
        request.log.info(
          {
            operation: "recover_password",
            outcome: "no_matching_account"
          },
          "Recuperaci?n procesada sin cuenta coincidente."
        );

        return genericPasswordRecoveryResponse;
      }

      // Check recovery frequency: limit rate (60 seconds)
      const recentResult = await pool.query<{ id: string }>(
        `
          SELECT id
          FROM app_auth.tokens
          WHERE user_id = $1
            AND token_type = 'password_reset'
            AND created_at > now() - interval '60 seconds'
          LIMIT 1
        `,
        [user.id]
      );

      if (recentResult.rows[0]) {
        request.log.info(
          {
            operation: "recover_password",
            outcome: "throttled"
          },
          "Recuperaci?n limitada por frecuencia."
        );

        return genericPasswordRecoveryResponse;
      }

      const { token: resetToken, hash: resetTokenHash } = generateSecureToken();
      const tokenExpiresAt = new Date(Date.now() + 1 * 60 * 60 * 1000); // 1 hour
      const client = await pool.connect();
      try {
        await client.query("BEGIN");

        await client.query(
          `
            UPDATE app_auth.tokens
            SET used_at = now()
            WHERE user_id = $1
              AND token_type = 'password_reset'
              AND used_at IS NULL
          `,
          [user.id]
        );

        await insertToken(client, user.id, "password_reset", resetTokenHash, tokenExpiresAt);

        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK");
        logAuthError(request, "recover_password", error);
        return genericPasswordRecoveryResponse;
      } finally {
        client.release();
      }

      request.log.info(
        {
          operation: "recover_password",
          outcome: "token_created"
        },
        "Token de recuperaci?n creado correctamente."
      );

      const delivery = await sendPasswordResetEmail({
        to: user.email,
        fullName: null,
        token: resetToken
      });

      if (!delivery.sent) {
        request.log.warn(
          {
            operation: "recover_password",
            outcome: "delivery_failed",
            reason: delivery.reason
          },
          "Resend no acept? el correo de recuperaci?n."
        );
      } else {
        request.log.info(
          {
            operation: "recover_password",
            outcome: "delivery_accepted"
          },
          "Resend acept? el correo de recuperaci?n."
        );
      }

      return genericPasswordRecoveryResponse;
    }
  );

  app.post(
    "/auth/reset-password",
    {
      config: {
        rateLimit: {
          max: env.NODE_ENV === "production" ? 5 : 100,
          timeWindow: "1 minute"
        }
      }
    },
    async (request, reply) => {
      const parsedBody = resetPasswordSchema.safeParse(request.body);
      if (!parsedBody.success) {
        return reply.status(400).send({ message: "Datos no válidos." });
      }

      const { token, newPassword } = parsedBody.data;
      const hashedToken = hashSecureToken(token);

      const client = await pool.connect();
      try {
        await client.query("BEGIN");

        const tokenRecord = await consumeTokenByHash(client, hashedToken, "password_reset");
        if (!tokenRecord) {
          await client.query("ROLLBACK");
          return reply.status(400).send({
            message: "El enlace de restablecimiento es inválido o ha expirado."
          });
        }

        const passwordHash = await hashPassword(newPassword);

        await updateUserPassword(client, tokenRecord.user_id, passwordHash);
        await revokeAllUserSessions(client, tokenRecord.user_id);

        await client.query("COMMIT");
        return { success: true, message: "Tu contraseña fue restablecida y se cerraron las sesiones activas en todos tus dispositivos." };
      } catch (error) {
        await client.query("ROLLBACK");
        logAuthError(request, "reset_password", error);
        return reply.status(500).send({ message: "No se pudo restablecer la contraseña." });
      } finally {
        client.release();
      }
    }
  );

  app.get(
    "/auth/sessions",
    {
      preHandler: authenticateRequest
    },
    async (request, reply) => {
      const authenticatedUser = request.authenticatedUser;
      if (!authenticatedUser) {
        return reply.status(401).send({ message: "Se requiere autenticación." });
      }

      try {
        const result = await pool.query<{
          id: string;
          user_agent: string | null;
          ip_address: string | null;
          last_used_at: Date | null;
          created_at: Date;
          expires_at: Date;
        }>(
          `
            SELECT id, user_agent, ip_address, last_used_at, created_at, expires_at
            FROM app_auth.sessions
            WHERE user_id = $1
              AND revoked_at IS NULL
              AND expires_at > now()
            ORDER BY last_used_at DESC NULLS LAST, created_at DESC
          `,
          [authenticatedUser.id]
        );

        const sessions = result.rows.map((row) => ({
          id: row.id,
          userAgent: row.user_agent,
          ipAddress: row.ip_address,
          lastUsedAt: row.last_used_at,
          createdAt: row.created_at,
          expiresAt: row.expires_at,
          isCurrent: row.id === authenticatedUser.sessionId
        }));

        return { sessions };
      } catch (error) {
        logAuthError(request, "list_sessions", error);
        return reply.status(500).send({ message: "No se pudieron obtener las sesiones." });
      }
    }
  );

  app.post(
    "/auth/sessions/revoke",
    {
      preHandler: authenticateRequest
    },
    async (request, reply) => {
      const authenticatedUser = request.authenticatedUser;
      if (!authenticatedUser) {
        return reply.status(401).send({ message: "Se requiere autenticación." });
      }

      const parsedBody = revokeSessionSchema.safeParse(request.body);
      if (!parsedBody.success) {
        return reply.status(400).send({ message: "Identificador de sesión no válido." });
      }

      const { sessionId } = parsedBody.data;

      try {
        const result = await pool.query(
          `
            UPDATE app_auth.sessions
            SET revoked_at = now()
            WHERE id = $1
              AND user_id = $2
              AND revoked_at IS NULL
            RETURNING id
          `,
          [sessionId, authenticatedUser.id]
        );

        if (result.rowCount === 0) {
          return reply.status(404).send({ message: "Sesión no encontrada o ya cerrada." });
        }

        return { success: true, message: "Sesión cerrada correctamente." };
      } catch (error) {
        logAuthError(request, "revoke_session", error);
        return reply.status(500).send({ message: "No se pudo cerrar la sesión." });
      }
    }
  );

  app.post(
    "/auth/sessions/revoke-all",
    {
      preHandler: authenticateRequest
    },
    async (request, reply) => {
      const authenticatedUser = request.authenticatedUser;
      if (!authenticatedUser) {
        return reply.status(401).send({ message: "Se requiere autenticación." });
      }

      try {
        await pool.query(
          `
            UPDATE app_auth.sessions
            SET revoked_at = now()
            WHERE user_id = $1
              AND id != $2
              AND revoked_at IS NULL
          `,
          [authenticatedUser.id, authenticatedUser.sessionId]
        );

        return { success: true, message: "Todas las otras sesiones activas se han cerrado." };
      } catch (error) {
        logAuthError(request, "revoke_other_sessions", error);
        return reply.status(500).send({ message: "No se pudieron cerrar las demás sesiones." });
      }
    }
  );
}
