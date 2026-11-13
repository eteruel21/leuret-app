import { Ionicons } from "@expo/vector-icons";
import { Link, type Href, router, useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { ContactActions } from "@/components/client/ContactActions";
import { ConnectionInboxButton } from "@/components/client/connection-inbox-button";
import { LeuretButton } from "@/components/LeuretButton";
import { LeuretEmptyState } from "@/components/LeuretEmptyState";
import { LeuretFeedback } from "@/components/LeuretFeedback";
import { LeuretLoading } from "@/components/LeuretLoading";
import { MotionPressable } from "@/components/MotionPressable";
import { colors, radius, shadows } from "@/constants/theme";
import { useAuth } from "@/contexts/AuthContext";
import { getClientContractorCompanies, type ContractorCompany } from "@/services/client-service";
import { getClientSummary, type ClientSummary } from "@/services/client-portal-service";
import { relativeDayLabel, shortMonth, todayKey } from "@/utils/client-portal";
import { formatMoney } from "@/utils/format";

type IconName = React.ComponentProps<typeof Ionicons>["name"];

function greeting(): string {
  const hour = Number(
    new Intl.DateTimeFormat("en-US", { hour: "numeric", hour12: false, timeZone: "America/Panama" }).format(new Date()),
  );
  if (hour < 12) return "Buenos días";
  if (hour < 19) return "Buenas tardes";
  return "Buenas noches";
}

export default function ClientHomeScreen() {
  const { profile } = useAuth();
  const profileId = profile?.id;
  const [contractors, setContractors] = useState<ContractorCompany[]>([]);
  const [summary, setSummary] = useState<ClientSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    async (showRefresh = false) => {
      if (!profileId) return;
      if (showRefresh) setRefreshing(true);

      const [companiesResult, summaryResult] = await Promise.all([
        getClientContractorCompanies(profileId),
        getClientSummary(),
      ]);

      if (!companiesResult.error) setContractors(companiesResult.companies);
      if (summaryResult.summary) setSummary(summaryResult.summary);
      setError(companiesResult.error || summaryResult.error);
      setLoading(false);
      setRefreshing(false);
    },
    [profileId],
  );

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const firstName = (profile?.first_name || profile?.full_name || "").trim().split(/\s+/)[0] || "Cliente";
  const pending = summary?.pending_budgets ?? 0;
  const openInvoices = summary?.open_invoices ?? [];
  const openCount = openInvoices.reduce((sum, row) => sum + row.open_count, 0);
  const overdueCount = openInvoices.reduce((sum, row) => sum + row.overdue_count, 0);
  const next = summary?.next_activity ?? null;
  const today = todayKey();

  return (
    <SafeAreaView style={styles.safeArea} edges={["top"]}>
      <View style={styles.header}>
        <View style={styles.headerText}>
          <Text style={styles.welcome}>{greeting()},</Text>
          <Text style={styles.name} numberOfLines={1}>
            {firstName}
          </Text>
        </View>
        <ConnectionInboxButton />
        <Pressable
          accessibilityLabel="Mi cuenta"
          onPress={() => router.navigate("/(client-tabs)/cuenta" as Href)}
          style={styles.profileButton}
        >
          <Ionicons name="person-outline" size={21} color={colors.textLight} />
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void load(true)} />}
      >
        {loading ? (
          <LeuretLoading message="Preparando tu resumen…" compact />
        ) : (
          <>
            {error ? (
              <LeuretFeedback
                tone="error"
                title="No pudimos actualizar tu resumen"
                message={error}
                actionLabel="Reintentar"
                onAction={() => void load(true)}
              />
            ) : null}

            {pending > 0 ? (
              <MotionPressable
                onPress={() => router.navigate("/(client-tabs)/presupuestos" as Href)}
                pressedScale={0.985}
                style={styles.actionBanner}
                accessibilityRole="button"
              >
                <View style={styles.actionIcon}>
                  <Ionicons name="document-text" size={22} color={colors.textInverse} />
                </View>
                <View style={styles.actionText}>
                  <Text style={styles.actionTitle}>
                    {pending === 1 ? "Tienes un presupuesto por responder" : `Tienes ${pending} presupuestos por responder`}
                  </Text>
                  <Text style={styles.actionBody}>Revísalo y apruébalo o pide cambios.</Text>
                </View>
                <Ionicons name="chevron-forward" size={20} color={colors.textInverse} />
              </MotionPressable>
            ) : null}

            <View style={styles.tiles}>
              <Tile
                icon="business-outline"
                label="Proyectos activos"
                value={String(summary?.active_projects ?? 0)}
                onPress={() => router.navigate("/(client-tabs)/proyectos" as Href)}
              />
              <Tile
                icon="receipt-outline"
                label={overdueCount ? `${overdueCount} vencida${overdueCount === 1 ? "" : "s"}` : `${openCount} por pagar`}
                value={
                  openInvoices.length === 0
                    ? formatMoney(0)
                    : openInvoices.map((row) => formatMoney(row.balance_due, row.currency_code)).join(" + ")
                }
                caption="Saldo pendiente"
                alert={overdueCount > 0}
                onPress={() => router.navigate("/(client-tabs)/facturas" as Href)}
              />
            </View>

            <Text style={styles.sectionTitle}>Próxima visita</Text>
            {next ? (
              <MotionPressable
                pressedScale={0.985}
                disabled={!next.project_id}
                onPress={() =>
                  next.project_id &&
                  router.push({ pathname: "/cliente-proyectos/[id]", params: { id: next.project_id } } as Href)
                }
                style={styles.visitCard}
              >
                <View style={styles.visitDate}>
                  <Text style={styles.visitDay}>{next.date.slice(8, 10)}</Text>
                  <Text style={styles.visitMonth}>{shortMonth(next.date)}</Text>
                </View>
                <View style={styles.visitInfo}>
                  <Text style={styles.visitWhen}>
                    {relativeDayLabel(next.date, today)} · {next.start_time}
                    {next.end_time ? `–${next.end_time}` : ""}
                  </Text>
                  <Text style={styles.visitTitle}>{next.title}</Text>
                  <Text style={styles.visitMeta} numberOfLines={1}>
                    {[next.project_name, next.company?.name].filter(Boolean).join(" · ")}
                  </Text>
                  {next.address ? (
                    <Text style={styles.visitMeta} numberOfLines={1}>
                      {next.address}
                    </Text>
                  ) : null}
                </View>
              </MotionPressable>
            ) : (
              <View style={styles.emptyCard}>
                <Ionicons name="calendar-clear-outline" size={20} color={colors.textMuted} />
                <Text style={styles.emptyText}>No tienes visitas programadas.</Text>
              </View>
            )}

            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Tus contratistas</Text>
              <LeuretButton label="Agregar contratista" icon="add" variant="secondary" onPress={() => router.push("/solicitudes")} />
            </View>
            {contractors.length === 0 ? (
              <LeuretEmptyState
                icon="business-outline"
                title="Sin contratistas vinculados"
                description="Envía una solicitud con el correo o celular de tu contratista. También puedes aceptar las solicitudes que te envíen."
                compact
              />
            ) : (
              contractors.map((company) => (
                <View key={company.id} style={styles.companyCard}>
                  <Link href={{ pathname: "/contratistas/[id]", params: { id: company.id } }} asChild>
                    <Pressable style={styles.companyHeader} accessibilityLabel={`Ver perfil de ${company.name}`}>
                      <View style={styles.companyAvatar}>
                        <Text style={styles.companyInitial}>{company.name.trim().charAt(0).toUpperCase()}</Text>
                      </View>
                      <View style={styles.companyInfo}>
                        <Text style={styles.companyName}>{company.name}</Text>
                        {company.address ? <Text style={styles.companyMeta} numberOfLines={1}>{company.address}</Text> : null}
                      </View>
                      <Ionicons name="chevron-forward" size={18} color={colors.primary} />
                    </Pressable>
                  </Link>
                  <View style={styles.companyActions}>
                    <ContactActions
                      phone={company.phone}
                      email={company.email}
                      address={company.address}
                      whatsappMessage="Hola, te escribo desde Leuret."
                    />
                  </View>
                </View>
              ))
            )}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function Tile({
  icon,
  label,
  value,
  caption,
  alert = false,
  onPress,
}: {
  icon: IconName;
  label: string;
  value: string;
  caption?: string;
  alert?: boolean;
  onPress: () => void;
}) {
  return (
    <MotionPressable onPress={onPress} pressedScale={0.97} style={styles.tile} accessibilityRole="button">
      <View style={[styles.tileIcon, alert && styles.tileIconAlert]}>
        <Ionicons name={icon} size={18} color={alert ? colors.danger : colors.primary} />
      </View>
      {caption ? <Text style={styles.tileCaption}>{caption}</Text> : null}
      <Text style={styles.tileValue} numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </Text>
      <Text style={[styles.tileLabel, alert && styles.tileLabelAlert]}>{label}</Text>
    </MotionPressable>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.surfaceDark },
  header: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 24,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  headerText: { flex: 1 },
  welcome: { color: colors.textMuted, fontSize: 14 },
  name: { marginTop: 3, color: colors.textLight, fontSize: 24, fontWeight: "900" },
  profileButton: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: colors.surfaceDarkRaised,
    alignItems: "center",
    justifyContent: "center",
  },
  content: { flexGrow: 1, padding: 20, paddingBottom: 40, gap: 14, backgroundColor: colors.background },
  actionBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 16,
    borderRadius: radius.lg,
    backgroundColor: colors.accent,
    ...shadows.glow,
  },
  actionIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.18)",
  },
  actionText: { flex: 1 },
  actionTitle: { color: colors.textInverse, fontSize: 15, fontWeight: "900" },
  actionBody: { marginTop: 2, color: colors.textInverse, fontSize: 12, opacity: 0.9 },
  tiles: { flexDirection: "row", gap: 12 },
  tile: {
    flex: 1,
    padding: 14,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    ...shadows.soft,
  },
  tileIcon: { width: 34, height: 34, borderRadius: 10, alignItems: "center", justifyContent: "center", backgroundColor: colors.primarySoft },
  tileIconAlert: { backgroundColor: colors.dangerSoft },
  tileCaption: { marginTop: 10, color: colors.textSecondary, fontSize: 11, fontWeight: "800" },
  tileValue: { marginTop: 10, color: colors.text, fontSize: 22, fontWeight: "900" },
  tileLabel: { marginTop: 2, color: colors.textSecondary, fontSize: 12, fontWeight: "700" },
  tileLabelAlert: { color: colors.danger },
  sectionTitle: { marginTop: 10, fontSize: 17, fontWeight: "900", color: colors.text },
  sectionHeader: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 8 },
  visitCard: {
    flexDirection: "row",
    gap: 14,
    padding: 14,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  visitDate: { width: 54, height: 60, borderRadius: radius.md, alignItems: "center", justifyContent: "center", backgroundColor: colors.surfaceDark },
  visitDay: { color: colors.textLight, fontSize: 22, fontWeight: "900" },
  visitMonth: { color: colors.textLightMuted, fontSize: 11, fontWeight: "800", textTransform: "uppercase" },
  visitInfo: { flex: 1 },
  visitWhen: { color: colors.accent, fontSize: 12, fontWeight: "900" },
  visitTitle: { marginTop: 2, color: colors.text, fontSize: 15, fontWeight: "800" },
  visitMeta: { marginTop: 2, color: colors.textSecondary, fontSize: 12, fontWeight: "600" },
  emptyCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 14,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    borderStyle: "dashed",
    backgroundColor: colors.surface,
  },
  emptyText: { color: colors.textSecondary, fontSize: 13, fontWeight: "600" },
  companyCard: { padding: 16, borderRadius: radius.lg, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  companyHeader: { flexDirection: "row", alignItems: "center", gap: 12 },
  companyAvatar: { width: 42, height: 42, borderRadius: 21, alignItems: "center", justifyContent: "center", backgroundColor: colors.primarySoft },
  companyInitial: { color: colors.primary, fontSize: 17, fontWeight: "900" },
  companyInfo: { flex: 1 },
  companyName: { fontSize: 16, fontWeight: "800", color: colors.text },
  companyMeta: { marginTop: 2, fontSize: 12, color: colors.textSecondary },
  companyActions: { marginTop: 14 },
});
