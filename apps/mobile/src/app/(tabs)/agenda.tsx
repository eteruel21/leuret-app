import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useCallback, useMemo } from "react";
import {
  Alert,
  Pressable,
  SectionList,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { LeuretFeedback } from "@/components/LeuretFeedback";
import { LeuretLoading } from "@/components/LeuretLoading";
import { LeuretEmptyState } from "@/components/LeuretEmptyState";
import { MotionPressable } from "@/components/MotionPressable";

import { colors, radius, shadows, typography } from "@/constants/theme";
import { useFocusedResource } from "@/hooks/useFocusedResource";
import { useCompany } from "@/contexts/CompanyContext";
import { formatDate } from "@/utils/format";
import {
  getAppointments,
  type Appointment,
  type AppointmentStatus,
  type AppointmentType,
} from "@/utils/appointment-storage";
import { deleteRemoteActivity } from "@/services/activity-service";
import { cancelScheduledNotification } from "@/utils/appointment-notifications";

const statusLabels: Record<AppointmentStatus, string> = {
  scheduled: "Programada",
  confirmed: "Confirmada",
  completed: "Completada",
  cancelled: "Cancelada",
};

const typeLabels: Record<AppointmentType, string> = {
  visit: "Visita técnica",
  meeting: "Reunión",
  work: "Trabajo",
  payment: "Cobro",
  other: "Otro",
};

export default function AgendaScreen() {
  const { activeCompany, activeMembership } = useCompany();
  const companyId = activeCompany?.id;
  const scope = companyId && activeMembership ? `${companyId}:${activeMembership.role}` : null;
  const loadAgenda = useCallback(async () => ({ data: await getAppointments(companyId!) }), [companyId]);
  const { data: appointments, loading, error, refreshing, reload } = useFocusedResource(scope, loadAgenda, 0);

  const sections = useMemo(() => {
    const groups = new Map<string, Appointment[]>();
    for (const item of appointments ?? []) {
      const group = groups.get(item.date);
      if (group) group.push(item);
      else groups.set(item.date, [item]);
    }
    return Array.from(groups, ([date, data]) => ({ key: date, date, data }));
  }, [appointments]);

  function openAppointment(id: string) {
    router.push({
      pathname: "/agenda/[id]",
      params: { id },
    });
  }

  async function removeAppointment(item: Appointment) {
    if (!activeCompany?.id) { Alert.alert("Empresa requerida", "Selecciona una empresa activa."); return; }
    try {
      await deleteRemoteActivity(activeCompany.id, item.id);
      try { await cancelScheduledNotification(item.notificationId); } catch {}
      await reload();
    } catch (error) {
      Alert.alert("No se pudo eliminar", error instanceof Error ? error.message : "Inténtalo nuevamente.");
    }
  }

  function confirmDelete(item: Appointment) {
    Alert.alert(
      "Eliminar actividad",
      `¿Deseas eliminar “${item.title}”?`,
      [
        { text: "Cancelar", style: "cancel" },
        {
          text: "Eliminar",
          style: "destructive",
          onPress: () => void removeAppointment(item),
        },
      ],
    );
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={["left", "right"]}>
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Agenda</Text>
          {appointments ? (
            <Text style={styles.subtitle}>{appointments.length} {appointments.length === 1 ? "actividad" : "actividades"}</Text>
          ) : null}
        </View>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Agregar actividad"
          onPress={() => openAppointment("nuevo")}
          style={({ pressed }) => [
            styles.addButton,
            pressed && styles.pressed,
          ]}
        >
          <Ionicons
            name="calendar-outline"
            size={22}
            color={colors.textLight}
          />
        </Pressable>
      </View>

      <SectionList
        sections={sections}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.content}
        refreshing={refreshing && !loading}
        onRefresh={() => void reload()}
        stickySectionHeadersEnabled={false}
        ListHeaderComponent={error ? (
          <LeuretFeedback
            tone="error"
            title="No pudimos actualizar la agenda"
            message={appointments ? "Se muestran las últimas actividades cargadas. " + error : error}
            actionLabel="Reintentar"
            onAction={() => void reload()}
            style={styles.emptyStateSpacing}
          />
        ) : null}
        ListEmptyComponent={loading ? (
          <LeuretLoading message="Cargando agenda…" compact />
        ) : !activeCompany ? (
          <LeuretEmptyState
            icon="business-outline"
            title="Selecciona una empresa"
            description="Selecciona una empresa para ver sus actividades guardadas."
            style={styles.emptyStateSpacing}
          />
        ) : appointments?.length === 0 ? (
          <LeuretEmptyState
            icon="calendar-clear-outline"
            title="No hay actividades programadas"
            description="Registra citas, visitas técnicas, cobros y trabajos."
            actionLabel="Agregar actividad"
            actionIcon="add"
            onAction={() => openAppointment("nuevo")}
            style={styles.emptyStateSpacing}
          />
        ) : null}
        renderSectionHeader={({ section }) => (
          <Text style={styles.dayTitle}>{formatDate(section.date, activeCompany?.timezone || undefined)}</Text>
        )}
        renderItem={({ item }) => (
          <MotionPressable
            accessibilityRole="button"
            onPress={() => openAppointment(item.id)}
            pressedScale={0.985}
            style={styles.card}
          >
            <View style={styles.timeBlock}>
              <Text style={styles.timeText}>
                {item.time}
              </Text>
              {item.endTime && item.endTime !== item.time ? (
                <Text style={styles.endTimeText}>
                  {item.endTime}
                </Text>
              ) : null}
            </View>

            <View style={styles.cardBody}>
              <Text style={styles.cardTitle}>
                {item.title}
              </Text>

              <Text style={styles.cardMeta}>
                {typeLabels[item.type]}
                {item.clientName
                  ? ` · ${item.clientName}`
                  : ""}
              </Text>

              {item.address ? (
                <Text
                  style={styles.cardAddress}
                  numberOfLines={1}
                >
                  {item.address}
                </Text>
              ) : null}

              <View style={styles.statusBadge}>
                <Text style={styles.statusText}>
                  {statusLabels[item.status]}
                </Text>
              </View>
            </View>

            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Eliminar ${item.title}`}
              onPress={(event) => {
                event.stopPropagation();
                confirmDelete(item);
              }}
              style={styles.deleteButton}
            >
              <Ionicons
                name="trash-outline"
                size={17}
                color={colors.danger}
              />
            </Pressable>
          </MotionPressable>
        )}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.surfaceDark,
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 30,
    backgroundColor: colors.surfaceDark,
    borderBottomLeftRadius: 28,
    borderBottomRightRadius: 28,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  title: {
    marginTop: 6,
    color: colors.textLight,
    ...typography.title,
  },
  subtitle: {
    marginTop: 5,
    color: colors.textLightMuted,
    fontSize: 12,
  },
  addButton: {
    width: 48,
    height: 48,
    borderRadius: 15,
    backgroundColor: colors.accent,
    alignItems: "center",
    justifyContent: "center",
    ...shadows.glow,
  },
  content: {
    flexGrow: 1,
    paddingHorizontal: 20,
    paddingTop: 24,
    paddingBottom: 40,
    backgroundColor: colors.background,
  },
  dayTitle: {
    marginBottom: 11,
    color: colors.accent,
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 1.1,
    textTransform: "uppercase",
  },
  card: {
    minHeight: 108,
    marginBottom: 12,
    padding: 15,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    flexDirection: "row",
    alignItems: "flex-start",
    ...shadows.soft,
  },
  timeBlock: {
    width: 62,
    paddingRight: 12,
    borderRightWidth: 1,
    borderRightColor: colors.divider,
  },
  timeText: {
    color: colors.primary,
    fontSize: 15,
    fontWeight: "900",
  },
  endTimeText: {
    marginTop: 3,
    color: colors.textSecondary,
    fontSize: 11,
  },
  cardBody: {
    flex: 1,
    paddingHorizontal: 12,
  },
  cardTitle: {
    color: colors.text,
    fontSize: 15,
    fontWeight: "900",
  },
  cardMeta: {
    marginTop: 4,
    color: colors.textSecondary,
    fontSize: 12,
  },
  cardAddress: {
    marginTop: 5,
    color: colors.textSecondary,
    fontSize: 11,
  },
  statusBadge: {
    alignSelf: "flex-start",
    marginTop: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 20,
    backgroundColor: colors.sandSoft,
  },
  statusText: {
    color: colors.primary,
    fontSize: 10,
    fontWeight: "800",
  },
  deleteButton: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: colors.dangerSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyStateSpacing: {
    marginTop: 34,
  },
  pressed: {
    opacity: 0.75,
    transform: [{ scale: 0.99 }],
  },
});
