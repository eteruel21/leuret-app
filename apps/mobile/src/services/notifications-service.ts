import { authenticatedRequest } from "./api";

export type InboxSpace = "client" | "company";

/** Aviso guardado en PostgreSQL (public.notifications, migración 047). */
export type InboxNotification = {
  id: string;
  company_id: string | null;
  space: InboxSpace | null;
  title: string;
  body: string;
  type: string;
  data: Record<string, unknown>;
  read_at: string | null;
  created_at: string;
};

export type NotificationInbox = {
  notifications: InboxNotification[];
  unread: number;
};

type Scope = { space: InboxSpace; companyId?: string | null };

function scopeQuery({ space, companyId }: Scope, limit?: number): string {
  const params = new URLSearchParams({ space });
  if (space === "company" && companyId) params.set("companyId", companyId);
  if (limit) params.set("limit", String(limit));
  return params.toString();
}

/** Avisos del espacio activo (y de la empresa activa en el de contratista). */
export async function getNotificationInbox(scope: Scope & { limit?: number }): Promise<NotificationInbox> {
  const res = await authenticatedRequest<NotificationInbox>(`/notifications?${scopeQuery(scope, scope.limit)}`);
  return {
    notifications: Array.isArray(res.notifications) ? res.notifications : [],
    unread: Number.isFinite(res.unread) ? res.unread : 0,
  };
}

export async function markNotificationsRead(
  scope: Scope,
  target: { ids: string[] } | { all: true },
): Promise<number> {
  const res = await authenticatedRequest<{ updated: number }>("/notifications/read", {
    method: "POST",
    body: JSON.stringify({
      space: scope.space,
      companyId: scope.space === "company" ? scope.companyId ?? null : null,
      ...target,
    }),
  });
  return res.updated ?? 0;
}
