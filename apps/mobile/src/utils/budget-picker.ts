import type { Budget, BudgetStatus } from "@/types/budget";

/** Solo los borradores aceptan agregar o quitar partidas (igual que la API). */
export function budgetAcceptsItems(status: BudgetStatus): boolean {
  return status === "draft";
}

/** Estados desde los que «Editar presupuesto» lo vuelve a borrador. */
const REOPENABLE_STATUSES: readonly BudgetStatus[] = ["sent", "viewed", "rejected", "expired"];

export function budgetCanReopen(status: BudgetStatus): boolean {
  return REOPENABLE_STATUSES.includes(status);
}

function normalize(value: string | null | undefined): string {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

/**
 * Presupuestos a los que una calculadora puede agregar partidas: los
 * borradores. Filtra por número o nombre, del más reciente al más antiguo.
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
    .sort((a, b) => (b.updated_at ?? "").localeCompare(a.updated_at ?? ""));
}
