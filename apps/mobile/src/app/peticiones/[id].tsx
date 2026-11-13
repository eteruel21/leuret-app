import { Ionicons } from "@expo/vector-icons";
import { type Href, router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { useCallback, useState } from "react";
import { RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { StatusPill } from "@/components/client/StatusPill";
import { PhotoStrip } from "@/components/job-requests/PhotoStrip";
import { LeuretButton } from "@/components/LeuretButton";
import { LeuretFeedback } from "@/components/LeuretFeedback";
import { LeuretLoading } from "@/components/LeuretLoading";
import { colors, radius } from "@/constants/theme";
import { useCompany } from "@/contexts/CompanyContext";
import { usePermissions } from "@/hooks/usePermissions";
import { getContractorJobRequest, startJobRequestQuote } from "@/services/job-request-service";
import type { ContractorJobRequestDetail } from "@/types/job-request";
import { confirmAction, showAlert } from "@/utils/alert";
import { formatMoney } from "@/utils/format";
import {
  budgetRangeLabel,
  contractorRequestState,
  daysLeft,
  locationLabel,
  timeAgo,
  timingLabel,
} from "@/utils/job-requests";

type IconName = React.ComponentProps<typeof Ionicons>["name"];

function InfoRow({ icon, label, value }: { icon: IconName; label: string; value: string }) {
  return (
    <View style={styles.infoRow}>
      <Ionicons name={icon} size={16} color={colors.textMuted} />
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>{value}</Text>
    </View>
  );
}

export default function ContractorJobRequestDetailScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { activeCompany } = useCompany();
  const { can } = usePermissions();
  const companyId = activeCompany?.id;
  const [detail, setDetail] = useState<ContractorJobRequestDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);

  const load = useCallback(
    async (showRefresh = false) => {
      if (!id || !companyId) return;
      if (showRefresh) setRefreshing(true);
      const result = await getContractorJobRequest(companyId, id);
      setError(result.error);
      setDetail(result.detail);
      setLoading(false);
      setRefreshing(false);
    },
    [id, companyId],
  );

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const openConversation = () => {
    if (!id || !companyId) return;
    router.push({ pathname: "/peticiones/conversacion", params: { requestId: id, companyId } } as Href);
  };

  const openBudget = (budgetId: string) => router.push({ pathname: "/presupuestos/[id]", params: { id: budgetId } } as Href);

  const prepareQuote = async () => {
    if (!id || !companyId) return;
    const confirmed = await confirmAction({
      title: "Preparar presupuesto",
      message:
        "Se crea el cliente, la obra y un presupuesto en borrador en tu empresa. Agrega las partidas (puedes usar las calculadoras) y envíalo: al enviarlo recibirás la dirección, el teléfono y el correo del cliente.",
      confirmText: "Preparar",
    });
    if (!confirmed) return;

    setStarting(true);
    try {
      const budgetId = await startJobRequestQuote(companyId, id);
      openBudget(budgetId);
    } catch (startError) {
      showAlert("No se pudo preparar el presupuesto", startError instanceof Error ? startError.message : "Inténtalo de nuevo.");
      void load();
    } finally {
      setStarting(false);
    }
  };

  if (loading) return <LeuretLoading fullScreen message="Cargando petición…" />;

  if (!detail) {
    return (
      <View style={styles.center}>
        <LeuretFeedback
          tone="error"
          title="No pudimos abrir la petición"
          message={error ?? "Puede que se haya cerrado o llegado al máximo de presupuestos."}
          actionLabel="Volver a la lista"
          onAction={() => router.replace("/peticiones" as Href)}
        />
      </View>
    );
  }

  const { request, photos, quote } = detail;
  const state = contractorRequestState({
    effectiveStatus: request.effective_status,
    quoteStatus: quote?.status ?? null,
    awardedToMe: request.awarded_to_me,
  });
  const budget = budgetRangeLabel(request.budget_min, request.budget_max);
  const canQuote = can("jobRequests.quote");
  const revealed = Boolean(request.address_line);

  return (
    <SafeAreaView style={styles.safeArea} edges={["left", "right", "bottom"]}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void load(true)} />}
      >
        <View style={styles.hero}>
          <View style={styles.heroTop}>
            <Text style={styles.category}>{request.category}</Text>
            {request.matches_profile ? <Text style={styles.match}>Para ti</Text> : null}
          </View>
          <Text style={styles.title}>{request.title}</Text>
          <Text style={styles.client}>
            <Ionicons name="person-outline" size={13} color={colors.textLightMuted} /> {request.requester_first_name} ·{" "}
            {locationLabel(request)}
          </Text>
          <View style={styles.pills}>
            <StatusPill label={state.label} tone={state.tone} />
            <Text style={styles.heroMeta}>
              {request.accepting_quotes
                ? `Quedan ${request.slots_left} de ${request.max_quotes} cupos · vence en ${daysLeft(request.expires_at)} días`
                : `${request.quotes_sent_count}/${request.max_quotes} presupuestos`}
            </Text>
          </View>
        </View>

        {quote ? (
          <View style={styles.quoteCard}>
            <View style={styles.quoteRow}>
              <Ionicons name="document-text-outline" size={20} color={colors.primary} />
              <View style={styles.quoteInfo}>
                <Text style={styles.quoteLabel}>Tu presupuesto {quote.budget_number}</Text>
                <Text style={styles.quoteTotal}>{formatMoney(quote.budget_total, quote.currency_code)}</Text>
              </View>
            </View>
            {!quote.sent_at ? (
              <Text style={styles.quoteHint}>
                Está en borrador: el cliente no lo ve hasta que lo envíes.
                {request.accepting_quotes ? "" : " La petición ya no recibe presupuestos."}
              </Text>
            ) : null}
            <View style={styles.actions}>
              <LeuretButton label="Abrir presupuesto" icon="open-outline" onPress={() => openBudget(quote.budget_id)} style={styles.flex} />
              {quote.sent_at ? (
                <LeuretButton
                  label="Ver cliente"
                  icon="person-outline"
                  variant="secondary"
                  onPress={() => router.push({ pathname: "/clientes/[id]", params: { id: quote.client_id } } as Href)}
                  style={styles.flex}
                />
              ) : null}
            </View>
          </View>
        ) : null}

        <View style={styles.actions}>
          <LeuretButton
            label="Preguntar al cliente"
            icon="chatbubbles-outline"
            variant={quote || !canQuote || !request.accepting_quotes ? "primary" : "secondary"}
            onPress={openConversation}
            style={styles.flex}
          />
          {!quote && canQuote && request.accepting_quotes ? (
            <LeuretButton
              label="Preparar presupuesto"
              icon="calculator-outline"
              onPress={() => void prepareQuote()}
              loading={starting}
              disabled={starting}
              style={styles.flex}
            />
          ) : null}
        </View>
        {!canQuote ? (
          <Text style={styles.note}>Tu rol puede conversar con el cliente; el presupuesto lo prepara un presupuestista o administrador.</Text>
        ) : null}

        <Text style={styles.section}>Fotos</Text>
        <View style={styles.card}>
          <PhotoStrip photos={photos.map((photo) => ({ id: photo.id, uri: photo.signedUrl }))} emptyText="El cliente no agregó fotos. Puedes pedírselas en la conversación." />
        </View>

        <Text style={styles.section}>Trabajo</Text>
        <View style={styles.card}>
          <Text style={styles.description}>{request.description}</Text>
          <View style={styles.divider} />
          <InfoRow icon="time-outline" label="Plazo" value={timingLabel(request.desired_timing)} />
          {budget ? <InfoRow icon="cash-outline" label="Presupuesto del cliente" value={budget} /> : null}
          <InfoRow icon="location-outline" label="Zona" value={locationLabel(request)} />
          <InfoRow
            icon={revealed ? "home-outline" : "lock-closed-outline"}
            label="Dirección"
            value={
              revealed
                ? [request.address_line, request.reference].filter(Boolean).join(" · ")
                : "Se muestra cuando envíes tu presupuesto."
            }
          />
          <InfoRow icon="calendar-outline" label="Publicada" value={timeAgo(request.created_at)} />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, padding: 20, justifyContent: "center", backgroundColor: colors.background },
  content: { padding: 20, paddingBottom: 48 },
  flex: { flex: 1 },
  hero: { padding: 18, borderRadius: radius.lg, backgroundColor: colors.surfaceDark },
  heroTop: { flexDirection: "row", alignItems: "center", gap: 8 },
  category: { color: colors.sand, fontSize: 12, fontWeight: "900", textTransform: "uppercase" },
  match: {
    color: colors.success,
    backgroundColor: colors.successSoft,
    fontSize: 10,
    fontWeight: "900",
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: radius.full,
    overflow: "hidden",
  },
  title: { marginTop: 4, color: colors.textLight, fontSize: 22, fontWeight: "900" },
  client: { marginTop: 6, color: colors.textLightMuted, fontSize: 13, fontWeight: "700" },
  pills: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 8, marginTop: 12 },
  heroMeta: { color: colors.textLightMuted, fontSize: 12, fontWeight: "700", flexShrink: 1 },
  quoteCard: {
    marginTop: 16,
    padding: 14,
    borderRadius: radius.lg,
    backgroundColor: colors.primaryWash,
    borderWidth: 1,
    borderColor: colors.primarySoft,
  },
  quoteRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  quoteInfo: { flex: 1 },
  quoteLabel: { color: colors.textSecondary, fontSize: 12, fontWeight: "800" },
  quoteTotal: { color: colors.text, fontSize: 19, fontWeight: "900" },
  quoteHint: { marginTop: 8, color: colors.textSecondary, fontSize: 12, fontWeight: "600", lineHeight: 18 },
  actions: { flexDirection: "row", gap: 10, marginTop: 16 },
  note: { marginTop: 8, color: colors.textSecondary, fontSize: 12, fontWeight: "600" },
  section: { marginTop: 22, marginBottom: 10, color: colors.textSecondary, fontSize: 12, fontWeight: "900", textTransform: "uppercase" },
  card: { padding: 14, borderRadius: radius.lg, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  description: { color: colors.text, fontSize: 15, lineHeight: 22 },
  divider: { height: 1, backgroundColor: colors.divider, marginVertical: 12 },
  infoRow: { flexDirection: "row", alignItems: "flex-start", gap: 8, paddingVertical: 5 },
  infoLabel: { width: 130, color: colors.textSecondary, fontSize: 13, fontWeight: "700" },
  infoValue: { flex: 1, color: colors.text, fontSize: 13, fontWeight: "700" },
});
