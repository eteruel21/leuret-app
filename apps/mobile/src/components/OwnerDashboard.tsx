import { Ionicons } from "@expo/vector-icons";
import { type Href, router, useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";

import { colors, radius, shadows } from "@/constants/theme";
import { getCompanyDashboard } from "@/services/dashboard-service";
import {
  buildAttentionItems,
  monthChange,
  type AttentionSeverity,
  type CompanyDashboard,
} from "@/utils/dashboard";
import { formatMoney } from "@/utils/format";

type IconName = React.ComponentProps<typeof Ionicons>["name"];

const SEVERITY_STYLE: Record<AttentionSeverity, { icon: IconName; color: string; background: string }> = {
  danger: { icon: "alert-circle", color: colors.danger, background: colors.dangerSoft },
  warning: { icon: "time", color: colors.sand, background: colors.warningSoft },
  info: { icon: "information-circle", color: colors.steel, background: colors.infoSoft },
};

function Kpi({
  label,
  value,
  detail,
  tone = "default",
  onPress,
}: {
  label: string;
  value: string;
  detail?: string | null;
  tone?: "default" | "positive" | "negative";
  onPress?: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole={onPress ? "button" : undefined}
      style={({ pressed }) => [styles.kpi, pressed && styles.pressed]}
    >
      <Text style={styles.kpiLabel}>{label}</Text>
      <Text style={styles.kpiValue} numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </Text>
      {detail ? (
        <Text
          style={[
            styles.kpiDetail,
            tone === "positive" && styles.kpiPositive,
            tone === "negative" && styles.kpiNegative,
          ]}
          numberOfLines={2}
        >
          {detail}
        </Text>
      ) : null}
    </Pressable>
  );
}

/** Resumen del negocio para owner/admin: cobros, cartera, presupuestos y alertas. */
export function OwnerDashboard({ companyId }: { companyId: string }) {
  const [dashboard, setDashboard] = useState<CompanyDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [stale, setStale] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      let mounted = true;
      void getCompanyDashboard(companyId).then((result) => {
        if (!mounted) return;
        setDashboard(result.dashboard);
        setStale(result.fromCache);
        setError(result.dashboard ? null : result.error);
        setLoading(false);
      });
      return () => {
        mounted = false;
      };
    }, [companyId])
  );

  if (loading && !dashboard) {
    return (
      <View style={styles.loadingBox}>
        <ActivityIndicator color={colors.primary} />
        <Text style={styles.muted}>Calculando tus indicadores…</Text>
      </View>
    );
  }

  if (!dashboard) {
    return (
      <View style={styles.loadingBox}>
        <Ionicons name="cloud-offline-outline" size={22} color={colors.textMuted} />
        <Text style={styles.muted}>{error ?? "No se pudieron cargar los indicadores."}</Text>
      </View>
    );
  }

  const money = (value: number) => formatMoney(value, dashboard.currencyCode);
  const change = monthChange(dashboard.collections.thisMonth, dashboard.collections.lastMonth);
  const attention = buildAttentionItems(dashboard, money);
  const monthName = new Intl.DateTimeFormat("es-PA", { month: "long" }).format(new Date());

  return (
    <Animated.View entering={FadeInDown.delay(300).duration(460)} style={styles.container}>
      <View style={styles.headerRow}>
        <View>
          <Text style={styles.eyebrow}>TU NEGOCIO</Text>
          <Text style={styles.title}>Resumen de {monthName}</Text>
        </View>
        {stale ? (
          <View style={styles.staleBadge}>
            <Ionicons name="cloud-offline-outline" size={13} color={colors.textSecondary} />
            <Text style={styles.staleText}>Sin conexión</Text>
          </View>
        ) : null}
      </View>

      <View style={styles.kpiGrid}>
        <Kpi
          label="Cobrado este mes"
          value={money(dashboard.collections.thisMonth)}
          detail={
            change === null
              ? `Mes pasado: ${money(dashboard.collections.lastMonth)}`
              : `${change >= 0 ? "▲" : "▼"} ${Math.abs(change)}% vs. mes pasado`
          }
          tone={change === null ? "default" : change >= 0 ? "positive" : "negative"}
          onPress={() => router.push("/facturas" as Href)}
        />
        <Kpi
          label="Por cobrar"
          value={money(dashboard.receivables.total)}
          detail={
            dashboard.receivables.overdueAmount > 0
              ? `${money(dashboard.receivables.overdueAmount)} vencido`
              : "Nada vencido"
          }
          tone={dashboard.receivables.overdueAmount > 0 ? "negative" : "positive"}
          onPress={() => router.push("/facturas" as Href)}
        />
        <Kpi
          label="Aprobado este mes"
          value={money(dashboard.budgets.approvedThisMonthAmount)}
          detail={`${dashboard.budgets.approvedThisMonthCount} ${
            dashboard.budgets.approvedThisMonthCount === 1 ? "presupuesto" : "presupuestos"
          }`}
          onPress={() => router.push("/presupuestos" as Href)}
        />
        <Kpi
          label="Obras activas"
          value={String(dashboard.projects.activeCount)}
          detail={
            dashboard.projects.lateCount > 0
              ? `${dashboard.projects.lateCount} ${dashboard.projects.lateCount === 1 ? "atrasada" : "atrasadas"}`
              : "Todas a tiempo"
          }
          tone={dashboard.projects.lateCount > 0 ? "negative" : "positive"}
          onPress={() => router.push("/proyectos" as Href)}
        />
      </View>

      <View style={styles.attentionCard}>
        <Text style={styles.attentionTitle}>Requiere tu atención</Text>
        {attention.length === 0 ? (
          <View style={styles.allGood}>
            <Ionicons name="checkmark-circle" size={20} color={colors.success} />
            <Text style={styles.allGoodText}>Todo al día. No hay cobros, obras ni presupuestos pendientes de acción.</Text>
          </View>
        ) : (
          attention.map((item, index) => {
            const tone = SEVERITY_STYLE[item.severity];
            return (
              <Pressable
                key={item.id}
                onPress={() => router.push(item.href as Href)}
                accessibilityRole="button"
                style={({ pressed }) => [styles.attentionRow, index > 0 && styles.attentionDivider, pressed && styles.pressed]}
              >
                <View style={[styles.attentionIcon, { backgroundColor: tone.background }]}>
                  <Ionicons name={tone.icon} size={18} color={tone.color} />
                </View>
                <View style={styles.attentionCopy}>
                  <Text style={styles.attentionItemTitle}>{item.title}</Text>
                  <Text style={styles.muted} numberOfLines={2}>{item.detail}</Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
              </Pressable>
            );
          })
        )}
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 12 },
  headerRow: { flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between" },
  eyebrow: { marginBottom: 5, color: colors.accent, fontSize: 9, fontWeight: "900", letterSpacing: 1.4 },
  title: { color: colors.text, fontSize: 20, fontWeight: "800", letterSpacing: -0.4 },
  staleBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: radius.full,
    backgroundColor: colors.surfaceAlt,
  },
  staleText: { color: colors.textSecondary, fontSize: 11, fontWeight: "700" },
  kpiGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  kpi: {
    flexBasis: "47%",
    flexGrow: 1,
    padding: 14,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    ...shadows.soft,
  },
  kpiLabel: { color: colors.textSecondary, fontSize: 11, fontWeight: "800" },
  kpiValue: { marginTop: 6, color: colors.text, fontSize: 20, fontWeight: "900", letterSpacing: -0.4 },
  kpiDetail: { marginTop: 4, color: colors.textMuted, fontSize: 11, fontWeight: "700" },
  kpiPositive: { color: colors.success },
  kpiNegative: { color: colors.danger },
  attentionCard: {
    padding: 14,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  attentionTitle: { marginBottom: 6, color: colors.text, fontSize: 15, fontWeight: "900" },
  attentionRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 10 },
  attentionDivider: { borderTopWidth: 1, borderTopColor: colors.divider },
  attentionIcon: { width: 34, height: 34, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  attentionCopy: { flex: 1 },
  attentionItemTitle: { color: colors.text, fontSize: 14, fontWeight: "800" },
  allGood: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 6 },
  allGoodText: { flex: 1, color: colors.textSecondary, fontSize: 13, lineHeight: 19 },
  loadingBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 16,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  muted: { flex: 1, color: colors.textSecondary, fontSize: 12, lineHeight: 17 },
  pressed: { opacity: 0.75 },
});
