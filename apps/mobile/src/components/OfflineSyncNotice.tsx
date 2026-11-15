import { useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { View } from "react-native";

import { LeuretFeedback } from "@/components/LeuretFeedback";
import { confirmAction } from "@/utils/alert";
import {
  discardBlockedOfflineActions,
  getOfflineQueueSummary,
  processOfflineSyncQueue,
  retryBlockedOfflineActions,
  type OfflineQueueSummary,
} from "@/services/offline-sync-service";

/**
 * Avisa de los cambios hechos sin conexión (tareas, avance) que aún no están
 * en el servidor, y de los que el servidor rechazó. Sin pendientes no muestra nada.
 */
export function OfflineSyncNotice({ onSynced }: { onSynced?: () => void }) {
  const [summary, setSummary] = useState<OfflineQueueSummary | null>(null);
  const [syncing, setSyncing] = useState(false);

  const refresh = useCallback(async () => {
    setSummary(await getOfflineQueueSummary());
  }, []);

  useFocusEffect(useCallback(() => {
    void refresh();
  }, [refresh]));

  async function syncNow(retryBlocked = false) {
    if (syncing) return;
    setSyncing(true);
    try {
      if (retryBlocked) await retryBlockedOfflineActions();
      const result = await processOfflineSyncQueue();
      if (result.succeeded > 0) onSynced?.();
    } finally {
      setSyncing(false);
      await refresh();
    }
  }

  async function discard() {
    const ok = await confirmAction({
      title: "Descartar cambios",
      message: "Los cambios que el servidor rechazó se borrarán de este dispositivo.",
      confirmText: "Descartar",
      destructive: true,
    });
    if (!ok) return;
    await discardBlockedOfflineActions();
    await refresh();
  }

  if (!summary || (summary.pending === 0 && summary.blocked === 0)) return null;

  return (
    <View style={{ gap: 8 }}>
      {summary.pending > 0 ? (
        <LeuretFeedback
          tone="warning"
          title={`${summary.pending} cambio${summary.pending === 1 ? "" : "s"} sin enviar`}
          message="Se hicieron sin conexión y se guardarán en el servidor al recuperar la señal."
          actionLabel={syncing ? "Enviando…" : "Enviar ahora"}
          onAction={() => void syncNow()}
          compact
        />
      ) : null}
      {summary.blocked > 0 ? (
        <LeuretFeedback
          tone="error"
          title={`${summary.blocked} cambio${summary.blocked === 1 ? "" : "s"} no se pudo guardar`}
          message={summary.lastError ?? "El servidor no aceptó el cambio."}
          actionLabel={syncing ? "Reintentando…" : "Reintentar"}
          onAction={() => void syncNow(true)}
          compact
        />
      ) : null}
      {summary.blocked > 0 ? (
        <LeuretFeedback tone="info" title="¿Ya no lo necesitas?" actionLabel="Descartar" onAction={() => void discard()} compact />
      ) : null}
    </View>
  );
}
