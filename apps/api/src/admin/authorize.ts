import type {
  FastifyReply,
  FastifyRequest
} from "fastify";

import {
  authenticateRequest,
  requireActiveUser
} from "../auth/authenticate.js";
import { isSessionMfaVerified } from "../auth/mfa-repository.js";
import { env } from "../config/env.js";
import {
  withUserTransaction
} from "../db/with-user-transaction.js";

export async function requireSuperAdmin(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  await authenticateRequest(
    request,
    reply
  );

  if (reply.sent) return;

  await requireActiveUser(request, reply);
  if (reply.sent) return;

  const userId =
    request.authenticatedUser?.id;

  if (!userId) {
    reply.status(401).send({
      message:
        "Se requiere autenticación."
    });

    return;
  }

  const authorized =
    await withUserTransaction(
      userId,
      async (client) => {
        const result =
          await client.query<{
            authorized: boolean;
          }>(`
            SELECT EXISTS (
              SELECT 1
              FROM public.profiles
              WHERE id =
                app.current_user_id()
                AND role =
                  'super_admin'
                AND active = true
            ) AS authorized
          `);

        return Boolean(
          result.rows[0]?.authorized
        );
      }
    );

  if (!authorized) {
    reply.status(403).send({
      message:
        "Esta cuenta no tiene acceso de superadministrador."
    });
    return;
  }

  // Con ADMIN_MFA_REQUIRED, solo una sesión que superó el segundo factor
  // puede usar /admin/*. Una sesión sin verificar solo sirve para activar MFA.
  if (env.ADMIN_MFA_REQUIRED) {
    const sessionId = request.authenticatedUser?.sessionId;
    const verified = sessionId
      ? await withUserTransaction(userId, (client) => isSessionMfaVerified(client, sessionId))
      : false;

    if (!verified) {
      reply.status(403).send({
        code: "mfa_required",
        message: "Verifica tu segundo factor para acceder al panel."
      });
    }
  }
}
