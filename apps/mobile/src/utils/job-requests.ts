import type {
  JobRequestEffectiveStatus,
  JobRequestQuoteStatus,
  JobRequestTiming,
} from "@/types/job-request";
import { formatMoney } from "./format";
import type { StatusTone } from "@/utils/client-portal";

export const JOB_REQUEST_TIMINGS: { value: JobRequestTiming; label: string }[] = [
  { value: "urgent", label: "Urgente" },
  { value: "this_week", label: "Esta semana" },
  { value: "this_month", label: "Este mes" },
  { value: "flexible", label: "Flexible" },
];

export function timingLabel(timing: JobRequestTiming): string {
  return JOB_REQUEST_TIMINGS.find((option) => option.value === timing)?.label ?? "Flexible";
}

/** Estado de la petición para el cliente que la publicó. */
export function clientRequestState(status: JobRequestEffectiveStatus): { label: string; tone: StatusTone } {
  switch (status) {
    case "open":
      return { label: "Recibiendo presupuestos", tone: "info" };
    case "full":
      return { label: "Cupo completo", tone: "warning" };
    case "awarded":
      return { label: "Adjudicada", tone: "success" };
    case "expired":
      return { label: "Vencida", tone: "neutral" };
    default:
      return { label: "Cerrada", tone: "neutral" };
  }
}

/** Estado para el contratista: qué puede hacer su empresa con la petición. */
export function contractorRequestState(input: {
  effectiveStatus: JobRequestEffectiveStatus;
  quoteStatus: JobRequestQuoteStatus | null;
  awardedToMe?: boolean | null;
}): { label: string; tone: StatusTone } {
  if (input.awardedToMe || input.quoteStatus === "approved") return { label: "¡Te eligieron!", tone: "success" };
  if (input.quoteStatus === "rejected") return { label: "Presupuesto rechazado", tone: "danger" };
  if (input.quoteStatus === "sent") return { label: "Presupuesto enviado", tone: "info" };
  if (input.quoteStatus === "draft") return { label: "Presupuesto en borrador", tone: "warning" };
  if (input.effectiveStatus === "open") return { label: "Abierta", tone: "accent" };
  if (input.effectiveStatus === "awarded") return { label: "Adjudicada a otra empresa", tone: "neutral" };
  if (input.effectiveStatus === "full") return { label: "Cupo completo", tone: "neutral" };
  if (input.effectiveStatus === "expired") return { label: "Vencida", tone: "neutral" };
  return { label: "Cerrada", tone: "neutral" };
}

export function budgetRangeLabel(min: number | null, max: number | null): string | null {
  if (min != null && max != null) return `${formatMoney(min)} – ${formatMoney(max)}`;
  if (max != null) return `Hasta ${formatMoney(max)}`;
  if (min != null) return `Desde ${formatMoney(min)}`;
  return null;
}

export function locationLabel(request: { province: string; district: string | null; corregimiento: string | null }): string {
  return [request.corregimiento, request.district, request.province].filter(Boolean).join(", ");
}

/** «hace 5 min», «hace 3 h», «hace 2 días» o la fecha corta. */
export function timeAgo(date: string, now: Date = new Date()): string {
  const diffMs = now.getTime() - new Date(date).getTime();
  const minutes = Math.max(0, Math.round(diffMs / 60_000));
  if (minutes < 1) return "ahora";
  if (minutes < 60) return `hace ${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `hace ${hours} h`;
  const days = Math.round(hours / 24);
  if (days < 30) return `hace ${days} día${days === 1 ? "" : "s"}`;
  return new Intl.DateTimeFormat("es-PA", { day: "numeric", month: "short", timeZone: "America/Panama" }).format(new Date(date));
}

/** Días que faltan para que la petición venza (0 si ya venció). */
export function daysLeft(expiresAt: string, now: Date = new Date()): number {
  return Math.max(0, Math.ceil((new Date(expiresAt).getTime() - now.getTime()) / 86_400_000));
}

export type JobRequestFormValues = {
  title: string;
  description: string;
  category: string | null;
  province: string | null;
  addressLine: string;
  budgetMin: string;
  budgetMax: string;
};

/** Valida el formulario antes de enviarlo; devuelve el primer problema. */
export function validateJobRequestForm(values: JobRequestFormValues): string | null {
  if (values.title.trim().length < 5) return "Escribe un título de al menos 5 caracteres.";
  if (values.title.trim().length > 120) return "El título admite 120 caracteres.";
  if (!values.category) return "Elige el tipo de trabajo.";
  if (values.description.trim().length < 20) return "Describe el trabajo con al menos 20 caracteres: medidas, materiales, qué está mal…";
  if (values.description.trim().length > 4000) return "La descripción admite 4000 caracteres.";
  if (!values.province) return "Elige la provincia.";
  if (values.addressLine.trim().length < 3) return "Escribe la dirección. Solo la verá la empresa que te envíe un presupuesto.";

  const min = parseAmount(values.budgetMin);
  const max = parseAmount(values.budgetMax);
  if (Number.isNaN(min) || Number.isNaN(max)) return "El presupuesto debe ser un número.";
  if (min != null && max != null && min > max) return "El mínimo no puede ser mayor que el máximo.";
  return null;
}

/** "" → null; "1,500.50" → 1500.5; texto no numérico → NaN. */
export function parseAmount(value: string): number | null {
  const clean = value.replace(/[\s,$]/g, "");
  if (!clean) return null;
  const amount = Number(clean);
  return Number.isFinite(amount) && amount >= 0 ? amount : Number.NaN;
}
