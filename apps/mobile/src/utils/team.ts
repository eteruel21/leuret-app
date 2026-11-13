import type { CompanyRole, InvitableCompanyRole } from "../types/company";

/**
 * Lógica pura de la pantalla Equipo. Refleja las reglas de
 * apps/api/src/companies/services.ts para no ofrecer acciones que la API
 * rechazaría.
 */

export type TeamMember = {
  id: string;
  userId: string;
  role: CompanyRole;
  active: boolean;
  name: string;
  email: string;
  joinedAt: string | null;
};

type RawMember = {
  id: string;
  user_id: string;
  role: CompanyRole;
  active: boolean;
  created_at?: string | null;
  joined_at?: string | null;
  full_name?: string | null;
  email?: string | null;
  user?: { email?: string | null; full_name?: string | null } | null;
};

/** La API devuelve los datos del usuario anidados en `user`; aceptamos ambas formas. */
export function normalizeMember(raw: RawMember): TeamMember {
  const email = raw.user?.email ?? raw.email ?? "";
  const fullName = raw.user?.full_name ?? raw.full_name ?? "";
  const name = fullName && fullName !== email ? fullName : email.split("@")[0] || "Sin nombre";

  return {
    id: raw.id,
    userId: raw.user_id,
    role: raw.role,
    active: raw.active !== false,
    name,
    email,
    joinedAt: raw.joined_at ?? raw.created_at ?? null,
  };
}

const ROLE_ORDER: CompanyRole[] = ["owner", "admin", "supervisor", "sales", "estimator", "member"];

/** Activos primero, luego por jerarquía de rol y nombre. */
export function sortMembers(members: TeamMember[]): TeamMember[] {
  return [...members].sort((a, b) => {
    if (a.active !== b.active) return a.active ? -1 : 1;
    const byRole = ROLE_ORDER.indexOf(a.role) - ROLE_ORDER.indexOf(b.role);
    if (byRole !== 0) return byRole;
    return a.name.localeCompare(b.name, "es");
  });
}

export const ROLE_DESCRIPTIONS: Record<CompanyRole, string> = {
  owner: "Control total de la empresa, el equipo y las finanzas.",
  admin: "Gestiona equipo, catálogo, finanzas y configuración.",
  supervisor: "Dirige obras: proyectos, tareas, avances y agenda.",
  sales: "Clientes, proyectos, facturas y cobros.",
  estimator: "Prepara presupuestos y cálculos.",
  member: "Equipo de campo: sus tareas, agenda y cálculos.",
};

export const INVITABLE_ROLES: InvitableCompanyRole[] = ["admin", "supervisor", "sales", "estimator", "member"];

export type MemberActions = {
  changeRole: boolean;
  toggleActive: boolean;
  remove: boolean;
  /** Roles a los que se puede cambiar este miembro. */
  assignableRoles: CompanyRole[];
};

const NO_ACTIONS: MemberActions = { changeRole: false, toggleActive: false, remove: false, assignableRoles: [] };

export function memberActions(params: {
  callerRole: CompanyRole | null;
  callerUserId: string | null;
  target: TeamMember;
  activeOwnerCount: number;
}): MemberActions {
  const { callerRole, callerUserId, target, activeOwnerCount } = params;
  if (callerRole !== "owner" && callerRole !== "admin") return NO_ACTIONS;

  const isSelf = target.userId === callerUserId;
  const isLastOwner = target.role === "owner" && target.active && activeOwnerCount <= 1;

  // Solo un propietario puede tocar o asignar el rol de propietario.
  if (target.role === "owner" && callerRole !== "owner") return NO_ACTIONS;

  const assignableRoles = (callerRole === "owner" ? ROLE_ORDER : ROLE_ORDER.filter((role) => role !== "owner"))
    .filter((role) => role !== target.role)
    .filter(() => !isLastOwner);

  return {
    changeRole: assignableRoles.length > 0,
    toggleActive: !isSelf && !isLastOwner,
    remove: !isSelf && !isLastOwner,
    assignableRoles,
  };
}

export function invitationMessage(params: {
  companyName: string;
  code: string;
  roleLabel: string;
  email: string;
}): string {
  return [
    `Te invito a unirte a ${params.companyName} en Leuret como ${params.roleLabel}.`,
    "",
    `Abre https://app.leurettech.com/invitacion?codigo=${encodeURIComponent(params.code)}`,
    `Entra a Leuret con el correo ${params.email} y acepta la invitación.`,
    `Código: ${params.code}`,
    "",
    "El código vence en 7 días.",
  ].join("\n");
}

/** Extrae el código aunque peguen el mensaje completo de invitación. */
export function extractInvitationCode(input: string): string {
  const trimmed = input.trim();
  const fromMessage = trimmed.match(/c[oó]digo:\s*([A-Za-z0-9_-]{32,256})/i);
  if (fromMessage) return fromMessage[1];
  const token = trimmed.match(/[A-Za-z0-9_-]{32,256}/);
  return token ? token[0] : trimmed;
}

export function isValidInvitationCode(code: string): boolean {
  return /^[A-Za-z0-9_-]{32,256}$/.test(code);
}

const AUDIT_ACTIONS: Record<string, string> = {
  COMPANY_CREATED: "creó la empresa",
  INVITATION_ACCEPTED: "se unió con una invitación",
  COMPANY_SUSPENDED: "suspendió la empresa",
  COMPANY_REACTIVATED: "reactivó la empresa",
  MEMBER_ROLE_UPDATED: "cambió el rol de un miembro",
  MEMBER_ACTIVATED: "reactivó a un miembro",
  MEMBER_DEACTIVATED: "desactivó a un miembro",
  MEMBER_REMOVED: "quitó a un miembro de la empresa",
  BILLING_UPDATED: "actualizó los datos de facturación",
  INVITATION_CREATED: "envió una invitación",
  INVITATION_REVOKED: "canceló una invitación",
};

export function describeAuditAction(
  action: string,
  metadata: Record<string, unknown> | null | undefined,
  roleLabels: Record<string, string>
): string {
  const base = AUDIT_ACTIONS[action] ?? action.toLowerCase().replace(/_/g, " ");
  const meta = metadata ?? {};

  if (action === "MEMBER_ROLE_UPDATED" && typeof meta.oldRole === "string" && typeof meta.newRole === "string") {
    return `${base}: ${roleLabels[meta.oldRole] ?? meta.oldRole} → ${roleLabels[meta.newRole] ?? meta.newRole}`;
  }

  if (typeof meta.email === "string" && meta.email) {
    return `${base} (${meta.email})`;
  }

  return base;
}
