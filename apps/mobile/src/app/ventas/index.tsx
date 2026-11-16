import { useCallback, useMemo, useState } from "react";
import { RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { ChoiceChips } from "@/components/job-requests/ChoiceChips";
import { LeuretEmptyState } from "@/components/LeuretEmptyState";
import { LeuretFeedback } from "@/components/LeuretFeedback";
import { LeuretLoading } from "@/components/LeuretLoading";
import { colors, radius } from "@/constants/theme";
import { useCompany } from "@/contexts/CompanyContext";
import { usePermissions } from "@/hooks/usePermissions";
import { useRefreshOnFocus } from "@/hooks/useRefreshOnFocus";
import {
  getSalesPerformance,
  type SalesFigures,
  type SalesPersonPerformance,
} from "@/services/sales-report-service";
import { formatMoney } from "@/utils/format";

const MONTHS = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

/** Variación contra el año anterior: «+12 %», «−5 %» o «nuevo». */
function change(current: number, previous: number): string | null {
  if (previous === 0) return current > 0 ? "nuevo este año" : null;
  const percent = Math.round(((current - previous) / previous) * 100);
  return `${percent >= 0 ? "+" : "−"}${Math.abs(percent)} % vs. año anterior`;
}

function SummaryCard({ label, amount, detail, previous }: { label: string; amount: number; detail: string; previous: number }) {
  const variation = change(amount, previous);
  return (
    <View style={styles.card} accessible accessibilityLabel={`${label}: ${formatMoney(amount)}. ${detail}`}>
      <Text style={styles.cardLabel}>{label}</Text>
      <Text style={styles.cardAmount}>{formatMoney(amount)}</Text>
      <Text style={styles.cardDetail}>{detail}</Text>
      {variation ? <Text style={styles.cardChange}>{variation}</Text> : null}
    </View>
  );
}

function Summary({ totals, previous }: { totals: SalesFigures; previous: SalesFigures }) {
  const closeRate = totals.quotedTotal > 0 ? Math.round((totals.approvedTotal / totals.quotedTotal) * 100) : null;
  return (
    <View style={styles.cards}>
      <SummaryCard
        label="Cotizado"
        amount={totals.quotedTotal}
        detail={`${totals.quotedCount} presupuesto${totals.quotedCount === 1 ? "" : "s"} enviado${totals.quotedCount === 1 ? "" : "s"}`}
        previous={previous.quotedTotal}
      />
      <SummaryCard
        label="Ejecutado (facturado)"
        amount={totals.invoicedTotal}
        detail={`${totals.invoicedCount} factura${totals.invoicedCount === 1 ? "" : "s"}`}
        previous={previous.invoicedTotal}
      />
      <SummaryCard
        label="Aprobado"
        amount={totals.approvedTotal}
        detail={closeRate === null ? "Sin cotizaciones" : `${closeRate} % de lo cotizado`}
        previous={previous.approvedTotal}
      />
      <SummaryCard label="Cobrado" amount={totals.collectedTotal} detail="Pagos recibidos" previous={previous.collectedTotal} />
    </View>
  );
}

function MonthTable({ person, year }: { person: SalesPersonPerformance; year: number }) {
  const now = new Date();
  const lastMonth = year === now.getFullYear() ? now.getMonth() + 1 : 12;
  const months = person.months.filter((month) => month.month <= lastMonth);
  return (
    <View style={styles.table} accessibilityLabel={`Mes a mes de ${year}`}>
      <View style={[styles.row, styles.headerRow]}>
        <Text style={[styles.cellMonth, styles.headerText]}>Mes</Text>
        <Text style={[styles.cell, styles.headerText]}>Cotizado</Text>
        <Text style={[styles.cell, styles.headerText]}>Ejecutado</Text>
      </View>
      {months.map((month) => (
        <View
          key={month.month}
          style={styles.row}
          accessible
          accessibilityLabel={`${MONTHS[month.month - 1]}: cotizado ${formatMoney(month.quotedTotal)}, ejecutado ${formatMoney(month.invoicedTotal)}`}
        >
          <Text style={styles.cellMonth}>{MONTHS[month.month - 1]}</Text>
          <View style={styles.cell}>
            <Text style={styles.cellAmount}>{formatMoney(month.quotedTotal)}</Text>
            <Text style={styles.cellMeta}>
              {month.quotedCount} env. · aprob. {formatMoney(month.approvedTotal)}
            </Text>
          </View>
          <View style={styles.cell}>
            <Text style={styles.cellAmount}>{formatMoney(month.invoicedTotal)}</Text>
            <Text style={styles.cellMeta}>cobrado {formatMoney(month.collectedTotal)}</Text>
          </View>
        </View>
      ))}
    </View>
  );
}

export default function SalesReportScreen() {
  const { activeCompany } = useCompany();
  const { role } = usePermissions();
  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState(currentYear);
  const [people, setPeople] = useState<SalesPersonPerformance[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    async (isRefresh = false) => {
      if (!activeCompany) return;
      if (isRefresh) setRefreshing(true);
      const result = await getSalesPerformance(activeCompany.id, year);
      setPeople(result.people);
      setError(result.error);
      setSelectedId((current) => current && result.people.some((person) => person.userId === current) ? current : result.people[0]?.userId ?? null);
      setLoading(false);
      setRefreshing(false);
    },
    [activeCompany, year],
  );

  useRefreshOnFocus(load);

  const team = useMemo(
    () =>
      people.reduce(
        (sum, person) => ({
          quotedCount: sum.quotedCount + person.totals.quotedCount,
          quotedTotal: sum.quotedTotal + person.totals.quotedTotal,
          approvedCount: sum.approvedCount + person.totals.approvedCount,
          approvedTotal: sum.approvedTotal + person.totals.approvedTotal,
          invoicedCount: sum.invoicedCount + person.totals.invoicedCount,
          invoicedTotal: sum.invoicedTotal + person.totals.invoicedTotal,
          collectedTotal: sum.collectedTotal + person.totals.collectedTotal,
        }),
        { quotedCount: 0, quotedTotal: 0, approvedCount: 0, approvedTotal: 0, invoicedCount: 0, invoicedTotal: 0, collectedTotal: 0 },
      ),
    [people],
  );

  if (loading) return <LeuretLoading message="Cargando informe de ventas…" fullScreen />;

  const selected = people.find((person) => person.userId === selectedId) ?? null;
  const isSales = role === "sales";
  const years = [currentYear, currentYear - 1, currentYear - 2].map(String);

  return (
    <SafeAreaView style={styles.safeArea} edges={["left", "right", "bottom"]}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void load(true)} />}
      >
        <Text style={styles.intro}>
          {isSales
            ? "Lo que has cotizado (presupuestos que enviaste) y lo que se ha ejecutado (facturas que generaste), por mes y por año."
            : "Lo que cotiza cada persona de ventas (presupuestos que envía) y lo que ejecuta (facturas que genera), por mes y por año."}
        </Text>

        <ChoiceChips options={years} value={String(year)} onChange={(value) => value && setYear(Number(value))} accessibilityLabel="Año" />

        {error ? <LeuretFeedback tone="error" title="No se pudo cargar el informe" message={error} actionLabel="Reintentar" onAction={() => void load(true)} /> : null}

        {!error && people.length === 0 ? (
          <LeuretEmptyState
            icon="people-outline"
            title="Sin personal de ventas"
            description="Cuando alguien del equipo tenga el rol Ventas, aquí verás lo que cotiza y lo que ejecuta."
          />
        ) : null}

        {!isSales && people.length > 1 ? (
          <>
            <Text style={styles.sectionTitle}>Equipo de ventas · {year}</Text>
            <Summary totals={team} previous={people.reduce((sum, person) => ({
              ...sum,
              quotedTotal: sum.quotedTotal + person.previousYearTotals.quotedTotal,
              approvedTotal: sum.approvedTotal + person.previousYearTotals.approvedTotal,
              invoicedTotal: sum.invoicedTotal + person.previousYearTotals.invoicedTotal,
              collectedTotal: sum.collectedTotal + person.previousYearTotals.collectedTotal,
            }), { ...team, quotedTotal: 0, approvedTotal: 0, invoicedTotal: 0, collectedTotal: 0 })} />
            <Text style={styles.sectionTitle}>Por persona</Text>
            <ChoiceChips
              options={people.map((person) => ({ value: person.userId, label: person.active ? person.name : `${person.name} (inactivo)` }))}
              value={selectedId}
              onChange={(value) => value && setSelectedId(value)}
              accessibilityLabel="Persona de ventas"
            />
          </>
        ) : null}

        {selected ? (
          <>
            <Text style={styles.sectionTitle}>{isSales ? `Tu año ${year}` : `${selected.name} · ${year}`}</Text>
            <Summary totals={selected.totals} previous={selected.previousYearTotals} />
            <Text style={styles.sectionTitle}>Mes a mes</Text>
            <MonthTable person={selected} year={year} />
          </>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.background },
  content: { padding: 20, paddingBottom: 40, gap: 14 },
  intro: { color: colors.textSecondary, fontSize: 14, lineHeight: 20 },
  sectionTitle: { color: colors.text, fontSize: 16, fontWeight: "900", marginTop: 6 },
  cards: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  card: {
    flexGrow: 1,
    flexBasis: "45%",
    minWidth: 0,
    padding: 14,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  cardLabel: { color: colors.textSecondary, fontSize: 12, fontWeight: "800", textTransform: "uppercase" },
  cardAmount: { color: colors.text, fontSize: 20, fontWeight: "900", marginTop: 4 },
  cardDetail: { color: colors.textSecondary, fontSize: 12, marginTop: 2 },
  cardChange: { color: colors.primary, fontSize: 12, fontWeight: "700", marginTop: 4 },
  table: { borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, overflow: "hidden" },
  row: { flexDirection: "row", alignItems: "center", paddingVertical: 10, paddingHorizontal: 12, borderTopWidth: 1, borderTopColor: colors.divider, gap: 8 },
  headerRow: { borderTopWidth: 0, backgroundColor: colors.surfaceAlt },
  headerText: { color: colors.textSecondary, fontSize: 12, fontWeight: "800" },
  cellMonth: { width: 40, color: colors.text, fontWeight: "800" },
  cell: { flex: 1, minWidth: 0 },
  cellAmount: { color: colors.text, fontSize: 14, fontWeight: "800" },
  cellMeta: { color: colors.textMuted, fontSize: 11, marginTop: 2 },
});
