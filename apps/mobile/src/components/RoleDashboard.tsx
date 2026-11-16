import { Ionicons } from "@expo/vector-icons";
import { type Href, router } from "expo-router";
import { useCallback } from "react";
import { Text, View } from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";

import { AttentionList, Kpi, dashboardStyles as styles } from "@/components/OwnerDashboard";
import { LeuretFeedback } from "@/components/LeuretFeedback";
import { LeuretLoading } from "@/components/LeuretLoading";
import { useFocusedResource } from "@/hooks/useFocusedResource";
import { colors } from "@/constants/theme";
import { getRoleDashboard } from "@/services/role-dashboard-service";
import { formatMoney } from "@/utils/format";
import { roleAttention, roleKpis } from "@/utils/role-dashboard";

/** Inicio con números propios para Ventas y Presupuestista. */
export function RoleDashboard({ companyId, role }: { companyId: string; role: "sales" | "estimator" }) {
  const loadDashboard = useCallback(async () => {
    const result = await getRoleDashboard(companyId);
    return {
      data: result.dashboard ? { dashboard: result.dashboard, stale: result.fromCache } : undefined,
      error: result.error,
    };
  }, [companyId]);
  const { data: snapshot, loading, error, reload } = useFocusedResource(`${companyId}:${role}`, loadDashboard);

  if (loading) return <LeuretLoading message="Cargando tus indicadores…" compact />;
  const dashboard = snapshot?.dashboard;
  const stale = snapshot?.stale;
  if (!dashboard) {
    return (
      <LeuretFeedback
        tone="error"
        title="No pudimos cargar tus indicadores"
        message={error ?? undefined}
        actionLabel="Reintentar"
        onAction={() => void reload()}
        compact
      />
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
            <Text style={styles.staleText}>Datos guardados</Text>
          </View>
        ) : null}
      </View>

      {error ? (
        <LeuretFeedback
          tone="warning"
          title="No pudimos actualizar los indicadores"
          message={error}
          actionLabel="Reintentar"
          onAction={() => void reload()}
          compact
        />
      ) : null}

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
