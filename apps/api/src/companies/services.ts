import { generateSecureToken, hashSecureToken } from "../auth/tokens.js";
import { notifyCompanyInvitation, notifyCompanyMemberChange } from "../notifications/event-service.js";
import { sendCompanyInvitationEmail } from "../services/email.js";

import {
  findUserCompanyMembershipsRepo,
  createCompanyRepo,
  updateCompanyBillingRepo,
  createCompanyInvitationRepo,
  findInvitationEmailContextRepo,
  findCompanyInvitationsRepo,
  acceptCompanyInvitationRepo,
  revokeCompanyInvitationRepo,
  findCompanyMembersRepo,
  findCompanyMemberRepo,
  manageCompanyMemberRepo,
  leaveCompanyRepo,
  declineCompanyInvitationRepo,
  findCompanyInvitationConflictRepo,
  insertAdminAuditLogRepo,
  type MemberAction,
  type MemberActionOutcome,
  findAdminAuditLogsRepo,
  type CreateCompanyInput,
  type BillingInput
} from "./repository.js";

const INVITATION_ROLE_LABELS: Record<string, string> = {
  admin: "Administrador",
  supervisor: "Supervisor",
  sales: "Ventas",
  estimator: "Presupuestista",
  member: "Equipo de campo"
};

export async function getUserCompanyMembershipsService(userId: string) {
  return findUserCompanyMembershipsRepo(userId);
}

export async function createCompanyService(userId: string, input: CreateCompanyInput) {
  const companyId = await createCompanyRepo(userId, input);
  if (companyId) {
    await insertAdminAuditLogRepo(userId, companyId, "COMPANY_CREATED", "company", companyId, {
      name: input.name
    });
  }
  return companyId;
}

export async function updateCompanyBillingService(userId: string, companyId: string, input: BillingInput) {
  const company = await updateCompanyBillingRepo(userId, companyId, input);
  if (company) {
    await insertAdminAuditLogRepo(userId, companyId, "BILLING_UPDATED", "company", companyId, {
      invoicePrefix: input.invoicePrefix,
      taxRate: input.taxRate
    });
  }
  return company;
}

// --- Invitaciones ---

export async function createCompanyInvitationService(
  userId: string,
  companyId: string,
  email: string,
  role: string
) {
  const conflict = await findCompanyInvitationConflictRepo(userId, companyId, email, role);
  if (conflict) return { conflict } as const;

  const { token, hash: tokenHash } = generateSecureToken();
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 días

  const invitation = await createCompanyInvitationRepo(userId, companyId, email, role, tokenHash, expiresAt);
  if (!invitation) return { conflict: "forbidden" } as const;

  // El correo es una ayuda: si falla, la invitación sigue siendo válida y el
  // código se puede compartir a mano desde la app.
  let emailSent = false;
  try {
    const context = await findInvitationEmailContextRepo(userId, companyId, invitation.id);
    const [delivery] = await Promise.all([
      sendCompanyInvitationEmail({
        to: invitation.email,
        token,
        companyName: context?.company_name ?? "",
        inviterName: context?.inviter_name ?? null,
        roleLabel: INVITATION_ROLE_LABELS[role] ?? role,
        idempotencyKey: `team-invitation/${tokenHash}`
      }),
      notifyCompanyInvitation(context?.recipient_id ?? null, invitation.id)
    ]);
    emailSent = delivery.sent;
  } catch {
    emailSent = false;
  }

  return { invitation: { ...invitation, acceptanceToken: token, emailSent } } as const;
}

export async function declineCompanyInvitationService(userId: string, invitationId: string) {
  return declineCompanyInvitationRepo(userId, invitationId);
}

export async function getCompanyInvitationsService(userId: string, companyId: string) {
  return findCompanyInvitationsRepo(userId, companyId);
}

export async function acceptCompanyInvitationService(
  userId: string,
  input: { token: string } | { invitationId: string }
) {
  const acceptedInvitation = await acceptCompanyInvitationRepo(
    userId,
    "token" in input ? hashSecureToken(input.token) : null,
    "invitationId" in input ? input.invitationId : null
  );
  if (!acceptedInvitation) {
    return { success: false, error: "La invitación venció, ya fue respondida o no corresponde a tu correo." };
  }

  return { success: true, companyId: acceptedInvitation.company_id };
}

export async function revokeCompanyInvitationService(userId: string, companyId: string, invitationId: string) {
  return revokeCompanyInvitationRepo(userId, companyId, invitationId);
}

// --- Miembros & Roles ---

export async function getCompanyMembersService(userId: string, companyId: string) {
  return findCompanyMembersRepo(userId, companyId);
}

const MEMBER_ERRORS: Record<Exclude<MemberActionOutcome, "ok" | "unchanged">, { status: number; message: string }> = {
  forbidden: { status: 403, message: "No tienes permiso para gestionar el equipo de esta empresa." },
  not_found: { status: 404, message: "El miembro no fue encontrado." },
  self: { status: 409, message: "No puedes desactivarte ni quitarte a ti mismo. Usa «Salir de la empresa»." },
  last_owner: { status: 409, message: "La empresa debe conservar al menos un propietario activo. Asigna otro propietario primero." },
  owner_required: { status: 403, message: "Solo un propietario puede gestionar propietarios y administradores." },
  inactive: { status: 409, message: "Reactiva a la persona antes de hacerla propietaria." },
  unavailable: { status: 409, message: "La cuenta de esta persona ya no está activa en Leuret." }
};

export type MemberActionResult =
  | { success: true; changed: boolean; member: Record<string, unknown> | null }
  | { success: false; status: number; error: string };

/** Cambia el rol, desactiva, reactiva o quita a un miembro y avisa a la persona. */
export async function manageCompanyMemberService(
  userId: string,
  companyId: string,
  memberId: string,
  action: MemberAction,
  role: string | null = null
): Promise<MemberActionResult> {
  const result = await manageCompanyMemberRepo(userId, companyId, memberId, action, role);
  if (result.outcome !== "ok" && result.outcome !== "unchanged") {
    const error = MEMBER_ERRORS[result.outcome];
    return { success: false, status: error.status, error: error.message };
  }

  if (result.outcome === "ok" && result.target_user_id && result.target_user_id !== userId) {
    await notifyCompanyMemberChange(result.target_user_id, companyId, action, result.assigned_role);
  }

  // Al quitarse su propio rol de gestión, el usuario ya no puede leer la ficha.
  const member = action === "remove" ? null : await findCompanyMemberRepo(userId, companyId, memberId).catch(() => null);
  return { success: true, changed: result.outcome === "ok", member };
}

export async function leaveCompanyService(userId: string, companyId: string) {
  return leaveCompanyRepo(userId, companyId);
}

// --- Auditoría ---

export async function getAdminAuditLogsService(
  userId: string,
  companyId: string,
  page: number,
  limit: number,
  action?: string
) {
  return findAdminAuditLogsRepo(userId, companyId, page, limit, action);
}
