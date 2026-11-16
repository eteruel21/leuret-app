import {
  findClientProjectsRepo,
  findCompanyProjectsRepo,
  createProjectRepo,
  getProjectByIdRepo,
  findCompanyRoleRepo,
  updateProjectStatusRepo,
  updateProjectProgressRepo,
  updateProjectRepo,
  type CreateProjectInput,
  type UpdateProjectInput
} from "./repository.js";

export async function getClientProjectsService(userId: string) {
  return findClientProjectsRepo(userId);
}

export async function getCompanyProjectsService(userId: string, companyId: string, clientId?: string) {
  const [projects, role] = await Promise.all([
    findCompanyProjectsRepo(userId, companyId, clientId),
    findCompanyRoleRepo(userId, companyId)
  ]);
  return projects.map((project) => redactProjectFinancials(project, role));
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

/** Corrige los datos de la obra. Los montos solo los cambian los roles que los ven. */
export async function updateProjectService(userId: string, projectId: string, input: UpdateProjectInput) {
  const role = await findCompanyRoleRepo(userId, input.companyId);
  const safeInput = role && FINANCIAL_ROLES.has(role) ? input : { ...input, budgetEstimate: undefined };
  const updated = await updateProjectRepo(userId, projectId, safeInput);
  return updated ? getProjectByIdService(userId, projectId, input.companyId) : null;
}
