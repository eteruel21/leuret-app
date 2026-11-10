/** Lógica pura del inicio del dueño (sin React), para poder probarla. */

export type CompanyDashboard = {
  currencyCode: string;
  collections: { thisMonth: number; lastMonth: number };
  receivables: {
    total: number;
    overdueCount: number;
    overdueAmount: number;
    overdueInvoices: {
      id: string;
      invoiceNumber: string | null;
      clientName: string | null;
      dueDate: string | null;
      balanceDue: number;
    }[];
  };
  budgets: {
    draftCount: number;
    awaitingCount: number;
    awaitingAmount: number;
    expiringSoonCount: number;
    approvedThisMonthCount: number;
    approvedThisMonthAmount: number;
  };
  projects: {
    activeCount: number;
    /** Prospecto, inspección o cotizado. Puede faltar si la API es anterior. */
    preparingCount?: number;
    lateCount: number;
    lateProjects: {
      id: string;
      name: string;
      projectCode: string | null;
      estimatedEndDate: string | null;
      progressPercentage: number;
    }[];
  };
  tasks: { overdueCount: number };
};

/** Variación porcentual frente al mes anterior; null si no hay base para comparar. */
export function monthChange(thisMonth: number, lastMonth: number): number | null {
  if (!Number.isFinite(thisMonth) || !Number.isFinite(lastMonth) || lastMonth <= 0) return null;
  return Math.round(((thisMonth - lastMonth) / lastMonth) * 100);
}

/** Detalle de la tarjeta de obras: atrasos primero, luego lo que está por arrancar. */
export function projectsKpiDetail(projects: CompanyDashboard["projects"]): { text: string; tone: "positive" | "negative" | "default" } {
  if (projects.lateCount > 0) {
    return { text: `${projects.lateCount} ${projects.lateCount === 1 ? "atrasada" : "atrasadas"}`, tone: "negative" };
  }
  const preparing = projects.preparingCount ?? 0;
  if (preparing > 0) {
    return { text: `${preparing} en preparación`, tone: "default" };
  }
  return { text: projects.activeCount > 0 ? "Todas a tiempo" : "Sin obras en curso", tone: projects.activeCount > 0 ? "positive" : "default" };
}

export type AttentionSeverity = "danger" | "warning" | "info";

export type AttentionItem = {
  id: string;
  severity: AttentionSeverity;
  title: string;
  detail: string;
  /** Ruta a la que lleva el aviso. */
  href: string;
};

const plural = (count: number, one: string, many: string) => (count === 1 ? one : many);

/**
 * Avisos ordenados por urgencia. Cuando hay un único caso, el aviso lleva
 * directo a ese registro en vez de a la lista.
 */
export function buildAttentionItems(
  dashboard: CompanyDashboard,
  formatMoney: (value: number) => string
): AttentionItem[] {
  const items: AttentionItem[] = [];
  const { receivables, budgets, projects, tasks } = dashboard;

  if (receivables.overdueCount > 0) {
    const single = receivables.overdueCount === 1 ? receivables.overdueInvoices[0] : undefined;
    items.push({
      id: "overdue-invoices",
      severity: "danger",
      title: `${receivables.overdueCount} ${plural(receivables.overdueCount, "factura vencida", "facturas vencidas")}`,
      detail: single?.clientName
        ? `${single.clientName} debe ${formatMoney(single.balanceDue)}`
        : `${formatMoney(receivables.overdueAmount)} por cobrar fuera de plazo`,
      href: single ? `/facturas/${single.id}` : "/facturas",
    });
  }

  if (projects.lateCount > 0) {
    const single = projects.lateCount === 1 ? projects.lateProjects[0] : undefined;
    items.push({
      id: "late-projects",
      severity: "danger",
      title: `${projects.lateCount} ${plural(projects.lateCount, "obra atrasada", "obras atrasadas")}`,
      detail: single
        ? `${single.name} va al ${Math.round(single.progressPercentage)}% y ya pasó su fecha de entrega`
        : "Pasaron su fecha estimada de entrega",
      href: single ? `/proyectos/${single.id}` : "/proyectos",
    });
  }

  if (budgets.expiringSoonCount > 0) {
    items.push({
      id: "expiring-budgets",
      severity: "warning",
      title: `${budgets.expiringSoonCount} ${plural(budgets.expiringSoonCount, "presupuesto vence", "presupuestos vencen")} esta semana`,
      detail: "Haz seguimiento con el cliente antes de que expiren",
      href: "/presupuestos",
    });
  }

  if (tasks.overdueCount > 0) {
    items.push({
      id: "overdue-tasks",
      severity: "warning",
      title: `${tasks.overdueCount} ${plural(tasks.overdueCount, "tarea vencida", "tareas vencidas")}`,
      detail: "Tareas de obra sin completar después de su fecha",
      href: "/proyectos",
    });
  }

  if (budgets.awaitingCount > 0) {
    items.push({
      id: "awaiting-budgets",
      severity: "info",
      title: `${budgets.awaitingCount} ${plural(budgets.awaitingCount, "presupuesto espera", "presupuestos esperan")} respuesta`,
      detail: `${formatMoney(budgets.awaitingAmount)} en cotizaciones enviadas`,
      href: "/presupuestos",
    });
  }

  return items;
}
