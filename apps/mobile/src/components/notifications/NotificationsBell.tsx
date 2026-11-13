import { Ionicons } from "@expo/vector-icons";
import * as Notifications from "expo-notifications";
import { type Href, router, useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { AppState, Platform, Pressable, StyleSheet, Text, View } from "react-native";

import { colors, radius } from "@/constants/theme";
import { useCompany } from "@/contexts/CompanyContext";
import { listClientConnections } from "@/services/client-connections-service";
import { getJobRequestInbox } from "@/services/job-request-service";
import { badgeLabel, bellAccessibilityLabel, bellCount, refreshesBell } from "@/utils/notifications-inbox";

/**
 * Campana del Inicio (cliente y contratista). El globo suma las solicitudes
 * de vinculación recibidas y los mensajes nuevos de las peticiones de trabajo.
 */
export function NotificationsBell() {
  const { activeCompany } = useCompany();
  // Un usuario puede tener espacio de cliente y de contratista: se cuenta solo el activo.
  const space = activeCompany ? "company" : "client";
  const [connections, setConnections] = useState(0);
  const [messages, setMessages] = useState(0);

  useFocusEffect(useCallback(() => {
    let active = true;
    async function refresh() {
      const [connectionResult, inboxResult] = await Promise.allSettled([
        listClientConnections(true, space),
        getJobRequestInbox({ limit: 1, space }),
      ]);
      if (!active) return;
      // Si una consulta falla se conserva el último valor; la pantalla muestra el error.
      if (connectionResult.status === "fulfilled") {
        setConnections(connectionResult.value.requests.filter((item) => item.incoming).length);
      }
      if (inboxResult.status === "fulfilled") setMessages(inboxResult.value.unreadMessages);
    }

    void refresh();
    const interval = setInterval(() => { if (AppState.currentState === "active") void refresh(); }, 30_000);
    const appState = AppState.addEventListener("change", (state) => {
      if (state === "active") void refresh();
    });
    const push = Platform.OS === "web" ? null : Notifications.addNotificationReceivedListener((notification) => {
      if (refreshesBell(notification.request.content.data?.type)) void refresh();
    });

    return () => {
      active = false;
      clearInterval(interval);
      appState.remove();
      push?.remove();
    };
  }, [space]));

  const count = bellCount(connections, messages);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={bellAccessibilityLabel(count)}
      style={({ pressed }) => [styles.button, pressed && { opacity: 0.72 }]}
      onPress={() => router.push("/notificaciones" as Href)}
    >
      <Ionicons name={count ? "notifications" : "notifications-outline"} size={21} color={colors.textLight} />
      {count > 0 ? (
        <View style={styles.badge}>
          <Text style={styles.count}>{badgeLabel(count)}</Text>
        </View>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    width: 44, height: 44, borderRadius: radius.md, alignItems: "center", justifyContent: "center",
    backgroundColor: colors.surfaceDarkRaised,
  },
  badge: {
    position: "absolute", top: 2, right: 2, minWidth: 16, paddingHorizontal: 3, height: 16,
    borderRadius: 8, backgroundColor: colors.accent, alignItems: "center", justifyContent: "center",
  },
  count: { color: colors.textInverse, fontSize: 10, fontWeight: "900" },
});
