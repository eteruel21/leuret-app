import { useEffect } from "react";
import { AppState } from "react-native";

import { processOfflineSyncQueue } from "@/services/offline-sync-service";
import { flushPendingUserSettings } from "@/services/user-settings-service";

const RETRY_INTERVAL_MS = 60_000;

/**
 * Envía al servidor lo que quedó guardado solo en el dispositivo (cambios sin
 * conexión y ajustes de calculadoras): al entrar, al volver a la app y cada
 * minuto mientras está abierta. Antes la cola solo se procesaba al iniciar.
 */
export function useBackgroundSync(enabled: boolean, userId: string | null) {
  useEffect(() => {
    if (!enabled) return;

    function sync() {
      void processOfflineSyncQueue().catch(() => undefined);
      void flushPendingUserSettings().catch(() => undefined);
    }

    sync();
    const appState = AppState.addEventListener("change", (state) => {
      if (state === "active") sync();
    });
    const interval = setInterval(() => {
      if (AppState.currentState === "active") sync();
    }, RETRY_INTERVAL_MS);

    return () => {
      appState.remove();
      clearInterval(interval);
    };
  }, [enabled, userId]);
}
