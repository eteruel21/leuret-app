// Utilidades puras del portal del cliente (sin React Native), para poder
// probarlas con vitest.

import type { BudgetStatus } from "@/types/budget";
import type { InvoiceStatus } from "@/types/invoice";
import type { ProjectStatus } from "@/types/project";

export type StatusTone = "neutral" | "info" | "success" | "warning" | "danger" | "accent";

/** Estado del presupuesto como lo ve el cliente (incluye si ya venció). */
export function clientBudgetState(
  status: BudgetStatus,
  validUntil: string | null | undefined,
  today: string = todayKey(),
): { key: "pending" | "approved" | "rejected" | "expired" | "other"; label: string; tone: StatusTone } {
  const awaiting = status === "sent" || status === "viewed";
  const expired = status === "expired" || (awaiting && Boolean(validUntil) && validUntil!.slice(0, 10) < today);

  if (expired) return { key: "expired", label: "Vencido", tone: "neutral" };
  if (awaiting) return { key: "pending", label: status === "sent" ? "Nuevo · por responder" : "Por responder", tone: "accent" };
  if (status === "approved") return { key: "approved", label: "Aprobado", tone: "success" };
  if (status === "rejected") return { key: "rejected", label: "Cambios solicitados", tone: "warning" };
  return { key: "other", label: status === "cancelled" ? "Anulado" : "Borrador", tone: "neutral" };
}

export function projectStatusTone(status: ProjectStatus): StatusTone {
  switch (status) {
    case "in_progress":
      return "info";
    case "completed":
      return "success";
    case "paused":
      return "warning";
    case "cancelled":
      return "neutral";
    case "approved":
      return "accent";
    default:
      return "neutral";
  }
}

export function isProjectActive(status: ProjectStatus): boolean {
  return status === "approved" || status === "in_progress" || status === "paused" || status === "inspection";
}

export function clientInvoiceState(invoice: {
  status: InvoiceStatus;
  balance_due: number | null;
  is_overdue?: boolean | null;
}): { key: "open" | "overdue" | "paid" | "cancelled"; label: string; tone: StatusTone } {
  if (invoice.status === "cancelled") return { key: "cancelled", label: "Anulada", tone: "neutral" };
  if (invoice.status === "paid" || (invoice.balance_due ?? 0) <= 0) {
    return { key: "paid", label: "Pagada", tone: "success" };
  }
  if (invoice.is_overdue || invoice.status === "overdue") return { key: "overdue", label: "Vencida", tone: "danger" };
  if (invoice.status === "partially_paid") return { key: "open", label: "Abono parcial", tone: "warning" };
  return { key: "open", label: "Por pagar", tone: "accent" };
}

/** Fecha de hoy (AAAA-MM-DD) en la zona horaria indicada. */
export function todayKey(timeZone = "America/Panama", now: Date = new Date()): string {
  try {
    return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
  } catch {
    return now.toISOString().slice(0, 10);
  }
}

/** Días calendario desde hoy hasta la fecha (negativo si ya pasó). */
export function daysUntil(date: string, today: string = todayKey()): number {
  const target = Date.UTC(Number(date.slice(0, 4)), Number(date.slice(5, 7)) - 1, Number(date.slice(8, 10)));
  const base = Date.UTC(Number(today.slice(0, 4)), Number(today.slice(5, 7)) - 1, Number(today.slice(8, 10)));
  return Math.round((target - base) / 86_400_000);
}

export function addDaysKey(days: number, today: string = todayKey()): string {
  const base = Date.UTC(Number(today.slice(0, 4)), Number(today.slice(5, 7)) - 1, Number(today.slice(8, 10)));
  return new Date(base + days * 86_400_000).toISOString().slice(0, 10);
}

/** "Hoy", "Mañana", "En 5 días", "Hace 2 días". */
export function relativeDayLabel(date: string, today: string = todayKey()): string {
  const days = daysUntil(date, today);
  if (days === 0) return "Hoy";
  if (days === 1) return "Mañana";
  if (days === -1) return "Ayer";
  if (days > 1) return `En ${days} días`;
  return `Hace ${Math.abs(days)} días`;
}

/**
 * Número para WhatsApp (wa.me) a partir de un teléfono de Panamá.
 * Números locales de 7 u 8 dígitos reciben el prefijo 507.
 */
export function whatsappNumber(phone: string | null | undefined, countryCode = "507"): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 7) return null;
  if (digits.length <= 8) return `${countryCode}${digits}`;
  return digits;
}

export function telUrl(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const cleaned = phone.replace(/[^\d+]/g, "");
  return cleaned.length >= 7 ? `tel:${cleaned}` : null;
}

export function mapsUrl(address: string | null | undefined): string | null {
  const query = address?.trim();
  return query ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}` : null;
}

/** Búsqueda sin tildes ni mayúsculas. */
export function matchesSearch(query: string, ...fields: (string | null | undefined)[]): boolean {
  const normalize = (value: string) => value.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const needle = normalize(query.trim());
  if (!needle) return true;
  return fields.some((field) => field && normalize(field).includes(needle));
}

export const BUDGET_CHANGE_REASONS = [
  "El precio es más alto de lo esperado",
  "Quiero ajustar el alcance del trabajo",
  "Necesito otras fechas",
  "Quiero otros materiales o acabados",
] as const;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Pantalla a la que lleva tocar un aviso push. Solo acepta identificadores
 * con forma de UUID, para no navegar con datos arbitrarios del payload.
 */
export function notificationRoute(
  data: Record<string, unknown> | null | undefined,
  isClient: boolean,
): { pathname: string; params: Record<string, string> } | null {
  if (!data || typeof data.type !== "string") return null;
  const id = (value: unknown) => (typeof value === "string" && UUID_PATTERN.test(value) ? value : null);

  switch (data.type) {
    case "client_connection.requested": {
      const requestId = id(data.requestId);
      return requestId ? { pathname: "/solicitudes", params: { id: requestId } } : null;
    }
    case "budget.sent": {
      const budgetId = id(data.budgetId);
      return budgetId && isClient ? { pathname: "/cliente-presupuestos/[id]", params: { id: budgetId } } : null;
    }
    case "budget.approved":
    case "budget.rejected": {
      const budgetId = id(data.budgetId);
      return budgetId && !isClient ? { pathname: "/presupuestos/[id]", params: { id: budgetId } } : null;
    }
    case "invoice.issued":
    case "invoice.payment_registered":
    case "invoice.payment_reminder": {
      const invoiceId = id(data.invoiceId);
      if (!invoiceId) return null;
      return isClient
        ? { pathname: "/cliente-facturas/[id]", params: { id: invoiceId } }
        : { pathname: "/facturas/[id]", params: { id: invoiceId } };
    }
    case "job_request.created": {
      const requestId = id(data.requestId);
      return requestId && !isClient ? { pathname: "/peticiones/[id]", params: { id: requestId } } : null;
    }
    case "job_request.message": {
      const requestId = id(data.requestId);
      const companyId = id(data.companyId);
      if (!requestId || !companyId) return null;
      return isClient
        ? { pathname: "/cliente-peticiones/conversacion", params: { requestId, companyId } }
        : { pathname: "/peticiones/conversacion", params: { requestId, companyId } };
    }
    default:
      return null;
  }
}

const MONTHS_SHORT = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

/** "ene", "feb"… a partir de una fecha AAAA-MM-DD. */
export function shortMonth(date: string): string {
  return MONTHS_SHORT[Number(date.slice(5, 7)) - 1] ?? "";
}
