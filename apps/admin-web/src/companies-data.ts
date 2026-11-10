import { authenticatedRequest } from "./api";

export type AdminCompany = {
  id: string;
  name: string;
  legalName: string | null;
  taxId: string | null;
  email: string | null;
  phone: string | null;
  active: boolean;
  createdAt: string | null;
  ownerName: string | null;
  ownerEmail: string | null;
  memberCount: number;
  activeMemberCount: number;
  projectCount: number;
  activeProjectCount: number;
  clientCount: number;
  lastActivityAt: string | null;
};

export type AdminCompanyDetail = {
  company: {
    id: string;
    name: string;
    legalName: string | null;
    taxId: string | null;
    email: string | null;
    phone: string | null;
    address: string | null;
    active: boolean;
    currencyCode: string;
    timezone: string | null;
    createdAt: string | null;
    updatedAt: string | null;
  };
  members: Array<{
    id: string;
    userId: string;
    role: string;
    active: boolean;
    joinedAt: string | null;
    email: string | null;
    fullName: string | null;
    phone: string | null;
    profileActive: boolean | null;
  }>;
  recentProjects: Array<{
    id: string;
    name: string;
    projectCode: string | null;
    status: string;
    progressPercentage: number;
    updatedAt: string | null;
  }>;
};

export async function loadAdminCompanies(): Promise<AdminCompany[]> {
  const response = await authenticatedRequest<{ companies: AdminCompany[] }>("/admin/companies");
  return response.companies;
}

export async function loadAdminCompanyDetail(companyId: string): Promise<AdminCompanyDetail> {
  return authenticatedRequest<AdminCompanyDetail>(`/admin/companies/${companyId}`);
}

export const COMPANY_ROLE_LABELS: Record<string, string> = {
  owner: "Propietario",
  admin: "Administrador",
  supervisor: "Supervisor",
  sales: "Ventas",
  estimator: "Presupuestista",
  member: "Equipo de campo",
};

export const PROJECT_STATUS_LABELS: Record<string, string> = {
  lead: "Prospecto",
  inspection: "Inspección",
  quoted: "Cotizado",
  approved: "Aprobado",
  in_progress: "En curso",
  paused: "Pausado",
  completed: "Completado",
  cancelled: "Cancelado",
};

export type CompanyFilter = "all" | "active" | "inactive" | "idle" | "new";
export type CompanySort = "recent" | "name" | "projects" | "activity";

const DAY = 24 * 60 * 60 * 1000;

export function isIdle(company: AdminCompany, now = Date.now()): boolean {
  if (!company.lastActivityAt) return true;
  return now - new Date(company.lastActivityAt).getTime() > 30 * DAY;
}

export function isNew(company: AdminCompany, now = Date.now()): boolean {
  if (!company.createdAt) return false;
  return now - new Date(company.createdAt).getTime() <= 30 * DAY;
}

const normalize = (value: string | null | undefined) =>
  (value ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export function filterCompanies(
  companies: AdminCompany[],
  search: string,
  filter: CompanyFilter,
  sort: CompanySort,
  now = Date.now()
): AdminCompany[] {
  const query = normalize(search.trim());

  const filtered = companies.filter((company) => {
    if (filter === "active" && !company.active) return false;
    if (filter === "inactive" && company.active) return false;
    if (filter === "idle" && !isIdle(company, now)) return false;
    if (filter === "new" && !isNew(company, now)) return false;
    if (!query) return true;
    return [company.name, company.legalName, company.taxId, company.ownerName, company.ownerEmail, company.email, company.phone]
      .some((field) => normalize(field).includes(query));
  });

  const time = (value: string | null) => (value ? new Date(value).getTime() : 0);

  return [...filtered].sort((a, b) => {
    if (sort === "name") return a.name.localeCompare(b.name, "es");
    if (sort === "projects") return b.activeProjectCount - a.activeProjectCount || b.projectCount - a.projectCount;
    if (sort === "activity") return time(b.lastActivityAt) - time(a.lastActivityAt);
    return time(b.createdAt) - time(a.createdAt);
  });
}

export function relativeDays(value: string | null, now = Date.now()): string {
  if (!value) return "Sin actividad";
  const days = Math.floor((now - new Date(value).getTime()) / DAY);
  if (days <= 0) return "Hoy";
  if (days === 1) return "Ayer";
  if (days < 30) return `Hace ${days} días`;
  const months = Math.floor(days / 30);
  return months === 1 ? "Hace 1 mes" : `Hace ${months} meses`;
}
