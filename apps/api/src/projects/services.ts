import {
  findClientProjectsRepo,
  findCompanyProjectsRepo,
  createProjectRepo,
  getProjectByIdRepo,
  findCompanyRoleRepo,
  updateProjectStatusRepo,
  updateProjectProgressRepo,
  type CreateProjectInput
} from "./repository.js";

export async function getClientProjectsService(userId: string) {
  return findClientProjectsRepo(userId);
}

export async function getCompanyProjectsService(userId: string, companyId: string, clientId?: string) {
  return findCompanyProjectsRepo(userId, companyId, clientId);
}

export async function createProjectService(userId: string, input: CreateProjectInput) {
  return createProjectRepo(userId, input);
}

const FINANCIAL_ROLES = new Set(["owner", "admin", "supervisor", "sales"]);

/** Quita los montos del proyecto para roles que no manejan dinero. */
export function redactProjectFinancials<T extends Record<string, unknown>>(project: T, role: string | null): T & { financials_hidden?: boolean } {
  if (role && FINANCIAL_ROLES.has(role)) return project;
  return { ...project, budget_estimate: null, contract_value: null, financials_hidden: true };
}

export async function getProjectByIdService(userId: string, projectId: string, companyId: string) {
  const [project, role] = await Promise.all([
    getProjectByIdRepo(userId, projectId, companyId),
    findCompanyRoleRepo(userId, companyId)
  ]);
  return project ? redactProjectFinancials(project, role) : null;
}

export async function updateProjectStatusService(userId: string, projectId: string, companyId: string, status: string) {
  return updateProjectStatusRepo(userId, projectId, companyId, status);
}

export async function updateProjectProgressService(userId: string, projectId: string, companyId: string, progressPercentage: number) {
  return updateProjectProgressRepo(userId, projectId, companyId, progressPercentage);
}
