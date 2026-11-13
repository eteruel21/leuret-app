import type { JobRequestInboxConversation } from "@/types/job-request";

/** Avisos push que deben actualizar la campana en el momento. */
export const BELL_REFRESH_PUSH_TYPES = ["client_connection.requested", "job_request.message"] as const;

export function refreshesBell(type: unknown): boolean {
  return typeof type === "string" && (BELL_REFRESH_PUSH_TYPES as readonly string[]).includes(type);
}

/** Número del globo: solicitudes recibidas pendientes + mensajes sin leer. */
export function bellCount(pendingConnections: number, unreadMessages: number): number {
  const safe = (value: number) => (Number.isFinite(value) && value > 0 ? Math.floor(value) : 0);
  return safe(pendingConnections) + safe(unreadMessages);
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
