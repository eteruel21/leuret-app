import * as Notifications from "expo-notifications";
import { type Href, router } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { Platform } from "react-native";

import { markNotificationsRead } from "@/services/notifications-service";
import {
  type NotificationSpaceContext,
  type NotificationTarget,
  resolveNotificationTarget,
} from "@/utils/notification-target";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PENDING_TIMEOUT_MS = 8_000;

type Options = NotificationSpaceContext & {
  enabled: boolean;
  switchToCompany: (companyId: string) => Promise<void>;
  switchToClientSpace: () => Promise<void>;
};

type Pending = NotificationTarget & { createdAt: number };

/**
 * Lleva a la pantalla del aviso cuando se toca una notificación: con la app
 * abierta (listener) y al abrirla desde el aviso (última respuesta). Si el
 * aviso es de otro espacio u otra empresa, primero cambia de espacio y abre
 * la pantalla cuando el navegador ya muestra ese espacio. Cada aviso se
 * procesa una sola vez.
 */
export function useNotificationNavigation(options: Options) {
  const handled = useRef(new Set<string>());
  const latest = useRef(options);
  useEffect(() => {
    latest.current = options;
  });
  const [pending, setPending] = useState<Pending | null>(null);

  const { enabled, isClient, activeCompanyId } = options;

  useEffect(() => {
    if (!enabled || Platform.OS === "web") return;
    let active = true;

    async function open(response: Notifications.NotificationResponse | null | undefined) {
      if (!response || !active) return;
      const key = response.notification.request.identifier;
      if (handled.current.has(key)) return;
      handled.current.add(key);

      const data = response.notification.request.content.data as Record<string, unknown> | undefined;
      const context = latest.current;
      const target = resolveNotificationTarget(data, context);

      // El aviso también está guardado en la bandeja: queda leído.
      const notificationId = data?.notificationId;
      if (typeof notificationId === "string" && UUID.test(notificationId)) {
        void markNotificationsRead(
          { space: (target?.isClient ?? context.isClient) ? "client" : "company" },
          { ids: [notificationId] },
        ).catch(() => undefined);
      }

      void Notifications.clearLastNotificationResponseAsync().catch(() => undefined);
      if (!target) return;

      if (!target.switchTo) {
        router.push(target.route as Href);
        return;
      }

      try {
        if (target.switchTo.kind === "company") await context.switchToCompany(target.switchTo.companyId);
        else await context.switchToClientSpace();
        if (active) setPending({ ...target, createdAt: Date.now() });
      } catch {
        // Ya no tiene acceso a ese espacio: se queda donde está.
      }
    }

    // En arranque en frío el navegador puede no estar montado todavía.
    const coldStart = setTimeout(() => {
      Notifications.getLastNotificationResponseAsync()
        .then((response) => open(response))
        .catch(() => undefined); // Sin módulo nativo (p. ej. Expo Go).
    }, 350);

    const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
      void open(response);
    });
    return () => {
      active = false;
      clearTimeout(coldStart);
      subscription.remove();
    };
  }, [enabled]);

  // Tras cambiar de espacio, abre la pantalla cuando el estado ya coincide.
  useEffect(() => {
    if (!pending || !enabled) return;
    if (Date.now() - pending.createdAt > PENDING_TIMEOUT_MS) {
      setPending(null);
      return;
    }
    const ready = pending.isClient
      ? isClient
      : !isClient && activeCompanyId === pending.companyId;
    if (!ready) return;

    setPending(null);
    router.replace((pending.isClient ? "/(client-tabs)" : "/(tabs)") as Href);
    setTimeout(() => router.push(pending.route as Href), 0);
  }, [pending, enabled, isClient, activeCompanyId]);
}
