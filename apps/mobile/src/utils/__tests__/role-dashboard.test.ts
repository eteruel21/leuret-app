import { describe, expect, it } from "vitest";

import { roleAttention, roleKpis, type RoleDashboard } from "../role-dashboard";

const money = (value: number) => `$${value}`;

const base: RoleDashboard = {
  role: "estimator",
  currencyCode: "USD",
  myBudgets: {
    draftCount: 1,
    awaitingCount: 2,
    awaitingAmount: 1500,
    viewedCount: 1,
    approvedThisMonthCount: 1,
    approvedThisMonthAmount: 2000,
    expiringSoonCount: 1,
    approvalRate90Days: 50,
    decided90Days: 2,
  },
  companyBudgets: { awaitingCount: 3, awaitingAmount: 4000, expiringSoonCount: 2 },
  receivables: { total: 1050, overdueCount: 1, overdueAmount: 700, collectedThisMonth: 500 },
};

describe("inicio del presupuestista", () => {
  it("muestra sus propios presupuestos y la tasa de aprobación", () => {
    const kpis = roleKpis(base, money);
    expect(kpis.map((kpi) => kpi.id)).toEqual(["awaiting", "approved", "rate", "drafts"]);
    expect(kpis[0]?.value).toBe("$1500");
    expect(kpis[2]?.value).toBe("50%");
  });

  it("sin decisiones de clientes no inventa una tasa", () => {
    const kpis = roleKpis({ ...base, myBudgets: { ...base.myBudgets, approvalRate90Days: null, decided90Days: 0 } }, money);
    expect(kpis[2]?.value).toBe("—");
  });

  it("no le muestra cobros vencidos (no es su tarea)", () => {
    const items = roleAttention(base, money);
    expect(items.map((item) => item.id)).toEqual(["expiring", "drafts"]);
  });
});

describe("inicio de ventas", () => {
  const sales = { ...base, role: "sales" };

  it("muestra cobros, cartera y presupuestos de la empresa", () => {
    const kpis = roleKpis(sales, money);
    expect(kpis.map((kpi) => kpi.id)).toEqual(["collected", "receivable", "pipeline", "overdue"]);
    expect(kpis[2]?.value).toBe("$4000");
  });

  it("prioriza las facturas vencidas", () => {
    const items = roleAttention(sales, money);
    expect(items[0]?.id).toBe("overdue");
    expect(items[1]?.title).toBe("2 presupuestos vencen esta semana");
  });
});
