import type { JobRequestInboxConversation } from "@/types/job-request";

/** Avisos push que deben actualizar la campana en el momento. */
export const BELL_REFRESH_PUSH_TYPES = [
  "client_connection.requested",
  "company_invitation.received",
  "job_request.message",
  // Avisos que además se guardan en la bandeja (migración 047).
  "client_connection.accepted",
  "client_connection.ended",
  "company_member.updated",
  "company_member.removed",
  "budget.sent",
  "budget.approved",
  "budget.rejected",
  "invoice.issued",
  "invoice.payment_registered",
  "invoice.requested",
  "job_request.created",
] as const;

/** Icono del aviso guardado según su tipo. */
export function inboxNotificationIcon(type: string):
  | "document-text-outline" | "receipt-outline" | "briefcase-outline" | "people-outline" | "link-outline" | "notifications-outline" {
  if (type.startsWith("budget.")) return "document-text-outline";
  if (type.startsWith("invoice.")) return "receipt-outline";
  if (type.startsWith("job_request.")) return "briefcase-outline";
  if (type.startsWith("company_member.")) return "people-outline";
  if (type.startsWith("client_connection.")) return "link-outline";
  return "notifications-outline";
}

/** Avisos push que cambian la membresía del usuario: hay que recargar sus empresas. */
export const MEMBERSHIP_PUSH_TYPES = ["company_member.updated", "company_member.removed"] as const;

export function changesMembership(type: unknown): boolean {
  return typeof type === "string" && (MEMBERSHIP_PUSH_TYPES as readonly string[]).includes(type);
}

export function refreshesBell(type: unknown): boolean {
  return typeof type === "string" && (BELL_REFRESH_PUSH_TYPES as readonly string[]).includes(type);
}

/**
 * Número del globo: solicitudes de vinculación recibidas, mensajes sin leer e
 * invitaciones de equipo pendientes.
 */
export function bellCount(...counts: number[]): number {
  const safe = (value: number) => (Number.isFinite(value) && value > 0 ? Math.floor(value) : 0);
  return counts.reduce((total, value) => total + safe(value), 0);
}

export function badgeLabel(count: number): string {
  return count > 9 ? "9+" : String(count);
}

export function bellAccessibilityLabel(count: number): string {
  return count
    ? `Notificaciones, ${count} nueva${count === 1 ? "" : "s"}`
    : "Notificaciones";
}

/** Vista previa del último mensaje: «Tú: …» cuando lo escribió el usuario. */
export function inboxPreview(conversation: Pick<JobRequestInboxConversation, "side" | "last_sender_side" | "last_body" | "last_has_photo">): string {
  const text = conversation.last_body?.trim()
    || (conversation.last_has_photo ? "Foto" : "Mensaje");
  return conversation.last_sender_side === conversation.side ? `Tú: ${text}` : text;
}

/** Pantalla de la conversación según el lado del usuario. */
export function inboxConversationRoute(conversation: Pick<JobRequestInboxConversation, "side" | "request_id" | "company_id">) {
  const params = { requestId: conversation.request_id, companyId: conversation.company_id };
  return conversation.side === "client"
    ? { pathname: "/cliente-peticiones/conversacion", params }
    : { pathname: "/peticiones/conversacion", params };
}
