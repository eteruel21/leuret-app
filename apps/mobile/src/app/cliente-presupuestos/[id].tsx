import { Ionicons } from "@expo/vector-icons";
import { Stack, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { ContactActions } from "@/components/client/ContactActions";
import { StatusPill } from "@/components/client/StatusPill";
import { LeuretButton } from "@/components/LeuretButton";
import { LeuretFeedback } from "@/components/LeuretFeedback";
import { LeuretLoading } from "@/components/LeuretLoading";
import { colors, radius } from "@/constants/theme";
import {
  approveBudget,
  getClientBudgetDetail,
  rejectBudget,
  type ClientBudgetCompany,
  type ClientBudgetDetail,
} from "@/services/budget-service";
import type { BudgetItem, BudgetWithDetails } from "@/types/budget";
import type { Client } from "@/types/client";
import type { Company } from "@/types/company";
import type { Project } from "@/types/project";
import { confirmAction, showAlert } from "@/utils/alert";
import { shareBudgetPdf } from "@/utils/budget-pdf";
import { BUDGET_CHANGE_REASONS, clientBudgetState, relativeDayLabel, todayKey } from "@/utils/client-portal";
import { formatMoney, formatShortDate } from "@/utils/format";

function toPdfInput(budget: ClientBudgetDetail): { company: Company; budget: BudgetWithDetails } {
  const company: ClientBudgetCompany = budget.company ?? {};
  return {
    company: {
      id: company.id ?? budget.company_id,
      name: company.name ?? "Contratista",
      legal_name: company.legal_name ?? null,
      tax_id: company.tax_id ?? null,
      phone: company.phone ?? null,
      email: company.email ?? null,
      address: company.address ?? null,
      logo_url: company.logo_url ?? null,
      currency_code: company.currency_code ?? budget.currency_code,
      tax_rate: budget.tax_rate,
      timezone: company.timezone ?? "America/Panama",
      quotation_prefix: "",
      invoice_prefix: "",
      receipt_prefix: "",
      project_prefix: "",
      payment_prefix: "",
      created_by: "",
      active: true,
      created_at: budget.created_at,
      updated_at: budget.updated_at,
    },
    budget: {
      ...budget,
      client: (budget.client as Client | null | undefined) ?? null,
      project: budget.project?.name ? ({ name: budget.project.name } as Project) : null,
      address: null,
    },
  };
}

export default function ClientBudgetDetailScreen() {
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const budgetId = Array.isArray(params.id) ? params.id[0] : params.id;
  const [budget, setBudget] = useState<ClientBudgetDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [requestingChanges, setRequestingChanges] = useState(false);
  const [selectedReasons, setSelectedReasons] = useState<string[]>([]);
  const [details, setDetails] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [justResponded, setJustResponded] = useState<"approved" | "rejected" | null>(null);

  const load = useCallback(
    async (showRefresh = false) => {
      if (!budgetId) {
        setLoading(false);
        return;
      }
      if (showRefresh) setRefreshing(true);
      const result = await getClientBudgetDetail(budgetId);
      if (result.budget) setBudget(result.budget);
      setError(result.error);
      setLoading(false);
      setRefreshing(false);
    },
    [budgetId],
  );

  useEffect(() => {
    void load();
  }, [load]);

  const grouped = useMemo(() => {
    if (!budget) return [];
    const bySection = new Map<string | null, BudgetItem[]>();
    for (const item of budget.items) {
      const key = item.section_id && budget.sections.some((section) => section.id === item.section_id) ? item.section_id : null;
      bySection.set(key, [...(bySection.get(key) ?? []), item]);
    }
    const groups = [...budget.sections]
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((section) => ({ id: section.id, name: section.name, items: bySection.get(section.id) ?? [] }))
      .filter((group) => group.items.length > 0);
    const loose = bySection.get(null) ?? [];
    if (loose.length) groups.push({ id: "loose", name: groups.length ? "Otras partidas" : "Partidas", items: loose });
    return groups;
  }, [budget]);

  async function approve() {
    if (!budget) return;
    const currency = budget.currency_code || budget.company?.currency_code;
    const confirmed = await confirmAction({
      title: "Aprobar presupuesto",
      message: `Vas a aprobar ${budget.budget_number} por ${formatMoney(budget.total, currency)}. El contratista recibirá un aviso para continuar.`,
      confirmText: "Aprobar",
    });
    if (!confirmed) return;

    setSubmitting(true);
    setError(null);
    const result = await approveBudget(budget.id);
    setSubmitting(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    setBudget({ ...budget, status: "approved", approved_at: new Date().toISOString() });
    setJustResponded("approved");
  }

  async function requestChanges() {
    if (!budget) return;
    const reason = [...selectedReasons, details.trim()].filter(Boolean).join(". ");
    if (reason.length < 2) {
      setError("Elige un motivo o cuéntale al contratista qué quieres cambiar.");
      return;
    }
    setSubmitting(true);
    setError(null);
    const result = await rejectBudget(budget.id, reason);
    setSubmitting(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    setBudget({ ...budget, status: "rejected" });
    setRequestingChanges(false);
    setSelectedReasons([]);
    setDetails("");
    setJustResponded("rejected");
  }

  async function sharePdf() {
    if (!budget) return;
    setSharing(true);
    const { error: pdfError } = await shareBudgetPdf(toPdfInput(budget));
    setSharing(false);
    if (pdfError) showAlert("No se pudo generar el PDF", pdfError);
  }

  if (loading) return <LeuretLoading message="Cargando presupuesto…" fullScreen />;

  if (!budgetId || !budget) {
    return (
      <SafeAreaView style={styles.centered}>
        <LeuretFeedback
          tone="error"
          title="Presupuesto no disponible"
          message={error || "No encontramos este presupuesto."}
          actionLabel="Reintentar"
          onAction={() => void load(true)}
        />
      </SafeAreaView>
    );
  }

  const today = todayKey(budget.company?.timezone || undefined);
  const state = clientBudgetState(budget.status, budget.valid_until, today);
  const canRespond = state.key === "pending";
  const currency = budget.currency_code || budget.company?.currency_code;
  const validUntil = budget.valid_until?.slice(0, 10) ?? null;

  return (
    <SafeAreaView style={styles.safeArea} edges={["bottom"]}>
      <Stack.Screen options={{ title: budget.budget_number }} />
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void load(true)} />}
      >
        <View style={styles.hero}>
          <Text style={styles.number}>{budget.budget_number}</Text>
          <Text style={styles.title}>{budget.title}</Text>
          <Text style={styles.meta}>
            {[budget.project?.name, budget.company?.name].filter(Boolean).join(" · ") || "Sin proyecto"}
          </Text>
          <View style={styles.heroFooter}>
            <StatusPill label={state.label} tone={state.tone} />
            {validUntil && canRespond ? (
              <Text style={styles.validity}>
                Vigente hasta {formatShortDate(validUntil)} · {relativeDayLabel(validUntil, today)}
              </Text>
            ) : null}
          </View>
          <Text style={styles.heroTotal}>{formatMoney(budget.total, currency)}</Text>
        </View>

        {justResponded === "approved" || (!justResponded && budget.status === "approved") ? (
          <LeuretFeedback
            tone="success"
            title="Presupuesto aprobado"
            message={
              budget.approved_at
                ? `Lo aprobaste el ${formatShortDate(budget.approved_at)}. El contratista ya puede continuar.`
                : "El contratista ya puede continuar."
            }
          />
        ) : justResponded === "rejected" || budget.status === "rejected" ? (
          <LeuretFeedback
            tone="info"
            title="Pediste cambios"
            message="El contratista recibió tus comentarios. Te llegará un aviso cuando te envíe una versión nueva."
          />
        ) : state.key === "expired" ? (
          <LeuretFeedback
            tone="warning"
            title="Presupuesto vencido"
            message="Ya no está vigente. Escríbele al contratista para que te envíe una versión actualizada."
          />
        ) : null}

        {error ? <LeuretFeedback tone="error" title="No se pudo completar la acción" message={error} /> : null}

        {budget.description ? (
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Descripción</Text>
            <Text style={styles.body}>{budget.description}</Text>
          </View>
        ) : null}

        <View style={styles.card}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Detalle</Text>
            <Text style={styles.sectionMeta}>
              {budget.items.length} partida{budget.items.length === 1 ? "" : "s"}
            </Text>
          </View>

          {grouped.length === 0 ? <Text style={styles.empty}>Sin partidas.</Text> : null}

          {grouped.map((group) => {
            const groupTotal = group.items.reduce((sum, item) => sum + Number(item.subtotal || 0), 0);
            return (
              <View key={group.id} style={styles.group}>
                {grouped.length > 1 || group.id !== "loose" ? (
                  <View style={styles.groupHeader}>
                    <Text style={styles.groupName}>{group.name}</Text>
                    <Text style={styles.groupTotal}>{formatMoney(groupTotal, currency)}</Text>
                  </View>
                ) : null}
                {group.items.map((item) => (
                  <View key={item.id} style={styles.item}>
                    <View style={styles.itemInfo}>
                      <Text style={styles.itemTitle}>{item.description}</Text>
                      <Text style={styles.itemMeta}>
                        {item.quantity} {item.unit_name} × {formatMoney(item.unit_price, currency)}
                        {item.discount_percentage > 0 ? ` · ${item.discount_percentage}% desc.` : ""}
                      </Text>
                      {item.notes ? <Text style={styles.itemNote}>{item.notes}</Text> : null}
                    </View>
                    <Text style={styles.itemTotal}>{formatMoney(item.subtotal, currency)}</Text>
                  </View>
                ))}
              </View>
            );
          })}

          <View style={styles.totals}>
            <Row label="Subtotal" value={formatMoney(budget.subtotal, currency)} />
            {budget.discount_amount > 0 ? (
              <Row label="Descuento" value={`− ${formatMoney(budget.discount_amount, currency)}`} />
            ) : null}
            <Row label={`ITBMS ${budget.tax_rate}%`} value={formatMoney(budget.tax_amount, currency)} />
            <View style={styles.divider} />
            <Row label="Total" value={formatMoney(budget.total, currency)} strong />
          </View>
        </View>

        {budget.terms ? (
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Condiciones</Text>
            <Text style={styles.body}>{budget.terms}</Text>
          </View>
        ) : null}

        <LeuretButton
          label="Descargar o compartir PDF"
          icon="document-outline"
          variant="secondary"
          loading={sharing}
          onPress={() => void sharePdf()}
        />

        {canRespond ? (
          <View style={[styles.card, styles.decisionCard]}>
            <Text style={styles.sectionTitle}>Tu respuesta</Text>
            {requestingChanges ? (
              <>
                <Text style={styles.helper}>¿Qué te gustaría cambiar? Elige uno o más motivos.</Text>
                <View style={styles.reasons}>
                  {BUDGET_CHANGE_REASONS.map((reason) => {
                    const selected = selectedReasons.includes(reason);
                    return (
                      <Pressable
                        key={reason}
                        accessibilityRole="checkbox"
                        accessibilityState={{ checked: selected }}
                        onPress={() =>
                          setSelectedReasons((current) =>
                            selected ? current.filter((value) => value !== reason) : [...current, reason],
                          )
                        }
                        style={[styles.reason, selected && styles.reasonSelected]}
                      >
                        <Ionicons
                          name={selected ? "checkbox" : "square-outline"}
                          size={18}
                          color={selected ? colors.primary : colors.textMuted}
                        />
                        <Text style={styles.reasonText}>{reason}</Text>
                      </Pressable>
                    );
                  })}
                </View>
                <TextInput
                  value={details}
                  onChangeText={setDetails}
                  placeholder="Detalles para el contratista (opcional)"
                  placeholderTextColor={colors.textMuted}
                  multiline
                  maxLength={800}
                  style={styles.input}
                />
                <View style={styles.actions}>
                  <LeuretButton
                    label="Volver"
                    variant="secondary"
                    disabled={submitting}
                    onPress={() => setRequestingChanges(false)}
                    style={styles.action}
                  />
                  <LeuretButton
                    label="Enviar"
                    icon="send-outline"
                    loading={submitting}
                    onPress={() => void requestChanges()}
                    style={styles.action}
                  />
                </View>
              </>
            ) : (
              <>
                <Text style={styles.helper}>
                  Revisa el detalle. Si estás de acuerdo, apruébalo; si no, pide los cambios que necesites.
                </Text>
                <View style={styles.actions}>
                  <LeuretButton
                    label="Pedir cambios"
                    icon="create-outline"
                    variant="secondary"
                    disabled={submitting}
                    onPress={() => {
                      setError(null);
                      setRequestingChanges(true);
                    }}
                    style={styles.action}
                  />
                  <LeuretButton
                    label="Aprobar"
                    icon="checkmark-circle-outline"
                    loading={submitting}
                    onPress={() => void approve()}
                    style={styles.action}
                  />
                </View>
              </>
            )}
          </View>
        ) : null}

        {budget.company?.name ? (
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>¿Dudas? Escribe a {budget.company.name}</Text>
            <View style={styles.contact}>
              <ContactActions
                phone={budget.company.phone}
                email={budget.company.email}
                whatsappMessage={`Hola, tengo una consulta sobre el presupuesto ${budget.budget_number}.`}
                emailSubject={`Presupuesto ${budget.budget_number}`}
              />
            </View>
          </View>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

function Row({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return (
    <View style={styles.row}>
      <Text style={[styles.rowLabel, strong && styles.rowLabelStrong]}>{label}</Text>
      <Text style={[styles.rowValue, strong && styles.strong]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.background },
  centered: { flex: 1, padding: 20, justifyContent: "center", backgroundColor: colors.background },
  content: { padding: 20, paddingBottom: 48, gap: 16 },
  hero: { padding: 18, borderRadius: radius.lg, backgroundColor: colors.surfaceDark },
  number: { color: colors.textLightMuted, fontSize: 12, fontWeight: "900" },
  title: { marginTop: 4, color: colors.textLight, fontSize: 20, fontWeight: "900" },
  meta: { marginTop: 5, color: colors.textLightMuted, fontSize: 12, fontWeight: "700" },
  heroFooter: { marginTop: 12, flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 10 },
  validity: { color: colors.textLightMuted, fontSize: 12, fontWeight: "700" },
  heroTotal: { marginTop: 14, color: colors.textLight, fontSize: 28, fontWeight: "900" },
  card: { padding: 16, borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, backgroundColor: colors.surface },
  decisionCard: { borderColor: colors.accent, borderWidth: 1.5 },
  sectionHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  sectionTitle: { color: colors.text, fontSize: 16, fontWeight: "900" },
  sectionMeta: { color: colors.textSecondary, fontSize: 12, fontWeight: "700" },
  body: { marginTop: 8, color: colors.textSecondary, fontSize: 14, lineHeight: 20 },
  helper: { marginTop: 7, color: colors.textSecondary, fontSize: 13, lineHeight: 19 },
  group: { marginTop: 12 },
  groupHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: radius.sm,
    backgroundColor: colors.surfaceAlt,
  },
  groupName: { flex: 1, color: colors.text, fontSize: 13, fontWeight: "900" },
  groupTotal: { color: colors.text, fontSize: 13, fontWeight: "900" },
  item: { paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.divider, flexDirection: "row", gap: 12, alignItems: "flex-start" },
  itemInfo: { flex: 1 },
  itemTitle: { color: colors.text, fontSize: 13, fontWeight: "800" },
  itemMeta: { marginTop: 4, color: colors.textSecondary, fontSize: 11, fontWeight: "700" },
  itemNote: { marginTop: 4, color: colors.textSecondary, fontSize: 11, fontStyle: "italic" },
  itemTotal: { color: colors.text, fontSize: 13, fontWeight: "900" },
  totals: { marginTop: 12 },
  row: { paddingVertical: 6, flexDirection: "row", justifyContent: "space-between", gap: 12 },
  rowLabel: { color: colors.textSecondary, fontSize: 13, fontWeight: "700" },
  rowLabelStrong: { color: colors.text, fontWeight: "900" },
  rowValue: { color: colors.text, fontSize: 14, fontWeight: "900" },
  strong: { color: colors.accent, fontSize: 18 },
  divider: { height: 1, marginVertical: 5, backgroundColor: colors.divider },
  empty: { marginTop: 12, color: colors.textSecondary, fontSize: 13 },
  reasons: { marginTop: 12, gap: 8 },
  reason: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceRaised,
  },
  reasonSelected: { borderColor: colors.primary, backgroundColor: colors.primaryWash },
  reasonText: { flex: 1, color: colors.text, fontSize: 13, fontWeight: "700" },
  input: {
    minHeight: 88,
    marginTop: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceRaised,
    color: colors.text,
    textAlignVertical: "top",
  },
  actions: { marginTop: 16, flexDirection: "row", gap: 10 },
  action: { flex: 1 },
  contact: { marginTop: 12 },
});
