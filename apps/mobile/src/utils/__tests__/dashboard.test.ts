import { describe, expect, it } from "vitest";

import { buildAttentionItems, monthChange, type CompanyDashboard } from "../dashboard";

const money = (value: number) => `$${value.toFixed(2)}`;

const empty: CompanyDashboard = {
  currencyCode: "USD",
  collections: { thisMonth: 0, lastMonth: 0 },
  receivables: { total: 0, overdueCount: 0, overdueAmount: 0, overdueInvoices: [] },
  budgets: {
    draftCount: 0,
    awaitingCount: 0,
    awaitingAmount: 0,
    expiringSoonCount: 0,
    approvedThisMonthCount: 0,
    approvedThisMonthAmount: 0,
  },
  projects: { activeCount: 0, lateCount: 0, lateProjects: [] },
  tasks: { overdueCount: 0 },
};

describe("monthChange", () => {
  it("calcula la variación frente al mes pasado", () => {
    expect(monthChange(150, 100)).toBe(50);
    expect(monthChange(50, 100)).toBe(-50);
  });

  it("sin cobros el mes pasado no hay comparación", () => {
    expect(monthChange(500, 0)).toBeNull();
  });
});

describe("buildAttentionItems", () => {
  it("sin pendientes no muestra avisos", () => {
    expect(buildAttentionItems(empty, money)).toEqual([]);
  });

  it("una sola factura vencida lleva directo a esa factura", () => {
    const items = buildAttentionItems(
      {
        ...empty,
        receivables: {
          total: 700,
          overdueCount: 1,
          overdueAmount: 700,
          overdueInvoices: [{ id: "f1", invoiceNumber: "F-1", clientName: "Ferretería Sol", dueDate: "2026-10-15", balanceDue: 700 }],
        },
      },
      money
    );
    expect(items[0]).toEqual({
      id: "overdue-invoices",
      severity: "danger",
      title: "1 factura vencida",
      detail: "Ferretería Sol debe $700.00",
      href: "/facturas/f1",
    });
  });

  it("varias obras atrasadas llevan a la lista", () => {
    const items = buildAttentionItems({ ...empty, projects: { activeCount: 3, lateCount: 2, lateProjects: [] } }, money);
    expect(items[0]?.href).toBe("/proyectos");
    expect(items[0]?.title).toBe("2 obras atrasadas");
  });

  it("ordena lo urgente antes que lo informativo", () => {
    const items = buildAttentionItems(
      {
        ...empty,
        budgets: { ...empty.budgets, awaitingCount: 2, awaitingAmount: 1500, expiringSoonCount: 1 },
        tasks: { overdueCount: 3 },
        projects: { activeCount: 1, lateCount: 1, lateProjects: [{ id: "p1", name: "Casa Pérez", projectCode: null, estimatedEndDate: null, progressPercentage: 40 }] },
      },
      money
    );
    expect(items.map((item) => item.severity)).toEqual(["danger", "warning", "warning", "info"]);
    expect(items[0]?.detail).toContain("40%");
    expect(items[3]?.detail).toBe("$1500.00 en cotizaciones enviadas");
  });
});
