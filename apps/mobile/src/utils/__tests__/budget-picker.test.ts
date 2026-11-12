import { describe, expect, it } from "vitest";

import type { Budget, BudgetStatus } from "../../types/budget";
import { budgetAcceptsItems, editableBudgets } from "../budget-picker";

const budget = (id: string, status: BudgetStatus, title: string, updatedAt: string): Budget =>
  ({
    id,
    status,
    title,
    budget_number: `PRE-${id}`,
    updated_at: updatedAt,
  }) as Budget;

describe("budgetAcceptsItems", () => {
  it("bloquea aprobados y cancelados", () => {
    expect(budgetAcceptsItems("approved")).toBe(false);
    expect(budgetAcceptsItems("cancelled")).toBe(false);
    expect(budgetAcceptsItems("draft")).toBe(true);
    expect(budgetAcceptsItems("sent")).toBe(true);
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

  it("quita aprobados y cancelados y pone primero los borradores recientes", () => {
    expect(editableBudgets(list).map((item) => item.id)).toEqual(["4", "3", "1"]);
  });

  it("busca por nombre sin importar tildes ni mayúsculas, y por número", () => {
    expect(editableBudgets(list, "banO").map((item) => item.id)).toEqual(["3"]);
    expect(editableBudgets(list, "pre-1").map((item) => item.id)).toEqual(["1"]);
    expect(editableBudgets(list, "chen")).toEqual([]);
  });
});
