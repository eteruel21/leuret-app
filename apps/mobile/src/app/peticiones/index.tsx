import { Ionicons } from "@expo/vector-icons";
import { type Href, router, useFocusEffect } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { FilterBar } from "@/components/client/FilterBar";
import { ChoiceChips } from "@/components/job-requests/ChoiceChips";
import { JobRequestCard } from "@/components/job-requests/JobRequestCard";
import { LeuretEmptyState } from "@/components/LeuretEmptyState";
import { LeuretFeedback } from "@/components/LeuretFeedback";
import { LeuretLoading } from "@/components/LeuretLoading";
import { CONTRACTOR_CATEGORIES } from "@/constants/contractor-categories";
import { PANAMA_PROVINCES } from "@/constants/panama-provinces";
import { colors, radius } from "@/constants/theme";
import { useCompany } from "@/contexts/CompanyContext";
import { listJobRequestFeed } from "@/services/job-request-service";
import type { ContractorJobRequestSummary, JobRequestFeedScope } from "@/types/job-request";
import { contractorRequestState } from "@/utils/job-requests";

const PAGE = 20;

const EMPTY: Record<JobRequestFeedScope, { title: string; description: string }> = {
  matching: {
    title: "Sin peticiones para ti por ahora",
    description:
      "Aquí aparecen las de tu categoría (o especialidades) y tu provincia o áreas de trabajo. Revisa «Todas» para ver el resto.",
  },
  all: { title: "No hay peticiones abiertas", description: "Cuando un cliente publique un trabajo, aparecerá aquí." },
  engaged: {
    title: "Aún no has participado",
    description: "Las peticiones en las que preguntes o cotices quedan aquí, aunque se cierren.",
  },
};

export default function JobRequestsFeedScreen() {
  const { activeCompany } = useCompany();
  const companyId = activeCompany?.id;
  const [scope, setScope] = useState<JobRequestFeedScope>("matching");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [category, setCategory] = useState<string | null>(null);
  const [province, setProvince] = useState<string | null>(null);
  const [showFilters, setShowFilters] = useState(false);
  const [requests, setRequests] = useState<ContractorJobRequestSummary[]>([]);
  const [counts, setCounts] = useState<Record<JobRequestFeedScope, number>>({ matching: 0, all: 0, engaged: 0 });
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestToken = useRef(0);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 350);
    return () => clearTimeout(timer);
  }, [search]);

  const load = useCallback(
    async (mode: "replace" | "refresh" | "more" = "replace", offset = 0) => {
      if (!companyId) return;
      const token = ++requestToken.current;
      if (mode === "refresh") setRefreshing(true);
      if (mode === "more") setLoadingMore(true);

      const result = await listJobRequestFeed(companyId, {
        scope,
        search: debouncedSearch,
        category,
        province,
        limit: PAGE,
        offset,
      });
      // Una respuesta vieja (de un filtro anterior) no pisa la nueva.
      if (token !== requestToken.current) return;

      setError(result.error);
      if (result.feed) {
        const page = result.feed.requests;
        setRequests((current) => (mode === "more" ? [...current, ...page.filter((row) => !current.some((c) => c.id === row.id))] : page));
        setCounts(result.feed.counts);
        setHasMore(page.length === PAGE);
      }
      setLoading(false);
      setRefreshing(false);
      setLoadingMore(false);
    },
    [companyId, scope, debouncedSearch, category, province],
  );

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const activeFilters = Number(Boolean(category)) + Number(Boolean(province));

  if (loading && requests.length === 0 && !error) {
    return <LeuretLoading fullScreen message="Buscando peticiones…" />;
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={["left", "right"]}>
      <FlatList
        data={requests}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void load("refresh")} />}
        onEndReachedThreshold={0.4}
        onEndReached={() => {
          if (hasMore && !loadingMore && !refreshing) void load("more", requests.length);
        }}
        ListHeaderComponent={
          <View>
            <Text style={styles.title}>Peticiones de clientes</Text>
            <Text style={styles.subtitle}>
              Pregunta lo que necesites y envía tu presupuesto. Cada petición recibe hasta 5.
            </Text>

            <FilterBar
              value={scope}
              onChange={setScope}
              search={search}
              onSearchChange={setSearch}
              searchPlaceholder="Buscar por trabajo o descripción"
              options={[
                { value: "matching", label: "Para ti", count: counts.matching },
                { value: "all", label: "Todas", count: counts.all },
                { value: "engaged", label: "Mis conversaciones", count: counts.engaged },
              ]}
            />

            <Pressable
              onPress={() => setShowFilters((value) => !value)}
              accessibilityRole="button"
              accessibilityState={{ expanded: showFilters }}
              style={styles.filtersToggle}
            >
              <Ionicons name="options-outline" size={16} color={colors.primary} />
              <Text style={styles.filtersToggleText}>
                Filtros{activeFilters ? ` (${activeFilters})` : ""}
              </Text>
              <Ionicons name={showFilters ? "chevron-up" : "chevron-down"} size={16} color={colors.primary} />
            </Pressable>

            {showFilters ? (
              <View style={styles.filters}>
                <Text style={styles.filterLabel}>Tipo de trabajo</Text>
                <ChoiceChips options={CONTRACTOR_CATEGORIES} value={category} onChange={setCategory} allowClear />
                <Text style={[styles.filterLabel, styles.filterLabelSpaced]}>Provincia</Text>
                <ChoiceChips options={PANAMA_PROVINCES} value={province} onChange={setProvince} allowClear />
                {activeFilters ? (
                  <Pressable
                    onPress={() => {
                      setCategory(null);
                      setProvince(null);
                    }}
                    style={styles.clear}
                  >
                    <Text style={styles.clearText}>Quitar filtros</Text>
                  </Pressable>
                ) : null}
              </View>
            ) : null}

            {error ? (
              <LeuretFeedback
                tone="error"
                title="No pudimos cargar las peticiones"
                message={error}
                actionLabel="Reintentar"
                onAction={() => void load("refresh")}
                style={styles.feedback}
              />
            ) : null}
          </View>
        }
        ListEmptyComponent={
          error ? null : (
            <LeuretEmptyState icon="megaphone-outline" title={EMPTY[scope].title} description={EMPTY[scope].description} compact />
          )
        }
        ListFooterComponent={loadingMore ? <ActivityIndicator color={colors.primary} style={styles.more} /> : null}
        renderItem={({ item }) => (
          <JobRequestCard
            request={item}
            state={contractorRequestState({ effectiveStatus: item.effective_status, quoteStatus: item.quote_status })}
            unread={item.unread_count}
            badge={scope !== "matching" && item.matches_profile ? "Para ti" : null}
            footer={`${item.requester_first_name} · ${item.quotes_sent_count}/${item.max_quotes} presupuestos`}
            onPress={() => router.push({ pathname: "/peticiones/[id]", params: { id: item.id } } as Href)}
          />
        )}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.background },
  content: { padding: 20, paddingBottom: 40 },
  title: { color: colors.text, fontSize: 26, fontWeight: "900" },
  subtitle: { marginTop: 4, marginBottom: 14, color: colors.textSecondary, fontSize: 14, fontWeight: "600", lineHeight: 20 },
  feedback: { marginBottom: 14 },
  filtersToggle: { flexDirection: "row", alignItems: "center", gap: 6, alignSelf: "flex-start", paddingVertical: 8, marginBottom: 6 },
  filtersToggleText: { color: colors.primary, fontSize: 13, fontWeight: "800" },
  filters: {
    padding: 14,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 14,
  },
  filterLabel: { color: colors.textSecondary, fontSize: 12, fontWeight: "900", textTransform: "uppercase", marginBottom: 8 },
  filterLabelSpaced: { marginTop: 14 },
  clear: { alignSelf: "flex-start", marginTop: 12 },
  clearText: { color: colors.accent, fontSize: 13, fontWeight: "800" },
  more: { marginVertical: 16 },
});
