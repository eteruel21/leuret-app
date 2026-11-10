import type {
  FastifyReply,
  FastifyRequest
} from "fastify";

import { pool } from "../db/pool.js";
import { withUserTransaction } from "../db/with-user-transaction.js";
import { safeErrorDetails } from "../security/redaction.js";
import {
  verifyAccessToken
} from "./tokens.js";

declare module "fastify" {
  interface FastifyRequest {
    authenticatedUser: {
      id: string;
      sessionId: string;
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

  try {
    const payload = await verifyAccessToken(token);

    const sessionResult = await pool.query<{
      id: string;
    }>(
      `
        SELECT id
        FROM app_auth.sessions
        WHERE id = $1
          AND user_id = $2
          AND revoked_at IS NULL
          AND expires_at > now()
        LIMIT 1
      `,
      [
        payload.sessionId,
        payload.userId
      ]
    );

    if (!sessionResult.rows[0]) {
      reply.status(401).send({
        message:
          "La sesión expiró o fue cerrada."
      });

      return;
    }

    request.authenticatedUser = {
      id: payload.userId,
      sessionId: payload.sessionId
    };
  } catch {
    reply.status(401).send({
      message:
        "El token es inválido o ha expirado."
    });
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

  try {
    const record = await withUserTransaction(
      user.id,
      async (client) => {
        const result = await client.query<{
          email_confirmed_at: Date | null;
          deleted_at: Date | null;
          active: boolean;
          approved_at: Date | null;
        }>(
          `
            SELECT
              u.email_confirmed_at,
              u.deleted_at,
              p.active,
              p.approved_at
            FROM app_auth.users u
            LEFT JOIN public.profiles p ON p.id = u.id
            WHERE u.id = $1
            LIMIT 1
          `,
          [user.id]
        );

        return result.rows[0];
      }
    );
    if (process.env.NODE_ENV !== "production") {
    }
    if (!record) {
      reply.status(403).send({
        message: "No se encontró el perfil del usuario."
      });
      return;
    }

    if (record.deleted_at) {
      reply.status(403).send({
        message: "Esta cuenta ha sido eliminada o desactivada."
      });
      return;
    }

    if (!record.email_confirmed_at) {
      reply.status(403).send({
        message: "Debes confirmar tu correo electrónico para acceder a esta ruta."
      });
      return;
    }

    if (!record.approved_at) {
      reply.status(403).send({
        message: "Tu cuenta está pendiente de aprobación por el administrador."
      });
      return;
    }

    if (!record.active) {
      reply.status(403).send({
        message: "Tu cuenta está suspendida o inactiva."
      });
      return;
    }
  } catch (error) {
    request.log.error(safeErrorDetails(error), "Falló una comprobación de autorización.");
    reply.status(500).send({
      message: "Error interno al verificar el estado del usuario."
    });
  }
}

export function requireCompanyRole(allowedRoles: ("owner" | "admin" | "estimator" | "sales" | "supervisor" | "member")[]) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const userId = request.authenticatedUser?.id;
    if (!userId) {
      reply.status(401).send({ message: "Se requiere autenticación." });
      return;
    }

    let companyId: string | undefined = 
      (request.params as any)?.companyId ||
      ((request.url.startsWith("/companies") || request.url.includes("/companies/")) ? (request.params as any)?.id : undefined) ||
      (request.query as any)?.companyId ||
      (request.body as any)?.companyId ||
      request.headers["x-company-id"] as string;

    if (!companyId) {
      reply.status(400).send({ message: "Identificador de empresa (companyId) es obligatorio." });
      return;
    }

    try {
      const membership = await withUserTransaction(
        userId,
        async (client) => {
          const result = await client.query<{
            role: string;
            active: boolean;
            company_active: boolean | null;
          }>(
            `
              SELECT member.role, member.active, company.active AS company_active
              FROM public.company_members AS member
              LEFT JOIN public.companies AS company ON company.id = member.company_id
              WHERE member.company_id = $1
                AND member.user_id = $2
                AND member.active = true
              LIMIT 1
            `,
            [companyId, userId]
          );

          return result.rows[0];
        }
      );
      if (!membership) {
        reply.status(403).send({ message: "No eres miembro de esta empresa." });
        return;
      }

      // Una empresa suspendida desde el panel no puede operar.
      if (membership.company_active === false) {
        reply.status(403).send({ message: "Esta empresa está suspendida. Contacta a soporte de Leuret." });
        return;
      }

      if (!allowedRoles.includes(membership.role as any)) {
        reply.status(403).send({ message: "No tienes permiso para realizar esta acción." });
        return;
      }
    } catch (error) {
      request.log.error(safeErrorDetails(error), "Falló una comprobación de autorización.");
      reply.status(500).send({ message: "Error interno al verificar los permisos del rol." });
    }
  };
}
