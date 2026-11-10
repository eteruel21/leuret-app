import { Ionicons } from "@expo/vector-icons";
import { useCallback, useEffect, useState } from "react";
import { FlatList, RefreshControl, StyleSheet, Text, View } from "react-native";

import { LeuretButton } from "@/components/LeuretButton";
import { LeuretEmptyState } from "@/components/LeuretEmptyState";
import { LeuretLoading } from "@/components/LeuretLoading";
import { RequirePermission } from "@/components/RequirePermission";
import { colors, radius } from "@/constants/theme";
import { useCompany } from "@/contexts/CompanyContext";
import { ROLE_LABELS } from "@/permissions/permissions";
import { getCompanyAuditLogs } from "@/services/users-service";
import type { AuditLogEntry } from "@/types/company";
import { formatDate } from "@/utils/format";
import { describeAuditAction } from "@/utils/team";

const PAGE_SIZE = 20;

function TeamHistoryContent() {
  const { activeCompany } = useCompany();
  const companyId = activeCompany?.id;

  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadPage = useCallback(
    async (nextPage: number, mode: "replace" | "append") => {
      if (!companyId) return;
      const result = await getCompanyAuditLogs(companyId, nextPage, PAGE_SIZE);
      setError(result.error);
      setTotal(result.total);
      setPage(nextPage);
      setLogs((current) => (mode === "append" ? [...current, ...result.logs] : result.logs));
    },
    [companyId]
  );

  useEffect(() => {
    void loadPage(1, "replace").finally(() => setLoading(false));
  }, [loadPage]);

  if (!companyId || loading) {
    return <LeuretLoading fullScreen message="Cargando historial…" />;
  }

  const hasMore = logs.length < total;

  return (
    <FlatList
      style={styles.list}
      contentContainerStyle={styles.content}
      data={logs}
      keyExtractor={(item) => item.id}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => {
            setRefreshing(true);
            void loadPage(1, "replace").finally(() => setRefreshing(false));
          }}
        />
      }
      ListHeaderComponent={
        error ? (
          <View style={styles.errorBox}>
            <Ionicons name="alert-circle-outline" size={18} color={colors.danger} />
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null
      }
      ListEmptyComponent={
        <LeuretEmptyState
          icon="time-outline"
          title="Sin cambios registrados"
          description="Aquí verás quién cambió roles, desactivó o quitó miembros y actualizó la facturación."
        />
      }
      renderItem={({ item }) => (
        <View style={styles.row}>
          <View style={styles.dot} />
          <View style={styles.rowCopy}>
            <Text style={styles.rowText}>
              <Text style={styles.actor}>{item.user_full_name || item.user_email || "Alguien"}</Text>{" "}
              {describeAuditAction(item.action, item.metadata, ROLE_LABELS)}
            </Text>
            <Text style={styles.rowDate}>{formatDate(item.created_at)}</Text>
          </View>
        </View>
      )}
      ListFooterComponent={
        hasMore ? (
          <LeuretButton
            label="Ver más"
            variant="secondary"
            loading={loadingMore}
            onPress={() => {
              setLoadingMore(true);
              void loadPage(page + 1, "append").finally(() => setLoadingMore(false));
            }}
            style={styles.more}
          />
        ) : null
      }
    />
  );
}

export default function TeamHistoryScreen() {
  return (
    <RequirePermission capability="company.manage" section="Historial del equipo">
      <TeamHistoryContent />
    </RequirePermission>
  );
}

const styles = StyleSheet.create({
  list: { flex: 1, backgroundColor: colors.background },
  content: { padding: 20, paddingBottom: 40, flexGrow: 1 },
  errorBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    padding: 12,
    marginBottom: 12,
    borderRadius: radius.md,
    backgroundColor: colors.dangerSoft,
  },
  errorText: { flex: 1, color: colors.danger, fontSize: 13 },
  row: { flexDirection: "row", gap: 12, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.divider },
  dot: { width: 10, height: 10, marginTop: 5, borderRadius: 5, backgroundColor: colors.accent },
  rowCopy: { flex: 1 },
  rowText: { color: colors.text, fontSize: 14, lineHeight: 20 },
  actor: { fontWeight: "900" },
  rowDate: { marginTop: 3, color: colors.textMuted, fontSize: 12 },
  more: { marginTop: 16 },
});
