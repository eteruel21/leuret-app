import { Ionicons } from "@expo/vector-icons";
import { type Href, router, useFocusEffect } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import { FlatList, RefreshControl, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { FilterBar } from "@/components/client/FilterBar";
import { StatusPill } from "@/components/client/StatusPill";
import { LeuretEmptyState } from "@/components/LeuretEmptyState";
import { LeuretFeedback } from "@/components/LeuretFeedback";
import { LeuretLoading } from "@/components/LeuretLoading";
import { MotionPressable } from "@/components/MotionPressable";
import { colors, radius, shadows } from "@/constants/theme";
import { useAuth } from "@/contexts/AuthContext";
import { listProjectsForClient, type ClientProjectSummary } from "@/services/project-service";
import { getProjectStatusLabel } from "@/types/project";
import { isProjectActive, matchesSearch, projectStatusTone } from "@/utils/client-portal";
import { formatShortDate } from "@/utils/format";

type Filter = "active" | "completed" | "all";

export default function ClientProjectsScreen() {
  const { profile } = useAuth();
  const profileId = profile?.id;
  const [projects, setProjects] = useState<ClientProjectSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("active");
  const [search, setSearch] = useState("");

  const loadProjects = useCallback(
    async (showRefresh = false) => {
      if (!profileId) return;
      if (showRefresh) setRefreshing(true);

      const result = await listProjectsForClient(profileId);
      setError(result.error);
      if (!result.error) setProjects(result.projects);

      setLoading(false);
      setRefreshing(false);
    },
    [profileId],
  );

  useFocusEffect(
    useCallback(() => {
      void loadProjects();
    }, [loadProjects]),
  );

  const counts = useMemo(
    () => ({
      active: projects.filter((project) => isProjectActive(project.status)).length,
      completed: projects.filter((project) => project.status === "completed").length,
      all: projects.length,
    }),
    [projects],
  );

  const visible = useMemo(
    () =>
      projects
        .filter((project) =>
          filter === "all"
            ? true
            : filter === "active"
              ? isProjectActive(project.status)
              : project.status === "completed",
        )
        .filter((project) => matchesSearch(search, project.name, project.project_code, project.company?.name)),
    [projects, filter, search],
  );

  if (loading) return <LeuretLoading message="Cargando proyectos…" fullScreen />;

  return (
    <SafeAreaView style={styles.safeArea} edges={["left", "right"]}>
      <FlatList
        data={visible}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void loadProjects(true)} />}
        ListHeaderComponent={
          <View>
            <Text style={styles.title}>Proyectos</Text>
            <Text style={styles.subtitle}>
              {counts.active} en curso · {counts.completed} terminado{counts.completed === 1 ? "" : "s"}
            </Text>

            {error ? (
              <LeuretFeedback
                tone="error"
                title="No pudimos cargar tus proyectos"
                message={error}
                actionLabel="Reintentar"
                onAction={() => void loadProjects(true)}
                style={styles.feedback}
              />
            ) : null}

            {projects.length > 0 ? (
              <FilterBar
                value={filter}
                onChange={setFilter}
                search={search}
                onSearchChange={setSearch}
                searchPlaceholder="Buscar proyecto o contratista"
                options={[
                  { value: "active", label: "En curso", count: counts.active },
                  { value: "completed", label: "Terminados", count: counts.completed },
                  { value: "all", label: "Todos", count: counts.all },
                ]}
              />
            ) : null}
          </View>
        }
        ListEmptyComponent={
          error ? null : projects.length === 0 ? (
            <LeuretEmptyState
              icon="business-outline"
              title="Aún no tienes proyectos"
              description="Cuando tu contratista registre tu obra, podrás seguir su avance, fotos y visitas desde aquí."
              compact
            />
          ) : (
            <LeuretEmptyState
              icon="search-outline"
              title="Sin resultados"
              description="Prueba con otro filtro o búsqueda."
              actionLabel="Ver todos"
              onAction={() => {
                setFilter("all");
                setSearch("");
              }}
              compact
            />
          )
        }
        renderItem={({ item }) => {
          const progress = Math.max(0, Math.min(100, Number(item.progress_percentage) || 0));
          return (
            <MotionPressable
              onPress={() => router.push({ pathname: "/cliente-proyectos/[id]", params: { id: item.id } } as Href)}
              pressedScale={0.985}
              accessibilityRole="button"
              accessibilityLabel={`Proyecto ${item.name}, avance ${progress} por ciento`}
              style={styles.card}
            >
              <View style={styles.cardHeader}>
                <View style={styles.cardInfo}>
                  <Text style={styles.code}>{item.project_code || "PROYECTO"}</Text>
                  <Text style={styles.name} numberOfLines={2}>
                    {item.name}
                  </Text>
                  {item.company?.name ? (
                    <Text style={styles.contractor} numberOfLines={1}>
                      {item.company.name}
                    </Text>
                  ) : null}
                </View>
                <StatusPill label={getProjectStatusLabel(item.status)} tone={projectStatusTone(item.status)} />
              </View>

              <View style={styles.progressHeader}>
                <Text style={styles.progressLabel}>Avance</Text>
                <Text style={styles.progressValue}>{progress}%</Text>
              </View>
              <View style={styles.progressTrack}>
                <View style={[styles.progressFill, { width: `${progress}%` }]} />
              </View>

              <View style={styles.footer}>
                <Text style={styles.footerText}>
                  {item.estimated_end_date
                    ? `Entrega estimada: ${formatShortDate(item.estimated_end_date)}`
                    : "Sin fecha de entrega"}
                </Text>
                <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
              </View>
            </MotionPressable>
          );
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.background },
  content: { padding: 20, paddingBottom: 40 },
  title: { color: colors.text, fontSize: 28, fontWeight: "900" },
  subtitle: { marginTop: 4, marginBottom: 18, color: colors.textSecondary, fontSize: 14, fontWeight: "700" },
  feedback: { marginBottom: 16 },
  card: {
    padding: 16,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadows.soft,
  },
  cardHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", gap: 10 },
  cardInfo: { flex: 1 },
  code: { color: colors.textSecondary, fontSize: 11, fontWeight: "800", textTransform: "uppercase" },
  name: { marginTop: 4, color: colors.text, fontSize: 16, fontWeight: "800" },
  contractor: { marginTop: 4, color: colors.textSecondary, fontSize: 13, fontWeight: "600" },
  progressHeader: { marginTop: 16, marginBottom: 6, flexDirection: "row", justifyContent: "space-between" },
  progressLabel: { color: colors.textSecondary, fontSize: 12, fontWeight: "700" },
  progressValue: { color: colors.text, fontSize: 12, fontWeight: "900" },
  progressTrack: { height: 8, borderRadius: 4, backgroundColor: colors.steelSoft, overflow: "hidden" },
  progressFill: { height: "100%", borderRadius: 4, backgroundColor: colors.success },
  footer: { marginTop: 12, flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  footerText: { color: colors.textSecondary, fontSize: 12, fontWeight: "600" },
});
