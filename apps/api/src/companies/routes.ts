import type {
  FastifyInstance,
  FastifyReply,
  FastifyRequest
} from "fastify";

import {
  authenticateRequest,
  requireActiveUser,
  requireCompanyRole
} from "../auth/authenticate.js";

import {
  companyParamsSchema,
  createCompanySchema,
  billingSchema,
  companyMemberParamsSchema,
  companyInvitationParamsSchema,
  createInvitationSchema,
  acceptInvitationSchema,
  updateMemberStatusSchema,
  updateMemberRoleSchema,
  auditLogQuerySchema,
  invitationIdParamsSchema
} from "./schemas.js";

import {
  getUserCompanyMembershipsService,
  createCompanyService,
  updateCompanyBillingService,
  createCompanyInvitationService,
  getCompanyInvitationsService,
  acceptCompanyInvitationService,
  revokeCompanyInvitationService,
  getCompanyMembersService,
  manageCompanyMemberService,
  leaveCompanyService,
  declineCompanyInvitationService,
  getAdminAuditLogsService,
  type MemberActionResult
} from "./services.js";
import { listReceivedCompanyInvitationsRepo } from "./repository.js";

function authenticatedUserId(
  request: FastifyRequest,
  reply: FastifyReply
): string | null {
  const userId = request.authenticatedUser?.id;

  if (!userId) {
    reply.status(401).send({
      message: "Se requiere autenticación."
    });
    return null;
  }

  return userId;
}

export async function registerCompanyRoutes(
  app: FastifyInstance
): Promise<void> {
  app.get(
    "/companies",
    {
      preHandler: [authenticateRequest, requireActiveUser]
    },
    async (request, reply) => {
      const userId = authenticatedUserId(request, reply);
      if (!userId) return;

      const memberships = await getUserCompanyMembershipsService(userId);
      return { memberships };
    }
  );

  app.post(
    "/companies",
    {
      preHandler: [authenticateRequest, requireActiveUser]
    },
    async (request, reply) => {
      const userId = authenticatedUserId(request, reply);
      if (!userId) return;

      const parsedBody = createCompanySchema.safeParse(request.body);
      if (!parsedBody.success) {
        return reply.status(400).send({
          message: "Los datos de la empresa no son válidos.",
          fields: parsedBody.error.flatten().fieldErrors
        });
      }

      let companyId;
      try {
        companyId = await createCompanyService(userId, parsedBody.data);
      } catch (error) {
        if ((error as { code?: string }).code === "42501") {
          return reply.status(403).send({ message: "Tu cuenta debe estar aprobada como contratista para crear una empresa." });
        }
        throw error;
      }

      if (!companyId) {
        return reply.status(500).send({
          message: "No se pudo crear la empresa."
        });
      }

      return reply.status(201).send({ companyId });
    }
  );

  app.patch(
    "/companies/:companyId/billing",
    {
      preHandler: [authenticateRequest, requireActiveUser, requireCompanyRole(["owner", "admin"])]
    },
    async (request, reply) => {
      const userId = authenticatedUserId(request, reply);
      if (!userId) return;

      const parsedParams = companyParamsSchema.safeParse(request.params);
      const parsedBody = billingSchema.safeParse(request.body);

      if (!parsedParams.success || !parsedBody.success) {
        return reply.status(400).send({
          message: "Los datos de facturación no son válidos."
        });
      }

      const company = await updateCompanyBillingService(userId, parsedParams.data.companyId, parsedBody.data);

      if (!company) {
        return reply.status(404).send({
          message: "No se encontró la empresa o no tienes permiso para editarla."
        });
      }

      return { success: true };
    }
  );

  // --- Invitaciones de equipo (T-110) ---

  app.post(
    "/companies/:companyId/invitations",
    {
      preHandler: [authenticateRequest, requireActiveUser, requireCompanyRole(["owner", "admin"])],
      config: { rateLimit: { max: 12, timeWindow: "1 minute" } }
    },
    async (request, reply) => {
      const userId = authenticatedUserId(request, reply);
      if (!userId) return;

      const parsedParams = companyParamsSchema.safeParse(request.params);
      const parsedBody = createInvitationSchema.safeParse(request.body);

      if (!parsedParams.success || !parsedBody.success) {
        return reply.status(400).send({
          message: "Los datos de la invitación no son válidos.",
          fields: parsedBody.error?.flatten().fieldErrors
        });
      }

      const result = await createCompanyInvitationService(
        userId,
        parsedParams.data.companyId,
        parsedBody.data.email,
        parsedBody.data.role
      );

      if ("conflict" in result) {
        const error = {
          already_member: { status: 409, message: "Esa persona ya forma parte del equipo. Cambia su rol desde la lista de miembros." },
          owner_required: { status: 403, message: "Solo un propietario puede invitar administradores." },
          forbidden: { status: 403, message: "No se pudo crear la invitación con los permisos indicados." }
        }[result.conflict];
        return reply.status(error.status).send({ message: error.message });
      }

      return reply.header("Cache-Control", "private, no-store").status(201).send({ invitation: result.invitation });
    }
  );

  app.get(
    "/companies/:companyId/invitations",
    {
      preHandler: [authenticateRequest, requireActiveUser, requireCompanyRole(["owner", "admin"])]
    },
    async (request, reply) => {
      const userId = authenticatedUserId(request, reply);
      if (!userId) return;

      const parsedParams = companyParamsSchema.safeParse(request.params);
      if (!parsedParams.success) {
        return reply.status(400).send({ message: "ID de empresa no válido." });
      }

      const invitations = await getCompanyInvitationsService(userId, parsedParams.data.companyId);
      return { invitations };
    }
  );

  app.get(
    "/companies/invitations/received",
    { preHandler: authenticateRequest },
    async (request, reply) => {
      const userId = authenticatedUserId(request, reply);
      if (!userId) return;
      reply.header("Cache-Control", "private, no-store");
      return { invitations: await listReceivedCompanyInvitationsRepo(userId) };
    }
  );

  app.post(
    "/companies/invitations/accept",
    {
      preHandler: authenticateRequest,
      config: { rateLimit: { max: 20, timeWindow: "1 minute" } }
    },
    async (request, reply) => {
      const userId = authenticatedUserId(request, reply);
      if (!userId) return;

      const parsedBody = acceptInvitationSchema.safeParse(request.body);
      if (!parsedBody.success) {
        return reply.status(400).send({ message: "La invitación no es válida." });
      }

      const result = await acceptCompanyInvitationService(userId, parsedBody.data);
      if (!result.success) {
        return reply.status(400).send({ message: result.error });
      }

      return reply.send(result);
    }
  );

  app.post(
    "/companies/invitations/:invitationId/decline",
    {
      preHandler: authenticateRequest,
      config: { rateLimit: { max: 20, timeWindow: "1 minute" } }
    },
    async (request, reply) => {
      const userId = authenticatedUserId(request, reply);
      if (!userId) return;

      const parsedParams = invitationIdParamsSchema.safeParse(request.params);
      if (!parsedParams.success) {
        return reply.status(400).send({ message: "La invitación no es válida." });
      }

      const companyId = await declineCompanyInvitationService(userId, parsedParams.data.invitationId);
      if (!companyId) {
        return reply.status(404).send({ message: "La invitación ya fue respondida, venció o no corresponde a tu correo." });
      }
      return { success: true };
    }
  );

  app.delete(
    "/companies/:companyId/invitations/:invitationId",
    {
      preHandler: [authenticateRequest, requireActiveUser, requireCompanyRole(["owner", "admin"])]
    },
    async (request, reply) => {
      const userId = authenticatedUserId(request, reply);
      if (!userId) return;

      const parsedParams = companyInvitationParamsSchema.safeParse(request.params);
      if (!parsedParams.success) {
        return reply.status(400).send({ message: "Parámetros no válidos." });
      }

      const revoked = await revokeCompanyInvitationService(
        userId,
        parsedParams.data.companyId,
        parsedParams.data.invitationId
      );

      if (!revoked) {
        return reply.status(404).send({ message: "No se encontró una invitación pendiente para revocar." });
      }

      return { success: true };
    }
  );

  // --- Administración de Miembros y Roles (T-111 & T-112) ---

  app.get(
    "/companies/:companyId/members",
    {
      preHandler: [authenticateRequest, requireActiveUser, requireCompanyRole(["owner", "admin", "estimator", "sales", "supervisor", "member"])]
    },
    async (request, reply) => {
      const userId = authenticatedUserId(request, reply);
      if (!userId) return;

      const parsedParams = companyParamsSchema.safeParse(request.params);
      if (!parsedParams.success) {
        return reply.status(400).send({ message: "ID de empresa no válido." });
      }

      const members = await getCompanyMembersService(userId, parsedParams.data.companyId);
      return { members };
    }
  );

  const sendMemberResult = (reply: FastifyReply, result: MemberActionResult) => result.success
    ? reply.send({ success: true, changed: result.changed, member: result.member })
    : reply.status(result.status).send({ message: result.error });

  app.patch(
    "/companies/:companyId/members/:memberId/status",
    {
      preHandler: [authenticateRequest, requireActiveUser, requireCompanyRole(["owner", "admin"])]
    },
    async (request, reply) => {
      const userId = authenticatedUserId(request, reply);
      if (!userId) return;

      const parsedParams = companyMemberParamsSchema.safeParse(request.params);
      const parsedBody = updateMemberStatusSchema.safeParse(request.body);

      if (!parsedParams.success || !parsedBody.success) {
        return reply.status(400).send({ message: "Datos no válidos." });
      }

      return sendMemberResult(reply, await manageCompanyMemberService(
        userId,
        parsedParams.data.companyId,
        parsedParams.data.memberId,
        parsedBody.data.active ? "activate" : "deactivate"
      ));
    }
  );

  app.patch(
    "/companies/:companyId/members/:memberId/role",
    {
      preHandler: [authenticateRequest, requireActiveUser, requireCompanyRole(["owner", "admin"])]
    },
    async (request, reply) => {
      const userId = authenticatedUserId(request, reply);
      if (!userId) return;

      const parsedParams = companyMemberParamsSchema.safeParse(request.params);
      const parsedBody = updateMemberRoleSchema.safeParse(request.body);

      if (!parsedParams.success || !parsedBody.success) {
        return reply.status(400).send({ message: "Datos de rol no válidos." });
      }

      return sendMemberResult(reply, await manageCompanyMemberService(
        userId,
        parsedParams.data.companyId,
        parsedParams.data.memberId,
        "set_role",
        parsedBody.data.role
      ));
    }
  );

  app.delete(
    "/companies/:companyId/members/:memberId",
    {
      preHandler: [authenticateRequest, requireActiveUser, requireCompanyRole(["owner", "admin"])]
    },
    async (request, reply) => {
      const userId = authenticatedUserId(request, reply);
      if (!userId) return;

      const parsedParams = companyMemberParamsSchema.safeParse(request.params);
      if (!parsedParams.success) {
        return reply.status(400).send({ message: "ID no válido." });
      }

      return sendMemberResult(reply, await manageCompanyMemberService(
        userId,
        parsedParams.data.companyId,
        parsedParams.data.memberId,
        "remove"
      ));
    }
  );

  // Cualquier miembro puede salir de la empresa, salvo el último propietario.
  app.post(
    "/companies/:companyId/leave",
    {
      preHandler: [authenticateRequest, requireActiveUser, requireCompanyRole(["owner", "admin", "estimator", "sales", "supervisor", "member"])]
    },
    async (request, reply) => {
      const userId = authenticatedUserId(request, reply);
      if (!userId) return;

      const parsedParams = companyParamsSchema.safeParse(request.params);
      if (!parsedParams.success) {
        return reply.status(400).send({ message: "ID de empresa no válido." });
      }

      const outcome = await leaveCompanyService(userId, parsedParams.data.companyId);
      if (outcome === "last_owner") {
        return reply.status(409).send({
          message: "Eres el único propietario. Haz propietario a otra persona del equipo antes de salir."
        });
      }
      if (outcome === "not_member") {
        return reply.status(404).send({ message: "Ya no formas parte de esta empresa." });
      }
      return { success: true };
    }
  );

  // --- Auditoría de Acciones Administrativas (T-114) ---

  app.get(
    "/companies/:companyId/audit-logs",
    {
      preHandler: [authenticateRequest, requireActiveUser, requireCompanyRole(["owner", "admin"])]
    },
    async (request, reply) => {
      const userId = authenticatedUserId(request, reply);
      if (!userId) return;

      const parsedParams = companyParamsSchema.safeParse(request.params);
      const parsedQuery = auditLogQuerySchema.safeParse(request.query);

      if (!parsedParams.success || !parsedQuery.success) {
        return reply.status(400).send({ message: "Parámetros de consulta no válidos." });
      }

      const result = await getAdminAuditLogsService(
        userId,
        parsedParams.data.companyId,
        parsedQuery.data.page,
        parsedQuery.data.limit,
        parsedQuery.data.action
      );

      return result;
    }
  );
}
