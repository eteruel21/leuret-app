import { Ionicons } from "@expo/vector-icons";
import { type Href, router, useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { ActivityIndicator, Text, View } from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";

import { AttentionList, Kpi, dashboardStyles as styles } from "@/components/OwnerDashboard";
import { colors } from "@/constants/theme";
import { getRoleDashboard } from "@/services/role-dashboard-service";
import { formatMoney } from "@/utils/format";
import { roleAttention, roleKpis, type RoleDashboard as RoleDashboardData } from "@/utils/role-dashboard";

/** Inicio con números propios para Ventas y Presupuestista. */
export function RoleDashboard({ companyId, role }: { companyId: string; role: "sales" | "estimator" }) {
  const [dashboard, setDashboard] = useState<RoleDashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [stale, setStale] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      let mounted = true;
      void getRoleDashboard(companyId).then((result) => {
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
  // El rol que manda la API es el real; el de la app solo decide qué pedir.
  const data = { ...dashboard, role: dashboard.role === "estimator" || dashboard.role === "sales" ? dashboard.role : role };
  const kpis = roleKpis(data, money);
  const attention = roleAttention(data, money);
  const isEstimator = data.role === "estimator";

  return (
    <Animated.View entering={FadeInDown.delay(300).duration(460)} style={styles.container}>
      <View style={styles.headerRow}>
        <View>
          <Text style={styles.eyebrow}>{isEstimator ? "TUS PRESUPUESTOS" : "TUS COBROS Y CIERRES"}</Text>
          <Text style={styles.title}>{isEstimator ? "Cómo van tus cotizaciones" : "Tu cartera hoy"}</Text>
        </View>
        {stale ? (
          <View style={styles.staleBadge}>
            <Ionicons name="cloud-offline-outline" size={13} color={colors.textSecondary} />
            <Text style={styles.staleText}>Sin conexión</Text>
          </View>
        ) : null}
      </View>

      <View style={styles.kpiGrid}>
        {kpis.map((kpi) => (
          <Kpi
            key={kpi.id}
            label={kpi.label}
            value={kpi.value}
            detail={kpi.detail}
            tone={kpi.tone}
            onPress={() => router.push(kpi.href as Href)}
          />
        ))}
      </View>

      <AttentionList items={attention} />
    </Animated.View>
  );
}
