import { generateSecureToken, hashSecureToken } from "../auth/tokens.js";
import { sendCompanyInvitationEmail } from "../services/email.js";

const INVITATION_ROLE_LABELS: Record<string, string> = {
  admin: "Administrador",
  supervisor: "Supervisor",
  sales: "Ventas",
  estimator: "Presupuestista",
  member: "Equipo de campo"
};

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
  findCompanyMemberByIdRepo,
  countActiveCompanyOwnersRepo,
  updateCompanyMemberStatusRepo,
  updateCompanyMemberRoleRepo,
  deleteCompanyMemberRepo,
  insertAdminAuditLogRepo,
  findAdminAuditLogsRepo,
  type CreateCompanyInput,
  type BillingInput
} from "./repository.js";

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
  const { token, hash: tokenHash } = generateSecureToken();
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 días

  const invitation = await createCompanyInvitationRepo(userId, companyId, email, role, tokenHash, expiresAt);
  if (!invitation) return null;

  // El correo es una ayuda: si falla, la invitación sigue siendo válida y el
  // código se puede compartir a mano desde la app.
  let emailSent = false;
  try {
    const context = await findInvitationEmailContextRepo(userId, companyId);
    const delivery = await sendCompanyInvitationEmail({
      to: email,
      token,
      companyName: context?.company_name ?? "",
      inviterName: context?.inviter_name ?? null,
      roleLabel: INVITATION_ROLE_LABELS[role] ?? role
    });
    emailSent = delivery.sent;
  } catch {
    emailSent = false;
  }

  return { ...invitation, acceptanceToken: token, emailSent };
}

export async function getCompanyInvitationsService(userId: string, companyId: string) {
  return findCompanyInvitationsRepo(userId, companyId);
}

export async function acceptCompanyInvitationService(userId: string, token: string) {
  const acceptedInvitation = await acceptCompanyInvitationRepo(
    userId,
    hashSecureToken(token)
  );
  if (!acceptedInvitation) {
    return { success: false, error: "La invitación no es válida o no corresponde a tu correo." };
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

export async function updateCompanyMemberStatusService(
  userId: string,
  companyId: string,
  memberId: string,
  active: boolean
) {
  const member = await findCompanyMemberByIdRepo(userId, companyId, memberId);
  if (!member) {
    return { success: false, error: "El miembro no fue encontrado." };
  }

  if (member.user_id === userId && !active) {
    return { success: false, error: "No puedes desactivar tu propia membresía." };
  }

  if (!active && member.role === "owner") {
    const ownerCount = await countActiveCompanyOwnersRepo(userId, companyId);
    if (ownerCount <= 1) {
      return { success: false, error: "No se puede desactivar al único propietario activo de la empresa." };
    }
  }

  const updated = await updateCompanyMemberStatusRepo(userId, companyId, memberId, active);
  if (updated) {
    await insertAdminAuditLogRepo(userId, companyId, active ? "MEMBER_ACTIVATED" : "MEMBER_DEACTIVATED", "company_member", memberId, {
      targetUserId: member.user_id,
      email: member.email
    });
  }

  return { success: true, member: updated };
}

export async function updateCompanyMemberRoleService(
  userId: string,
  companyId: string,
  memberId: string,
  newRole: string
) {
  const members = await findCompanyMembersRepo(userId, companyId);
  const callerMember = members.find((m) => m.user_id === userId);
  const targetMember = members.find((m) => m.id === memberId);

  if (!targetMember) {
    return { success: false, error: "El miembro especificado no existe en la empresa." };
  }

  const callerRole = callerMember?.role ?? "member";

  if (callerRole !== "owner") {
    if (targetMember.role === "owner" || newRole === "owner") {
      return { success: false, error: "Solo un propietario ('owner') puede asignar o modificar el rol de propietario." };
    }
  }

  if (targetMember.role === "owner" && newRole !== "owner") {
    const ownerCount = await countActiveCompanyOwnersRepo(userId, companyId);
    if (ownerCount <= 1) {
      return { success: false, error: "La empresa debe mantener al menos un propietario activo." };
    }
  }

  const updated = await updateCompanyMemberRoleRepo(userId, companyId, memberId, newRole);
  if (updated) {
    await insertAdminAuditLogRepo(userId, companyId, "MEMBER_ROLE_UPDATED", "company_member", memberId, {
      targetUserId: targetMember.user_id,
      oldRole: targetMember.role,
      newRole
    });
  }

  return { success: true, member: updated };
}

export async function deleteCompanyMemberService(userId: string, companyId: string, memberId: string) {
  const member = await findCompanyMemberByIdRepo(userId, companyId, memberId);
  if (!member) {
    return { success: false, error: "El miembro no fue encontrado." };
  }

  if (member.user_id === userId) {
    return { success: false, error: "No puedes eliminarte a ti mismo de la empresa." };
  }

  if (member.role === "owner") {
    const ownerCount = await countActiveCompanyOwnersRepo(userId, companyId);
    if (ownerCount <= 1) {
      return { success: false, error: "No se puede eliminar al único propietario de la empresa." };
    }
  }

  const deleted = await deleteCompanyMemberRepo(userId, companyId, memberId);
  if (deleted) {
    await insertAdminAuditLogRepo(userId, companyId, "MEMBER_REMOVED", "company_member", memberId, {
      targetUserId: member.user_id,
      email: member.email
    });
  }

  return { success: true, member: deleted };
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
