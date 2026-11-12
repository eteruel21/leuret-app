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
import { listClientInvoices, type ClientInvoice } from "@/services/client-portal-service";
import { clientInvoiceState, matchesSearch } from "@/utils/client-portal";
import { formatMoney, formatShortDate } from "@/utils/format";

type Filter = "open" | "paid" | "all";

export default function ClientInvoicesScreen() {
  const [invoices, setInvoices] = useState<ClientInvoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("open");
  const [search, setSearch] = useState("");

  const load = useCallback(async (showRefresh = false) => {
    if (showRefresh) setRefreshing(true);
    const result = await listClientInvoices();
    setError(result.error);
    if (!result.error) setInvoices(result.invoices);
    setLoading(false);
    setRefreshing(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const withState = useMemo(
    () => invoices.map((invoice) => ({ invoice, state: clientInvoiceState(invoice) })),
    [invoices],
  );

  const totals = useMemo(() => {
    const open = withState.filter(({ state }) => state.key === "open" || state.key === "overdue");
    const byCurrency = new Map<string, number>();
    for (const { invoice } of open) {
      byCurrency.set(invoice.currency_code, (byCurrency.get(invoice.currency_code) ?? 0) + invoice.balance_due);
    }
    return {
      open: open.length,
      overdue: withState.filter(({ state }) => state.key === "overdue").length,
      paid: withState.filter(({ state }) => state.key === "paid").length,
      balances: [...byCurrency.entries()],
    };
  }, [withState]);

  const visible = useMemo(
    () =>
      withState
        .filter(({ state }) =>
          filter === "all" ? true : filter === "paid" ? state.key === "paid" : state.key === "open" || state.key === "overdue",
        )
        .filter(({ invoice }) =>
          matchesSearch(search, invoice.invoice_number, invoice.company.name, invoice.snapshot_data?.source.title),
        )
        .sort((a, b) => Number(b.state.key === "overdue") - Number(a.state.key === "overdue")),
    [withState, filter, search],
  );

  if (loading) return <LeuretLoading message="Cargando facturas…" fullScreen />;

  return (
    <SafeAreaView style={styles.safeArea} edges={["left", "right"]}>
      <FlatList
        data={visible}
        keyExtractor={(item) => item.invoice.id}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void load(true)} />}
        ListHeaderComponent={
          <View>
            <Text style={styles.title}>Facturas</Text>

            <View style={styles.balanceCard}>
              <Text style={styles.balanceLabel}>Saldo pendiente</Text>
              {totals.balances.length === 0 ? (
                <Text style={styles.balanceValue}>{formatMoney(0)}</Text>
              ) : (
                totals.balances.map(([currency, amount]) => (
                  <Text key={currency} style={styles.balanceValue}>
                    {formatMoney(amount, currency)}
                  </Text>
                ))
              )}
              <Text style={styles.balanceMeta}>
                {totals.open === 0
                  ? "Estás al día."
                  : `${totals.open} factura${totals.open === 1 ? "" : "s"} por pagar${totals.overdue ? ` · ${totals.overdue} vencida${totals.overdue === 1 ? "" : "s"}` : ""}`}
              </Text>
            </View>

            {error ? (
              <LeuretFeedback
                tone="error"
                title="No pudimos cargar tus facturas"
                message={error}
                actionLabel="Reintentar"
                onAction={() => void load(true)}
                style={styles.feedback}
              />
            ) : null}

            {invoices.length > 0 ? (
              <FilterBar
                value={filter}
                onChange={setFilter}
                search={search}
                onSearchChange={setSearch}
                searchPlaceholder="Buscar por número o contratista"
                options={[
                  { value: "open", label: "Por pagar", count: totals.open },
                  { value: "paid", label: "Pagadas", count: totals.paid },
                  { value: "all", label: "Todas", count: invoices.length },
                ]}
              />
            ) : null}
          </View>
        }
        ListEmptyComponent={
          error ? null : invoices.length === 0 ? (
            <LeuretEmptyState
              icon="receipt-outline"
              title="Aún no tienes facturas"
              description="Las facturas que emita tu contratista aparecerán aquí, con su saldo y tus pagos."
              compact
            />
          ) : (
            <LeuretEmptyState
              icon="checkmark-done-outline"
              title={filter === "open" ? "No tienes pagos pendientes" : "Sin resultados"}
              description={filter === "open" ? "Todas tus facturas están pagadas." : "Prueba con otro filtro o búsqueda."}
              compact
            />
          )
        }
        renderItem={({ item: { invoice, state } }) => (
          <MotionPressable
            onPress={() => router.push({ pathname: "/cliente-facturas/[id]", params: { id: invoice.id } } as Href)}
            pressedScale={0.985}
            accessibilityRole="button"
            accessibilityLabel={`Factura ${invoice.invoice_number ?? ""}, ${state.label}`}
            style={[styles.card, state.key === "overdue" && styles.cardOverdue]}
          >
            <View style={styles.cardHeader}>
              <View style={styles.cardInfo}>
                <Text style={styles.code}>{invoice.invoice_number || "Factura"}</Text>
                <Text style={styles.cardTitle} numberOfLines={1}>
                  {invoice.snapshot_data?.source.title || invoice.company.name}
                </Text>
                <Text style={styles.meta} numberOfLines={1}>
                  {invoice.company.name}
                </Text>
              </View>
              <StatusPill label={state.label} tone={state.tone} />
            </View>

            <View style={styles.divider} />

            <View style={styles.footer}>
              <View style={styles.footerLeft}>
                <Ionicons name="calendar-outline" size={14} color={colors.textMuted} />
                <Text style={styles.footerText}>
                  {invoice.due_date && state.key !== "paid"
                    ? `Vence ${formatShortDate(invoice.due_date)}`
                    : invoice.issue_date
                      ? `Emitida ${formatShortDate(invoice.issue_date)}`
                      : ""}
                </Text>
              </View>
              <View style={styles.amounts}>
                <Text style={styles.amount}>
                  {formatMoney(state.key === "paid" ? invoice.adjusted_total_amount : invoice.balance_due, invoice.currency_code)}
                </Text>
                {state.key !== "paid" && invoice.total_paid > 0 ? (
                  <Text style={styles.amountMeta}>de {formatMoney(invoice.adjusted_total_amount, invoice.currency_code)}</Text>
                ) : null}
              </View>
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
  title: { color: colors.text, fontSize: 28, fontWeight: "900", marginBottom: 14 },
  balanceCard: { padding: 18, borderRadius: radius.lg, backgroundColor: colors.surfaceDark, marginBottom: 18 },
  balanceLabel: { color: colors.textLightMuted, fontSize: 12, fontWeight: "800", textTransform: "uppercase" },
  balanceValue: { marginTop: 6, color: colors.textLight, fontSize: 28, fontWeight: "900" },
  balanceMeta: { marginTop: 6, color: colors.textLightMuted, fontSize: 13, fontWeight: "600" },
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
  cardOverdue: { borderColor: colors.danger, borderLeftWidth: 4 },
  cardHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", gap: 10 },
  cardInfo: { flex: 1 },
  code: { color: colors.accent, fontSize: 12, fontWeight: "900" },
  cardTitle: { marginTop: 4, color: colors.text, fontSize: 15, fontWeight: "800" },
  meta: { marginTop: 4, color: colors.textSecondary, fontSize: 12, fontWeight: "600" },
  divider: { height: 1, backgroundColor: colors.divider, marginVertical: 12 },
  footer: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 10 },
  footerLeft: { flex: 1, flexDirection: "row", alignItems: "center", gap: 6 },
  footerText: { color: colors.textSecondary, fontSize: 12, fontWeight: "600" },
  amounts: { alignItems: "flex-end" },
  amount: { fontSize: 16, fontWeight: "900", color: colors.text },
  amountMeta: { marginTop: 2, fontSize: 11, color: colors.textSecondary, fontWeight: "600" },
});
