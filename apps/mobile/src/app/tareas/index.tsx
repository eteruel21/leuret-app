import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Platform,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from "react-native";
import Animated, { FadeInUp } from "react-native-reanimated";

import { LeuretEmptyState } from "@/components/LeuretEmptyState";
import { LeuretLoading } from "@/components/LeuretLoading";
import { colors, radius, shadows } from "@/constants/theme";
import { useCompany } from "@/contexts/CompanyContext";
import {
  listMyTasks,
  updateProjectTask,
  type MyTask,
  type ProjectTaskPriority,
  type ProjectTaskStatus,
} from "@/services/task-service";
import { uploadProjectPhoto } from "@/services/photo-service";
import { showAlert } from "@/utils/alert";
import { prepareProjectPhoto, type ProjectPhotoSource } from "@/utils/project-photo-picker";
import { formatShortDate } from "@/utils/format";

type Filter = "open" | "all";

const STATUS_LABELS: Record<ProjectTaskStatus, string> = {
  todo: "Por hacer",
  in_progress: "En curso",
  review: "En revisión",
  completed: "Completada",
};

const PRIORITY_LABELS: Record<ProjectTaskPriority, string> = {
  low: "Baja",
  medium: "Media",
  high: "Alta",
  urgent: "Urgente",
};

/** Siguiente paso natural para el equipo de campo. */
function nextAction(status: ProjectTaskStatus): { label: string; status: ProjectTaskStatus } {
  if (status === "todo") return { label: "Empezar", status: "in_progress" };
  if (status === "completed") return { label: "Reabrir", status: "in_progress" };
  return { label: "Marcar completada", status: "completed" };
}

function isOverdue(task: MyTask): boolean {
  if (!task.due_date || task.status === "completed") return false;
  const due = new Date(task.due_date);
  return !Number.isNaN(due.getTime()) && due.getTime() < Date.now();
}

export default function MyTasksScreen() {
  const { activeCompany } = useCompany();
  const companyId = activeCompany?.id;

  const [filter, setFilter] = useState<Filter>("open");
  const [tasks, setTasks] = useState<MyTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [offline, setOffline] = useState(false);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [uploadingId, setUploadingId] = useState<string | null>(null);
  // Fotos enviadas en esta sesión, por tarea, para dar confirmación visible.
  const [sentPhotos, setSentPhotos] = useState<Record<string, number>>({});

  const loadTasks = useCallback(
    async (isRefresh = false) => {
      if (!companyId) return;
      if (isRefresh) setRefreshing(true);

      const result = await listMyTasks(companyId, filter);
      setTasks(result.tasks);
      setOffline(result.fromCache);
      setLoading(false);
      setRefreshing(false);
    },
    [companyId, filter]
  );

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      void loadTasks();
    }, [loadTasks])
  );

  const uploadPhoto = async (task: MyTask, source: ProjectPhotoSource) => {
    if (!companyId) return;
    try {
      setUploadingId(task.id);
      const prepared = await prepareProjectPhoto(source);
      if (!prepared) return;

      await uploadProjectPhoto(companyId, task.project_id, {
        fileName: prepared.fileName,
        fileData: prepared.fileData,
        mimeType: prepared.mimeType,
        caption: `Avance: ${task.title}`,
        taskId: task.id,
        isPrivate: true,
      });

      setSentPhotos((current) => ({ ...current, [task.id]: (current[task.id] ?? 0) + 1 }));
      showAlert("Foto enviada", `Quedó guardada en ${task.project.name}, vinculada a esta tarea.`);
    } catch (error) {
      showAlert(
        "No se pudo subir la foto",
        error instanceof Error ? error.message : "Revisa tu conexión e inténtalo de nuevo."
      );
    } finally {
      setUploadingId(null);
    }
  };

  /** En el teléfono pregunta si usar la cámara o la galería; en la web abre la galería. */
  const askPhoto = (task: MyTask, title = "Foto de avance", message = "¿De dónde quieres tomar la foto?") => {
    if (Platform.OS === "web") {
      void uploadPhoto(task, "library");
      return;
    }
    showAlert(title, message, [
      { text: "Cámara", onPress: () => void uploadPhoto(task, "camera") },
      { text: "Galería", onPress: () => void uploadPhoto(task, "library") },
      { text: "Ahora no", style: "cancel" },
    ]);
  };

  const handleAdvance = async (task: MyTask) => {
    if (!companyId) return;
    const action = nextAction(task.status);
    setUpdatingId(task.id);

    const updated = await updateProjectTask(companyId, task.project_id, task.id, {
      status: action.status,
    });

    setUpdatingId(null);

    if (!updated) {
      showAlert(
        "No se pudo actualizar",
        "Revisa tu conexión e inténtalo de nuevo."
      );
      return;
    }

    setTasks((current) => {
      const next = current.map((item) =>
        item.id === task.id ? { ...item, ...updated, project: item.project } : item
      );
      // En "Pendientes" la tarea completada desaparece de la lista.
      return filter === "open"
        ? next.filter((item) => item.status !== "completed")
        : next;
    });

    // Al terminar una tarea, invitar a dejar evidencia del trabajo.
    if (action.status === "completed" && Platform.OS !== "web") {
      askPhoto(task, "¡Tarea completada!", "¿Quieres agregar una foto del trabajo terminado?");
    }
  };

  if (!companyId || loading) {
    return <LeuretLoading fullScreen message="Cargando tus tareas…" />;
  }

  return (
    <View style={styles.container}>
      <View style={styles.filters}>
        {(["open", "all"] as const).map((value) => (
          <Pressable
            key={value}
            onPress={() => setFilter(value)}
            accessibilityRole="button"
            accessibilityState={{ selected: filter === value }}
            style={[styles.filterChip, filter === value && styles.filterChipActive]}
          >
            <Text style={[styles.filterText, filter === value && styles.filterTextActive]}>
              {value === "open" ? "Pendientes" : "Todas"}
            </Text>
          </Pressable>
        ))}
      </View>

      {offline ? (
        <View style={styles.offlineBanner}>
          <Ionicons name="cloud-offline-outline" size={16} color={colors.textSecondary} />
          <Text style={styles.offlineText}>
            Sin conexión: mostrando la última copia guardada.
          </Text>
        </View>
      ) : null}

      <FlatList
        data={tasks}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => void loadTasks(true)} />
        }
        ListEmptyComponent={
          <LeuretEmptyState
            icon="checkmark-done-outline"
            title={filter === "open" ? "Nada pendiente" : "Sin tareas asignadas"}
            description={
              filter === "open"
                ? "No tienes tareas abiertas. Cuando te asignen una, aparecerá aquí."
                : "Todavía no te han asignado tareas en esta empresa."
            }
          />
        }
        renderItem={({ item, index }) => {
          const action = nextAction(item.status);
          const overdue = isOverdue(item);
          const busy = updatingId === item.id;
          const uploading = uploadingId === item.id;

          return (
            <Animated.View
              entering={FadeInUp.delay(Math.min(index, 8) * 40).duration(300)}
              style={styles.card}
            >
              <View style={styles.cardTop}>
                <Text style={styles.project} numberOfLines={1}>
                  {item.project.project_code
                    ? `${item.project.project_code} · ${item.project.name}`
                    : item.project.name}
                </Text>
                <View style={[styles.badge, item.priority === "urgent" || item.priority === "high" ? styles.badgeHigh : null]}>
                  <Text style={styles.badgeText}>{PRIORITY_LABELS[item.priority]}</Text>
                </View>
              </View>

              <Text style={[styles.title, item.status === "completed" && styles.titleDone]}>
                {item.title}
              </Text>

              {item.description ? (
                <Text style={styles.description} numberOfLines={3}>
                  {item.description}
                </Text>
              ) : null}

              <View style={styles.meta}>
                <Text style={styles.metaText}>{STATUS_LABELS[item.status]}</Text>
                {item.due_date ? (
                  <Text style={[styles.metaText, overdue && styles.overdue]}>
                    {overdue ? "Vencida · " : "Vence "}
                    {formatShortDate(item.due_date)}
                  </Text>
                ) : null}
                {item.is_pending_sync ? (
                  <Text style={styles.metaText}>Pendiente de sincronizar</Text>
                ) : null}
              </View>

              <View style={styles.actions}>
                <Pressable
                  onPress={() => void handleAdvance(item)}
                  disabled={busy}
                  accessibilityRole="button"
                  style={({ pressed }) => [
                    styles.actionButton,
                    item.status === "completed" && styles.actionButtonSecondary,
                    (pressed || busy) && styles.pressed,
                  ]}
                >
                  <Ionicons
                    name={action.status === "completed" ? "checkmark-circle-outline" : "play-circle-outline"}
                    size={20}
                    color={item.status === "completed" ? colors.primary : colors.textLight}
                  />
                  <Text
                    style={[
                      styles.actionText,
                      item.status === "completed" && styles.actionTextSecondary,
                    ]}
                  >
                    {busy ? "Guardando…" : action.label}
                  </Text>
                </Pressable>

                <Pressable
                  onPress={() => askPhoto(item)}
                  disabled={uploading}
                  accessibilityRole="button"
                  accessibilityLabel="Agregar foto de avance"
                  style={({ pressed }) => [styles.photoButton, (pressed || uploading) && styles.pressed]}
                >
                  {uploading ? (
                    <ActivityIndicator color={colors.primary} />
                  ) : (
                    <Ionicons name="camera-outline" size={22} color={colors.primary} />
                  )}
                </Pressable>
              </View>

              {sentPhotos[item.id] ? (
                <View style={styles.sentRow}>
                  <Ionicons name="images-outline" size={14} color={colors.success} />
                  <Text style={styles.sentText}>
                    {sentPhotos[item.id] === 1 ? "1 foto enviada" : `${sentPhotos[item.id]} fotos enviadas`}
                  </Text>
                </View>
              ) : null}
            </Animated.View>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  filters: {
    flexDirection: "row",
    gap: 8,
    paddingHorizontal: 20,
    paddingTop: 16,
  },
  filterChip: {
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  filterChipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  filterText: {
    color: colors.textSecondary,
    fontSize: 13,
    fontWeight: "800",
  },
  filterTextActive: {
    color: colors.textLight,
  },
  offlineBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginHorizontal: 20,
    marginTop: 12,
    padding: 10,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceAlt,
  },
  offlineText: {
    flex: 1,
    color: colors.textSecondary,
    fontSize: 12,
  },
  list: {
    padding: 20,
    gap: 12,
    flexGrow: 1,
  },
  card: {
    padding: 16,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    ...shadows.soft,
  },
  cardTop: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  project: {
    flex: 1,
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: "800",
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radius.full,
    backgroundColor: colors.steelSoft,
  },
  badgeHigh: {
    backgroundColor: colors.accentSoft,
  },
  badgeText: {
    color: colors.text,
    fontSize: 11,
    fontWeight: "800",
  },
  title: {
    marginTop: 8,
    color: colors.text,
    fontSize: 17,
    fontWeight: "900",
  },
  titleDone: {
    color: colors.textSecondary,
    textDecorationLine: "line-through",
  },
  description: {
    marginTop: 6,
    color: colors.textSecondary,
    fontSize: 13,
    lineHeight: 19,
  },
  meta: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
    marginTop: 10,
  },
  metaText: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: "700",
  },
  overdue: {
    color: colors.danger,
  },
  actions: {
    flexDirection: "row",
    gap: 10,
    marginTop: 14,
  },
  photoButton: {
    width: 54,
    minHeight: 50,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.steelSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  sentRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 8,
  },
  sentText: {
    color: colors.success,
    fontSize: 12,
    fontWeight: "800",
  },
  actionButton: {
    flex: 1,
    minHeight: 50,
    borderRadius: radius.lg,
    backgroundColor: colors.primary,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  actionButtonSecondary: {
    backgroundColor: colors.steelSoft,
  },
  actionText: {
    color: colors.textLight,
    fontSize: 15,
    fontWeight: "900",
  },
  actionTextSecondary: {
    color: colors.primary,
  },
  pressed: {
    opacity: 0.75,
  },
});
