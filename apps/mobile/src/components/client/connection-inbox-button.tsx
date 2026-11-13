import { Ionicons } from "@expo/vector-icons";
import * as Notifications from "expo-notifications";
import { router, useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { AppState, Platform, Pressable, StyleSheet, Text, View } from "react-native";

import { colors, radius } from "@/constants/theme";
import { useCompany } from "@/contexts/CompanyContext";
import { listClientConnections } from "@/services/client-connections-service";

export function ConnectionInboxButton() {
  const { activeCompany } = useCompany();
  const space = activeCompany ? "company" : "client";
  const [count, setCount] = useState(0);

  useFocusEffect(useCallback(() => {
    let active = true;
    async function refresh() {
      try {
        const { requests } = await listClientConnections(true, space);
        if (active) setCount(requests.filter((item) => item.incoming).length);
      } catch {
        // La bandeja muestra el error y permite reintentar.
      }
    }

    void refresh();
    const interval = setInterval(() => { if (AppState.currentState === "active") void refresh(); }, 30_000);
    const appState = AppState.addEventListener("change", (state) => {
      if (state === "active") void refresh();
    });
    const push = Platform.OS === "web" ? null : Notifications.addNotificationReceivedListener((notification) => {
      if (notification.request.content.data?.type === "client_connection.requested") void refresh();
    });

    return () => {
      active = false;
      clearInterval(interval);
      appState.remove();
      push?.remove();
    };
  }, [space]));

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={count ? `Solicitudes de vinculación, ${count} pendiente${count === 1 ? "" : "s"}` : "Solicitudes de vinculación"}
      style={({ pressed }) => [styles.button, pressed && { opacity: 0.72 }]}
      onPress={() => router.push("/solicitudes")}
    >
      <Ionicons name="notifications-outline" size={21} color={colors.textLight} />
      {count > 0 ? (
        <View style={styles.badge}>
          <Text style={styles.count}>{count > 9 ? "9+" : count}</Text>
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
