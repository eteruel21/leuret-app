import { notificationRoute } from "./client-portal";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type NotificationSpaceContext = {
  /** El usuario está ahora en su espacio de cliente. */
  isClient: boolean;
  activeCompanyId: string | null;
  memberCompanyIds: string[];
  hasClientSpace: boolean;
};

export type NotificationSpaceSwitch =
  | { kind: "company"; companyId: string }
  | { kind: "client" };

export type NotificationTarget = {
  route: { pathname: string; params: Record<string, string> };
  /** Espacio al que hay que cambiar antes de abrir la ruta (null = el actual). */
  switchTo: NotificationSpaceSwitch | null;
  /** Espacio en el que se abre la ruta. */
  isClient: boolean;
  companyId: string | null;
};

/**
 * Decide qué pantalla abre un aviso y en qué espacio. La API indica el
 * espacio del aviso (`space`, y `spaceCompanyId` si es de una empresa): si el
 * usuario está en otro espacio u otra empresa, primero se cambia, así el
 * documento se abre con los permisos y datos correctos.
 */
export function resolveNotificationTarget(
  data: Record<string, unknown> | null | undefined,
  context: NotificationSpaceContext,
): NotificationTarget | null {
  if (!data) return null;

  const space = data.space === "client" || data.space === "company" ? data.space : null;
  const rawCompanyId = typeof data.spaceCompanyId === "string" && UUID_PATTERN.test(data.spaceCompanyId)
    ? data.spaceCompanyId
    : null;

  let isClient = context.isClient;
  let companyId = context.isClient ? null : context.activeCompanyId;
  let switchTo: NotificationSpaceSwitch | null = null;

  if (space === "client") {
    if (!context.hasClientSpace) return null;
    if (!context.isClient) switchTo = { kind: "client" };
    isClient = true;
    companyId = null;
  } else if (space === "company") {
    if (rawCompanyId && !context.memberCompanyIds.includes(rawCompanyId)) return null;
    const target = rawCompanyId ?? context.activeCompanyId ?? context.memberCompanyIds[0] ?? null;
    if (!target) return null;
    if (context.isClient || target !== context.activeCompanyId) {
      switchTo = { kind: "company", companyId: target };
    }
    isClient = false;
    companyId = target;
  }

  const route = notificationRoute(data, isClient);
  return route ? { route, switchTo, isClient, companyId } : null;
}
