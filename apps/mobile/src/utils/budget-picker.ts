import type { Budget, BudgetStatus } from "@/types/budget";

/** Estados en los que la API ya no acepta agregar ni quitar partidas. */
const LOCKED_STATUSES: readonly BudgetStatus[] = ["approved", "cancelled"];

export function budgetAcceptsItems(status: BudgetStatus): boolean {
  return !LOCKED_STATUSES.includes(status);
}

function normalize(value: string | null | undefined): string {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

/**
 * Presupuestos a los que una calculadora puede agregar partidas (todos menos
 * aprobados y cancelados). Filtra por número o nombre; primero los borradores
 * y, dentro de cada grupo, del más reciente al más antiguo.
 */
export function editableBudgets(budgets: Budget[], search = ""): Budget[] {
  const term = normalize(search);
  return budgets
    .filter((budget) => budgetAcceptsItems(budget.status))
    .filter((budget) =>
      !term ||
      normalize(budget.budget_number).includes(term) ||
      normalize(budget.title).includes(term),
    )
    .sort((a, b) => {
      const draftOrder = Number(b.status === "draft") - Number(a.status === "draft");
      if (draftOrder !== 0) return draftOrder;
      return (b.updated_at ?? "").localeCompare(a.updated_at ?? "");
    });
}
