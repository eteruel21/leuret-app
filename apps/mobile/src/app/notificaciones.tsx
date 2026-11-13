import { Ionicons } from "@expo/vector-icons";
import * as Notifications from "expo-notifications";
import { type Href, router, useFocusEffect } from "expo-router";
import { useCallback, useRef, useState } from "react";
import { AppState, Platform, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";

import { LeuretEmptyState } from "@/components/LeuretEmptyState";
import { LeuretFeedback } from "@/components/LeuretFeedback";
import { LeuretLoading } from "@/components/LeuretLoading";
import { colors, radius } from "@/constants/theme";
import { useCompany } from "@/contexts/CompanyContext";
import { listClientConnections } from "@/services/client-connections-service";
import { getJobRequestInbox } from "@/services/job-request-service";
import type { JobRequestInbox, JobRequestInboxConversation } from "@/types/job-request";
import { timeAgo } from "@/utils/job-requests";
import { badgeLabel, inboxConversationRoute, inboxPreview, refreshesBell } from "@/utils/notifications-inbox";

function messageFor(error: unknown) {
  return error instanceof Error ? error.message : "No pudimos cargar las notificaciones.";
}

export default function NotificationsScreen() {
  const { activeCompany, companies, setActiveCompanyId } = useCompany();
  const space = activeCompany ? "company" : "client";
  const [inbox, setInbox] = useState<JobRequestInbox | null>(null);
  const [pendingConnections, setPendingConnections] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [openError, setOpenError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [opening, setOpening] = useState<string | null>(null);
  const requestNumber = useRef(0);

  const load = useCallback(async (showRefresh = false) => {
    const number = ++requestNumber.current;
    if (showRefresh) setRefreshing(true);
    const [inboxResult, connectionResult] = await Promise.allSettled([
      getJobRequestInbox({ limit: 30, space }),
      listClientConnections(true, space),
    ]);
    if (number !== requestNumber.current) return;
    if (inboxResult.status === "fulfilled") {
      setInbox(inboxResult.value);
      setError(null);
    } else {
      setError(messageFor(inboxResult.reason));
    }
    if (connectionResult.status === "fulfilled") {
      setPendingConnections(connectionResult.value.requests.filter((item) => item.incoming).length);
    }
    setRefreshing(false);
  }, [space]);

  useFocusEffect(useCallback(() => {
    void load();
    const interval = setInterval(() => { if (AppState.currentState === "active") void load(); }, 20_000);
    const appState = AppState.addEventListener("change", (state) => { if (state === "active") void load(); });
    const push = Platform.OS === "web" ? null : Notifications.addNotificationReceivedListener((notification) => {
      if (refreshesBell(notification.request.content.data?.type)) void load();
    });
    return () => {
      requestNumber.current += 1;
      clearInterval(interval);
      appState.remove();
      push?.remove();
    };
  }, [load]));

  async function open(conversation: JobRequestInboxConversation) {
    if (opening) return;
    const key = `${conversation.request_id}:${conversation.company_id}`;
    setOpening(key);
    setOpenError(null);
    try {
      // La pantalla de peticiones del contratista usa los permisos de la empresa activa.
      if (conversation.side === "company" && activeCompany?.id !== conversation.company_id) {
        await setActiveCompanyId(conversation.company_id);
      }
      router.push(inboxConversationRoute(conversation) as Href);
    } catch (err) {
      setOpenError(messageFor(err));
    } finally {
      setOpening(null);
    }
  }

  const conversations = inbox?.conversations ?? [];
  const showCompany = companies.length > 1;

  return (
    <ScrollView
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void load(true)} />}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={pendingConnections
          ? `Solicitudes de vinculación, ${pendingConnections} pendiente${pendingConnections === 1 ? "" : "s"}`
          : "Solicitudes de vinculación"}
        style={({ pressed }) => [styles.card, styles.row, pendingConnections > 0 && styles.unreadCard, pressed && styles.pressed]}
        onPress={() => router.push("/solicitudes" as Href)}
      >
        <View style={styles.icon}><Ionicons name="person-add-outline" size={20} color={colors.primary} /></View>
        <View style={styles.body}>
          <Text style={styles.title}>Solicitudes de vinculación</Text>
          <Text style={styles.text}>
            {pendingConnections
              ? `${pendingConnections} pendiente${pendingConnections === 1 ? "" : "s"} de respuesta`
              : "No tienes solicitudes pendientes"}
          </Text>
        </View>
        {pendingConnections > 0 ? <View style={styles.badge}><Text style={styles.badgeText}>{badgeLabel(pendingConnections)}</Text></View> : null}
        <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
      </Pressable>

      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Mensajes</Text>
        {inbox?.unreadMessages ? (
          <Text style={styles.sectionMeta}>
            {inbox.unreadMessages} nuevo{inbox.unreadMessages === 1 ? "" : "s"}
          </Text>
        ) : null}
      </View>

      {openError ? <LeuretFeedback title={openError} tone="error" compact /> : null}
      {error ? (
        <LeuretFeedback title="No pudimos cargar los mensajes" message={error} tone="error"
          actionLabel="Reintentar" onAction={() => void load(true)} />
      ) : null}
      {!inbox && !error ? <LeuretLoading message="Cargando mensajes…" compact /> : null}
      {inbox && conversations.length === 0 ? (
        <LeuretEmptyState icon="chatbubbles-outline" title="Aún no hay mensajes"
          description="Cuando te escriban sobre una petición de trabajo, lo verás aquí." compact />
      ) : null}

      {conversations.map((conversation) => {
        const unread = conversation.unread_count > 0;
        const key = `${conversation.request_id}:${conversation.company_id}`;
        return (
          <Pressable
            key={key}
            accessibilityRole="button"
            accessibilityLabel={`Conversación con ${conversation.counterpart_name}${unread ? `, ${conversation.unread_count} sin leer` : ""}`}
            disabled={Boolean(opening)}
            style={({ pressed }) => [styles.card, styles.row, unread && styles.unreadCard, pressed && styles.pressed]}
            onPress={() => void open(conversation)}
          >
            <View style={[styles.icon, unread && styles.iconUnread]}>
              <Ionicons name={unread ? "chatbubble-ellipses" : "chatbubble-ellipses-outline"} size={20}
                color={unread ? colors.accent : colors.primary} />
            </View>
            <View style={styles.body}>
              <View style={styles.topLine}>
                <Text style={[styles.title, styles.flex]} numberOfLines={1}>{conversation.counterpart_name}</Text>
                <Text style={[styles.time, unread && styles.timeUnread]}>{timeAgo(conversation.last_message_at)}</Text>
              </View>
              <Text style={styles.subject} numberOfLines={1}>
                {conversation.title}
                {showCompany && conversation.side === "company" ? ` · ${conversation.company_name}` : ""}
              </Text>
              <View style={styles.topLine}>
                <Text style={[styles.text, styles.flex, unread && styles.previewUnread]} numberOfLines={2}>
                  {inboxPreview(conversation)}
                </Text>
                {unread ? <View style={styles.badge}><Text style={styles.badgeText}>{badgeLabel(conversation.unread_count)}</Text></View> : null}
              </View>
            </View>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: 20, paddingBottom: 40, gap: 12 },
  card: { padding: 14, backgroundColor: colors.surface, borderRadius: radius.lg, borderColor: colors.border, borderWidth: 1 },
  unreadCard: { borderColor: colors.accent, backgroundColor: colors.surfaceRaised },
  pressed: { opacity: 0.78 },
  row: { flexDirection: "row", alignItems: "center", gap: 12 },
  body: { flex: 1, minWidth: 0, gap: 2 },
  flex: { flex: 1, minWidth: 0 },
  topLine: { flexDirection: "row", alignItems: "center", gap: 8 },
  icon: { width: 40, height: 40, borderRadius: radius.md, backgroundColor: colors.primarySoft, alignItems: "center", justifyContent: "center" },
  iconUnread: { backgroundColor: colors.accentSoft },
  title: { color: colors.text, fontSize: 16, fontWeight: "900" },
  subject: { color: colors.text, fontSize: 13, fontWeight: "700" },
  text: { color: colors.textSecondary, lineHeight: 20 },
  previewUnread: { color: colors.text, fontWeight: "700" },
  time: { color: colors.textMuted, fontSize: 12, fontWeight: "700" },
  timeUnread: { color: colors.accent },
  badge: {
    minWidth: 22, height: 22, paddingHorizontal: 6, borderRadius: 11, backgroundColor: colors.accent,
    alignItems: "center", justifyContent: "center",
  },
  badgeText: { color: colors.textInverse, fontSize: 12, fontWeight: "900" },
  sectionHeader: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", marginTop: 8 },
  sectionTitle: { color: colors.text, fontSize: 18, fontWeight: "900" },
  sectionMeta: { color: colors.accent, fontSize: 13, fontWeight: "800" },
});
