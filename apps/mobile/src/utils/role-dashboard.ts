import type { AttentionItem } from "./dashboard";

export type RoleDashboard = {
  role: string;
  currencyCode: string;
  myBudgets: {
    draftCount: number;
    awaitingCount: number;
    awaitingAmount: number;
    viewedCount: number;
    approvedThisMonthCount: number;
    approvedThisMonthAmount: number;
    expiringSoonCount: number;
    approvalRate90Days: number | null;
    decided90Days: number;
  };
  companyBudgets: { awaitingCount: number; awaitingAmount: number; expiringSoonCount: number };
  receivables: { total: number; overdueCount: number; overdueAmount: number; collectedThisMonth: number };
};

export type RoleKpi = { id: string; label: string; value: string; detail: string | null; tone: "default" | "positive" | "negative"; href: string };

const plural = (count: number, one: string, many: string) => (count === 1 ? one : many);

/** Tarjetas del inicio según el rol: el presupuestista ve lo suyo; ventas, cartera y seguimiento. */
export function roleKpis(dashboard: RoleDashboard, money: (value: number) => string): RoleKpi[] {
  if (dashboard.role === "estimator") {
    const mine = dashboard.myBudgets;
    return [
      {
        id: "awaiting",
        label: "Esperando respuesta",
        value: money(mine.awaitingAmount),
        detail: `${mine.awaitingCount} ${plural(mine.awaitingCount, "presupuesto", "presupuestos")} · ${mine.viewedCount} ${plural(mine.viewedCount, "visto", "vistos")}`,
        tone: "default",
        href: "/presupuestos",
      },
      {
        id: "approved",
        label: "Aprobado este mes",
        value: money(mine.approvedThisMonthAmount),
        detail: `${mine.approvedThisMonthCount} ${plural(mine.approvedThisMonthCount, "aprobado", "aprobados")}`,
        tone: mine.approvedThisMonthCount > 0 ? "positive" : "default",
        href: "/presupuestos",
      },
      {
        id: "rate",
        label: "Tasa de aprobación",
        value: mine.approvalRate90Days === null ? "—" : `${mine.approvalRate90Days}%`,
        detail: mine.decided90Days ? `Últimos 90 días · ${mine.decided90Days} ${plural(mine.decided90Days, "decisión", "decisiones")}` : "Aún sin decisiones de clientes",
        tone: mine.approvalRate90Days === null ? "default" : mine.approvalRate90Days >= 50 ? "positive" : "negative",
        href: "/presupuestos",
      },
      {
        id: "drafts",
        label: "Borradores",
        value: String(mine.draftCount),
        detail: mine.draftCount ? "Pendientes de enviar" : "Todo enviado",
        tone: "default",
        href: "/presupuestos",
      },
    ];
  }

  const { receivables, companyBudgets } = dashboard;
  return [
    {
      id: "collected",
      label: "Cobrado este mes",
      value: money(receivables.collectedThisMonth),
      detail: null,
      tone: "default",
      href: "/facturas",
    },
    {
      id: "receivable",
      label: "Por cobrar",
      value: money(receivables.total),
      detail: receivables.overdueAmount > 0 ? `${money(receivables.overdueAmount)} vencido` : "Nada vencido",
      tone: receivables.overdueAmount > 0 ? "negative" : "positive",
      href: "/facturas",
    },
    {
      id: "pipeline",
      label: "Presupuestos en espera",
      value: money(companyBudgets.awaitingAmount),
      detail: `${companyBudgets.awaitingCount} ${plural(companyBudgets.awaitingCount, "por cerrar", "por cerrar")}`,
      tone: "default",
      href: "/(tabs)/clientes",
    },
    {
      id: "overdue",
      label: "Facturas vencidas",
      value: String(receivables.overdueCount),
      detail: receivables.overdueCount ? "Para llamar hoy" : "Sin atrasos",
      tone: receivables.overdueCount ? "negative" : "positive",
      href: "/facturas",
    },
  ];
}

export function roleAttention(dashboard: RoleDashboard, money: (value: number) => string): AttentionItem[] {
  const items: AttentionItem[] = [];
  const isEstimator = dashboard.role === "estimator";
  const expiring = isEstimator ? dashboard.myBudgets.expiringSoonCount : dashboard.companyBudgets.expiringSoonCount;

  if (!isEstimator && dashboard.receivables.overdueCount > 0) {
    items.push({
      id: "overdue",
      severity: "danger",
      title: `${dashboard.receivables.overdueCount} ${plural(dashboard.receivables.overdueCount, "factura vencida", "facturas vencidas")}`,
      detail: `${money(dashboard.receivables.overdueAmount)} por cobrar fuera de plazo`,
      href: "/facturas",
    });
  }

  if (expiring > 0) {
    items.push({
      id: "expiring",
      severity: "warning",
      title: `${expiring} ${plural(expiring, "presupuesto vence", "presupuestos vencen")} esta semana`,
      detail: "Llama al cliente antes de que expire",
      href: "/presupuestos",
    });
  }

  if (isEstimator && dashboard.myBudgets.draftCount > 0) {
    items.push({
      id: "drafts",
      severity: "info",
      title: `${dashboard.myBudgets.draftCount} ${plural(dashboard.myBudgets.draftCount, "borrador sin enviar", "borradores sin enviar")}`,
      detail: "Termínalos y envíalos al cliente",
      href: "/presupuestos",
    });
  }

  return items;
}
