import { describe, expect, it } from "vitest";

import type { Budget, BudgetStatus } from "../../types/budget";
import { budgetAcceptsItems, budgetCanReopen, editableBudgets } from "../budget-picker";

const budget = (id: string, status: BudgetStatus, title: string, updatedAt: string): Budget =>
  ({
    id,
    status,
    title,
    budget_number: `PRE-${id}`,
    updated_at: updatedAt,
  }) as Budget;

describe("budgetAcceptsItems / budgetCanReopen", () => {
  it("solo los borradores aceptan partidas", () => {
    expect(budgetAcceptsItems("draft")).toBe(true);
    expect(budgetAcceptsItems("sent")).toBe(false);
    expect(budgetAcceptsItems("approved")).toBe(false);
  });

  it("enviados, vistos, rechazados y vencidos se pueden reabrir; aprobados y cancelados no", () => {
    expect(["sent", "viewed", "rejected", "expired"].every((status) => budgetCanReopen(status as BudgetStatus))).toBe(true);
    expect(budgetCanReopen("approved")).toBe(false);
    expect(budgetCanReopen("cancelled")).toBe(false);
    expect(budgetCanReopen("draft")).toBe(false);
  });
});

describe("editableBudgets", () => {
  const list = [
    budget("1", "sent", "Casa Pérez", "2026-11-10T10:00:00Z"),
    budget("2", "approved", "Local Chen", "2026-11-11T10:00:00Z"),
    budget("3", "draft", "Baño Gómez", "2026-11-01T10:00:00Z"),
    budget("4", "draft", "Cocina Ríos", "2026-11-09T10:00:00Z"),
    budget("5", "cancelled", "Muro norte", "2026-11-12T10:00:00Z"),
  ];

  it("deja solo borradores, del más reciente al más antiguo", () => {
    expect(editableBudgets(list).map((item) => item.id)).toEqual(["4", "3"]);
  });

  it("busca por nombre sin importar tildes ni mayúsculas, y por número", () => {
    expect(editableBudgets(list, "banO").map((item) => item.id)).toEqual(["3"]);
    expect(editableBudgets(list, "pre-4").map((item) => item.id)).toEqual(["4"]);
    expect(editableBudgets(list, "pérez")).toEqual([]);
    expect(editableBudgets(list, "chen")).toEqual([]);
  });
});
