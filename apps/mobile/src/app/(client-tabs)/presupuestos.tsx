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
import { listBudgetsForClient, type ClientBudgetSummary } from "@/services/budget-service";
import { clientBudgetState, matchesSearch, relativeDayLabel, todayKey } from "@/utils/client-portal";
import { formatMoney, formatShortDate } from "@/utils/format";

type Filter = "all" | "pending" | "approved" | "closed";

export default function ClientBudgetsScreen() {
  const { profile } = useAuth();
  const profileId = profile?.id;
  const [budgets, setBudgets] = useState<ClientBudgetSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [search, setSearch] = useState("");

  const loadBudgets = useCallback(
    async (showRefresh = false) => {
      if (!profileId) return;
      if (showRefresh) setRefreshing(true);

      const result = await listBudgetsForClient(profileId);
      setError(result.error);
      if (!result.error) setBudgets(result.budgets);

      setLoading(false);
      setRefreshing(false);
    },
    [profileId],
  );

  useFocusEffect(
    useCallback(() => {
      void loadBudgets();
    }, [loadBudgets]),
  );

  const today = todayKey();
  const withState = useMemo(
    () => budgets.map((budget) => ({ budget, state: clientBudgetState(budget.status, budget.valid_until, today) })),
    [budgets, today],
  );

  const counts = useMemo(() => {
    const pending = withState.filter(({ state }) => state.key === "pending").length;
    const approved = withState.filter(({ state }) => state.key === "approved").length;
    return { all: withState.length, pending, approved, closed: withState.length - pending - approved };
  }, [withState]);

  const visible = useMemo(
    () =>
      withState
        .filter(({ state }) =>
          filter === "all"
            ? true
            : filter === "closed"
              ? state.key !== "pending" && state.key !== "approved"
              : state.key === filter,
        )
        .filter(({ budget }) =>
          matchesSearch(search, budget.budget_number, budget.title, budget.project?.name, budget.company?.name),
        )
        // Lo que espera respuesta, primero.
        .sort((a, b) => Number(b.state.key === "pending") - Number(a.state.key === "pending")),
    [withState, filter, search],
  );

  if (loading) return <LeuretLoading message="Cargando presupuestos…" fullScreen />;

  return (
    <SafeAreaView style={styles.safeArea} edges={["top"]}>
      <FlatList
        data={visible}
        keyExtractor={(item) => item.budget.id}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void loadBudgets(true)} />}
        ListHeaderComponent={
          <View>
            <Text style={styles.title}>Presupuestos</Text>
            <Text style={styles.subtitle}>
              {counts.pending > 0
                ? `${counts.pending} esperando tu respuesta`
                : `${counts.all} presupuesto${counts.all === 1 ? "" : "s"} recibido${counts.all === 1 ? "" : "s"}`}
            </Text>

            {error ? (
              <LeuretFeedback
                tone="error"
                title="No pudimos cargar tus presupuestos"
                message={error}
                actionLabel="Reintentar"
                onAction={() => void loadBudgets(true)}
                style={styles.feedback}
              />
            ) : null}

            {budgets.length > 0 ? (
              <FilterBar
                value={filter}
                onChange={setFilter}
                search={search}
                onSearchChange={setSearch}
                searchPlaceholder="Buscar por número, proyecto o contratista"
                options={[
                  { value: "all", label: "Todos", count: counts.all },
                  { value: "pending", label: "Por responder", count: counts.pending },
                  { value: "approved", label: "Aprobados", count: counts.approved },
                  { value: "closed", label: "Otros", count: counts.closed },
                ]}
              />
            ) : null}
          </View>
        }
        ListEmptyComponent={
          error ? null : budgets.length === 0 ? (
            <LeuretEmptyState
              icon="document-text-outline"
              title="Aún no tienes presupuestos"
              description="Cuando tu contratista te envíe una cotización, la verás aquí y te llegará un aviso."
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
        renderItem={({ item: { budget, state } }) => (
          <MotionPressable
            onPress={() =>
              router.push({ pathname: "/cliente-presupuestos/[id]", params: { id: budget.id } } as Href)
            }
            pressedScale={0.985}
            accessibilityRole="button"
            accessibilityLabel={`Presupuesto ${budget.budget_number}, ${state.label}`}
            style={[styles.card, state.key === "pending" && styles.cardPending]}
          >
            <View style={styles.cardHeader}>
              <View style={styles.cardInfo}>
                <Text style={styles.code}>{budget.budget_number}</Text>
                <Text style={styles.cardTitle} numberOfLines={2}>
                  {budget.title}
                </Text>
                <Text style={styles.meta} numberOfLines={1}>
                  {[budget.project?.name, budget.company?.name].filter(Boolean).join(" · ") || "Sin proyecto"}
                </Text>
              </View>
              <StatusPill label={state.label} tone={state.tone} />
            </View>

            <View style={styles.divider} />

            <View style={styles.cardFooter}>
              <View style={styles.footerLeft}>
                <Ionicons name="calendar-outline" size={14} color={colors.textMuted} />
                <Text style={styles.footerText}>
                  {state.key === "pending" && budget.valid_until
                    ? `Vigente hasta ${formatShortDate(budget.valid_until)} · ${relativeDayLabel(budget.valid_until.slice(0, 10), today)}`
                    : formatShortDate(budget.created_at)}
                </Text>
              </View>
              <Text style={styles.total}>
                {formatMoney(budget.total || 0, budget.currency_code || budget.company?.currency_code || undefined)}
              </Text>
            </View>
          </MotionPressable>
        )}
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
  cardPending: { borderColor: colors.accent, borderLeftWidth: 4 },
  cardHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", gap: 10 },
  cardInfo: { flex: 1 },
  code: { color: colors.accent, fontSize: 12, fontWeight: "900" },
  cardTitle: { marginTop: 4, color: colors.text, fontSize: 15, fontWeight: "800" },
  meta: { marginTop: 4, color: colors.textSecondary, fontSize: 12, fontWeight: "600" },
  divider: { height: 1, backgroundColor: colors.divider, marginVertical: 12 },
  cardFooter: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 10 },
  footerLeft: { flex: 1, flexDirection: "row", alignItems: "center", gap: 6 },
  footerText: { color: colors.textSecondary, fontSize: 12, fontWeight: "600" },
  total: { fontSize: 16, fontWeight: "900", color: colors.text },
});
