import {
  getAdminDashboardDataRepo,
  updateAdminUserRepo,
  saveCategoryRepo,
  saveItemRepo,
  saveUnitRepo,
  saveYieldRepo,
  saveFormulaRepo,
  saveGlobalPriceRepo,
  adjustPricesRepo,
  type UserInput,
  type CategoryInput,
  type ItemInput,
  type UnitInput,
  type YieldInput,
  type FormulaInput,
  type GlobalPriceInput,
  type AdjustPricesInput,
  listPriceHistoryRepo,
  findPriceAlertRowsRepo,
  type PriceHistoryQuery
} from "./repository.js";
import { classifyPriceAlerts, type PriceAlertOptions } from "./price-alerts.js";

export async function getAdminDashboardService(userId: string) {
  return getAdminDashboardDataRepo(userId);
}

export async function updateAdminUserService(userId: string, targetUserId: string, input: UserInput) {
  return updateAdminUserRepo(userId, targetUserId, input);
}

export async function saveCategoryService(userId: string, input: CategoryInput) {
  return saveCategoryRepo(userId, input);
}

export async function saveItemService(userId: string, input: ItemInput) {
  return saveItemRepo(userId, input);
}

export async function saveUnitService(userId: string, input: UnitInput) {
  return saveUnitRepo(userId, input);
}

export async function saveYieldService(userId: string, input: YieldInput) {
  return saveYieldRepo(userId, input);
}

export async function saveFormulaService(userId: string, input: FormulaInput) {
  return saveFormulaRepo(userId, input);
}

export async function saveGlobalPriceService(userId: string, itemId: string, input: GlobalPriceInput) {
  return saveGlobalPriceRepo(userId, itemId, input);
}

export async function adjustPricesService(userId: string, input: AdjustPricesInput) {
  return adjustPricesRepo(userId, input);
}

export async function listPriceHistoryService(userId: string, query: PriceHistoryQuery) {
  return listPriceHistoryRepo(userId, query);
}

export async function getPriceAlertsService(userId: string, options: PriceAlertOptions) {
  const rows = await findPriceAlertRowsRepo(userId, options.windowDays);
  const alerts = classifyPriceAlerts(rows, options);
  const counts = alerts.reduce<Record<string, number>>((acc, alert) => {
    acc[alert.kind] = (acc[alert.kind] ?? 0) + 1;
    return acc;
  }, {});

  return {
    generatedAt: new Date().toISOString(),
    options,
    counts,
    alerts
  };
}
