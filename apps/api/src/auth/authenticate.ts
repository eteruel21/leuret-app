import type {
  FastifyReply,
  FastifyRequest
} from "fastify";
import { z } from "zod";

import { withUserTransaction } from "../db/with-user-transaction.js";
import { safeErrorDetails } from "../security/redaction.js";
import { getUserStatus } from "./repository.js";
import { verifyAccessToken } from "./tokens.js";

export const companyRoles = ["owner", "admin", "estimator", "sales", "supervisor", "member"] as const;
type CompanyRole = (typeof companyRoles)[number];
type CompanyIdSource = "params" | "query" | "body";
const companyIdSchema = z.uuid();

declare module "fastify" {
  interface FastifyRequest {
    authenticatedUser: {
      id: string;
      sessionId: string;
      status: "active" | "pending_approval";
    } | null;
  }
}

export async function authenticateRequest(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const authorization =
    request.headers.authorization;

  if (
    !authorization ||
    !authorization.startsWith("Bearer ")
  ) {
    reply.status(401).send({
      message: "Se requiere autenticación."
    });

    return;
  }

  const token = authorization.slice(
    "Bearer ".length
  );

  const payload = await verifyAccessToken(token).catch(() => null);
  if (!payload) {
    reply.status(401).send({ message: "El token es inválido o ha expirado." });
    return;
  }

  try {
    const record = await withUserTransaction(payload.userId, async (client) => {
      const result = await client.query<Parameters<typeof getUserStatus>[0]>(`
        SELECT account.email_confirmed_at, account.deleted_at, profile.active, profile.approved_at
        FROM app_auth.sessions AS session
        JOIN app_auth.users AS account ON account.id = session.user_id
        JOIN public.profiles AS profile ON profile.id = account.id
        WHERE session.id = $1
          AND session.user_id = app.current_user_id()
          AND session.revoked_at IS NULL
          AND session.expires_at > now()
      `, [payload.sessionId]);
      return result.rows[0];
    });

    if (!record || record.deleted_at) {
      reply.status(401).send({ message: "La sesión expiró o fue cerrada." });
      return;
    }

    const status = getUserStatus(record);
    if (status !== "active" && status !== "pending_approval") {
      reply.status(403).send({ message: "Esta cuenta no está habilitada para acceder." });
      return;
    }

    request.authenticatedUser = {
      id: payload.userId,
      sessionId: payload.sessionId,
      status
    };
  } catch (error) {
    request.log.error(safeErrorDetails(error), "No se pudo comprobar la sesión.");
    reply.status(503).send({ message: "No se pudo verificar la sesión. Inténtalo nuevamente." });
  }
}

export async function requireActiveUser(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const user = request.authenticatedUser;
  if (!user) {
    reply.status(401).send({
      message: "Se requiere autenticación."
    });
    return;
  }

  if (user.status !== "active") {
    reply.status(403).send({
      message: "Tu cuenta está pendiente de aprobación por el administrador."
    });
  }
}

export function requireCompanyRole(
  allowedRoles: readonly CompanyRole[],
  companyIdSource: CompanyIdSource = "params"
) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const userId = request.authenticatedUser?.id;
    if (!userId) {
      reply.status(401).send({ message: "Se requiere autenticación." });
      return;
    }

    const source = request[companyIdSource] as { companyId?: unknown } | undefined;
    const companyId = companyIdSchema.safeParse(source?.companyId);
    if (!companyId.success) {
      reply.status(400).send({ message: "El identificador de empresa (companyId) no es válido." });
      return;
    }

    try {
      const membership = await withUserTransaction(
        userId,
        async (client) => {
          const result = await client.query<{
            role: CompanyRole;
            company_active: boolean | null;
          }>(
            `
              SELECT member.role, company.active AS company_active
              FROM public.company_members AS member
              LEFT JOIN public.companies AS company ON company.id = member.company_id
              WHERE member.company_id = $1
                AND member.user_id = $2
                AND member.active = true
              LIMIT 1
            `,
            [companyId.data, userId]
          );

          return result.rows[0];
        }
      );
      if (!membership) {
        reply.status(403).send({ message: "No eres miembro de esta empresa." });
        return;
      }

      // Una empresa suspendida desde el panel no puede operar.
      if (membership.company_active !== true) {
        reply.status(403).send({ message: "Esta empresa está suspendida. Contacta a soporte de Leuret." });
        return;
      }

      if (!allowedRoles.includes(membership.role)) {
        reply.status(403).send({ message: "No tienes permiso para realizar esta acción." });
        return;
      }
    } catch (error) {
      request.log.error(safeErrorDetails(error), "Falló una comprobación de autorización.");
      reply.status(500).send({ message: "Error interno al verificar los permisos del rol." });
    }
  };
}
