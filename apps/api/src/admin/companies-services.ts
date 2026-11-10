import {
  findAdminCompanyDetailRepo,
  findAdminCompanyStatusHistoryRepo,
  listAdminCompaniesRepo,
  updateAdminCompanyStatusRepo
} from "./companies-repository.js";

type Row = Record<string, any>;

const toIso = (value: unknown): string | null =>
  value instanceof Date ? value.toISOString() : typeof value === "string" ? value : null;

export function mapAdminCompanyRow(row: Row) {
  return {
    id: String(row.id),
    name: String(row.name ?? ""),
    legalName: row.legal_name ?? null,
    taxId: row.tax_id ?? null,
    email: row.email ?? null,
    phone: row.phone ?? null,
    active: Boolean(row.active),
    createdAt: toIso(row.created_at),
    ownerName: row.owner_name ?? null,
    ownerEmail: row.owner_email ?? null,
    memberCount: Number(row.member_count ?? 0),
    activeMemberCount: Number(row.active_member_count ?? 0),
    projectCount: Number(row.project_count ?? 0),
    activeProjectCount: Number(row.active_project_count ?? 0),
    clientCount: Number(row.client_count ?? 0),
    lastActivityAt: toIso(row.last_activity_at)
  };
}

export async function listAdminCompaniesService(userId: string) {
  const rows = await listAdminCompaniesRepo(userId);
  return rows.map(mapAdminCompanyRow);
}

export async function updateAdminCompanyStatusService(
  userId: string,
  companyId: string,
  active: boolean,
  reason: string
) {
  const company = await updateAdminCompanyStatusRepo(userId, companyId, active, reason.trim());
  return company ? { id: String(company.id), name: String(company.name), active: Boolean(company.active) } : null;
}

export async function getAdminCompanyDetailService(userId: string, companyId: string) {
  const [detail, statusHistory] = await Promise.all([
    findAdminCompanyDetailRepo(userId, companyId),
    findAdminCompanyStatusHistoryRepo(userId, companyId)
  ]);
  if (!detail) return null;

  const { company } = detail;
  return {
    company: {
      id: String(company.id),
      name: String(company.name ?? ""),
      legalName: company.legal_name ?? null,
      taxId: company.tax_id ?? null,
      email: company.email ?? null,
      phone: company.phone ?? null,
      address: company.address ?? null,
      active: Boolean(company.active),
      currencyCode: company.currency_code ?? "USD",
      timezone: company.timezone ?? null,
      createdAt: toIso(company.created_at),
      updatedAt: toIso(company.updated_at)
    },
    members: detail.members.map((member: Row) => ({
      id: String(member.id),
      userId: String(member.user_id),
      role: String(member.role),
      active: Boolean(member.active),
      joinedAt: toIso(member.created_at),
      email: member.email ?? null,
      fullName: member.full_name ?? null,
      phone: member.phone ?? null,
      profileActive: member.profile_active ?? null
    })),
    statusHistory: statusHistory.map((entry: Row) => ({
      id: String(entry.id),
      action: String(entry.action),
      reason: typeof entry.metadata?.reason === "string" ? entry.metadata.reason : null,
      actorName: entry.actor_name ?? null,
      createdAt: toIso(entry.created_at)
    })),
    recentProjects: detail.recentProjects.map((project: Row) => ({
      id: String(project.id),
      name: String(project.name ?? ""),
      projectCode: project.project_code ?? null,
      status: String(project.status),
      progressPercentage: Number(project.progress_percentage ?? 0),
      updatedAt: toIso(project.updated_at)
    }))
  };
}
