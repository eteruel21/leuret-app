import {
  findClientBudgets,
  getClientBudgetDetailRepo,
  findCompanyBudgets,
  createProjectBudgetRepo,
  getBudgetDetailsRepo,
  addBudgetItemRepo,
  deleteBudgetItemRepo,
  approveBudgetRepo,
  isLinkedClientForBudgetRepo,
  respondToBudgetAsClientRepo,
  rejectBudgetRepo,
  getBudgetHistoryRepo,
  findBudgetPriceUpdatesRepo,
  applyBudgetPriceUpdatesRepo,
  type CreateBudgetItemInput
} from "./repository.js";
import { notifyBudgetDecision } from "../notifications/event-service.js";

export async function getClientBudgetsService(userId: string) {
  return findClientBudgets(userId);
}

export async function getClientBudgetDetailService(userId: string, budgetId: string) {
  return getClientBudgetDetailRepo(userId, budgetId);
}

export async function getCompanyBudgetsService(userId: string, companyId: string, projectId?: string) {
  return findCompanyBudgets(userId, companyId, projectId);
}

export async function createProjectBudgetService(userId: string, companyId: string, projectId: string, title?: string) {
  return createProjectBudgetRepo(userId, companyId, projectId, title);
}

export async function getBudgetDetailsService(userId: string, budgetId: string, companyId: string) {
  return getBudgetDetailsRepo(userId, budgetId, companyId);
}

export async function addBudgetItemService(userId: string, budgetId: string, input: CreateBudgetItemInput) {
  return addBudgetItemRepo(userId, budgetId, input);
}

export async function deleteBudgetItemService(userId: string, budgetId: string, itemId: string, companyId: string) {
  return deleteBudgetItemRepo(userId, budgetId, itemId, companyId);
}

export async function approveBudgetService(userId: string, budgetId: string, companyId?: string) {
  // El cliente responde con una función de base de datos que valida que el
  // presupuesto sea suyo, esté enviado y vigente; el equipo usa el flujo normal.
  const budget = (await isLinkedClientForBudgetRepo(userId, budgetId))
    ? await respondToBudgetAsClientRepo(userId, budgetId, "approved")
    : await approveBudgetRepo(userId, budgetId, companyId);
  await notifyBudgetDecision(budget, "approved");
  return budget;
}

export async function rejectBudgetService(userId: string, budgetId: string, rejectionReason: string, companyId?: string) {
  const budget = (await isLinkedClientForBudgetRepo(userId, budgetId))
    ? await respondToBudgetAsClientRepo(userId, budgetId, "rejected", rejectionReason)
    : await rejectBudgetRepo(userId, budgetId, rejectionReason, companyId);
  await notifyBudgetDecision(budget, "rejected");
  return budget;
}

const CLIENT_RESPONSE_ERRORS: Record<string, { status: number; message: string }> = {
  budget_response_not_pending: { status: 409, message: "Este presupuesto ya fue respondido." },
  budget_response_expired: { status: 409, message: "Este presupuesto venció. Pide al contratista uno actualizado." },
  budget_response_reason_required: { status: 400, message: "Escribe el motivo del rechazo (máximo 1000 caracteres)." },
  budget_response_not_found: { status: 404, message: "No se encontró el presupuesto." },
  budget_response_not_allowed: { status: 403, message: "Tu cuenta no puede responder este presupuesto." }
};

/** Traduce los errores de la función de respuesta del cliente a mensajes claros. */
export function clientBudgetResponseError(error: unknown): { status: number; message: string } | null {
  const message = error instanceof Error ? error.message : "";
  const key = Object.keys(CLIENT_RESPONSE_ERRORS).find((code) => message.includes(code));
  return key ? CLIENT_RESPONSE_ERRORS[key]! : null;
}

export async function getBudgetHistoryService(userId: string, budgetId: string, companyId?: string) {
  return getBudgetHistoryRepo(userId, budgetId, companyId);
}

export async function getBudgetPriceUpdatesService(userId: string, budgetId: string, companyId: string) {
  return findBudgetPriceUpdatesRepo(userId, budgetId, companyId);
}

export async function applyBudgetPriceUpdatesService(
  userId: string,
  budgetId: string,
  companyId: string,
  itemIds: string[]
) {
  return applyBudgetPriceUpdatesRepo(userId, budgetId, companyId, itemIds);
}
