import * as Notifications from "expo-notifications";
import { type Href, router } from "expo-router";
import { useEffect, useRef } from "react";
import { Platform } from "react-native";

import { notificationRoute } from "@/utils/client-portal";

/**
 * Lleva a la pantalla del aviso cuando se toca una notificación push:
 * con la app abierta (listener) y al abrirla desde el aviso (última respuesta).
 * Cada aviso se procesa una sola vez.
 */
export function useNotificationNavigation({ enabled, isClient }: { enabled: boolean; isClient: boolean }) {
  const handled = useRef(new Set<string>());

  useEffect(() => {
    if (!enabled || Platform.OS === "web") return;

    function open(response: Notifications.NotificationResponse | null | undefined) {
      if (!response) return;
      const key = response.notification.request.identifier;
      if (handled.current.has(key)) return;
      handled.current.add(key);

      const data = response.notification.request.content.data as Record<string, unknown> | undefined;
      const target = notificationRoute(data, isClient);
      if (target) router.push(target as Href);
    }

    // En arranque en frío el navegador puede no estar montado todavía.
    const coldStart = setTimeout(() => {
      try {
        open(Notifications.getLastNotificationResponse());
      } catch {
        // Sin módulo nativo (p. ej. Expo Go): solo se pierde el arranque en frío.
      }
    }, 350);

    const subscription = Notifications.addNotificationResponseReceivedListener(open);
    return () => {
      clearTimeout(coldStart);
      subscription.remove();
    };
  }, [enabled, isClient]);
}
