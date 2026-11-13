import { Ionicons } from "@expo/vector-icons";
import { type Href, router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { useCallback, useState } from "react";
import { Platform, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { StatusPill } from "@/components/client/StatusPill";
import { PhotoStrip } from "@/components/job-requests/PhotoStrip";
import { LeuretButton } from "@/components/LeuretButton";
import { LeuretFeedback } from "@/components/LeuretFeedback";
import { LeuretLoading } from "@/components/LeuretLoading";
import { colors, radius, shadows } from "@/constants/theme";
import {
  closeJobRequest,
  deleteJobRequestPhoto,
  getMyJobRequest,
  uploadJobRequestPhoto,
} from "@/services/job-request-service";
import type { ClientJobRequestDetail, JobRequestConversationSummary } from "@/types/job-request";
import { confirmAction, showAlert } from "@/utils/alert";
import { clientBudgetState, todayKey } from "@/utils/client-portal";
import { formatMoney } from "@/utils/format";
import {
  budgetRangeLabel,
  clientRequestState,
  daysLeft,
  locationLabel,
  timeAgo,
  timingLabel,
} from "@/utils/job-requests";
import { prepareProjectPhoto, type ProjectPhotoSource } from "@/utils/project-photo-picker";

function ConversationRow({ conversation, requestId }: { conversation: JobRequestConversationSummary; requestId: string }) {
  const last = conversation.last_message;
  const preview = last
    ? `${last.sender_side === "client" ? "Tú: " : ""}${last.body ?? (last.has_photo ? "📷 Foto" : "")}`
    : "Aún no hay mensajes.";
  const budgetState =
    conversation.budget_id && conversation.budget_status
      ? clientBudgetState(conversation.budget_status as Parameters<typeof clientBudgetState>[0], conversation.valid_until, todayKey())
      : null;

  return (
    <View style={styles.companyCard}>
      <Pressable
        onPress={() =>
          router.push({
            pathname: "/cliente-peticiones/conversacion",
            params: { requestId, companyId: conversation.company_id },
          } as Href)
        }
        accessibilityRole="button"
        accessibilityLabel={`Conversación con ${conversation.company_name}`}
        style={({ pressed }) => [styles.companyHeader, pressed && styles.pressed]}
      >
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{conversation.company_name.trim().charAt(0).toUpperCase()}</Text>
        </View>
        <View style={styles.companyInfo}>
          <Text style={styles.companyName} numberOfLines={1}>
            {conversation.company_name}
          </Text>
          <Text style={styles.preview} numberOfLines={1}>
            {preview}
          </Text>
        </View>
        <View style={styles.companyRight}>
          {conversation.last_message_at ? <Text style={styles.when}>{timeAgo(conversation.last_message_at)}</Text> : null}
          {conversation.unread_count > 0 ? (
            <View style={styles.unread}>
              <Text style={styles.unreadText}>{conversation.unread_count}</Text>
            </View>
          ) : (
            <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
          )}
        </View>
      </Pressable>

      {conversation.budget_id ? (
        <Pressable
          onPress={() =>
            router.push({ pathname: "/cliente-presupuestos/[id]", params: { id: conversation.budget_id! } } as Href)
          }
          accessibilityRole="button"
          accessibilityLabel={`Ver presupuesto ${conversation.budget_number ?? ""}`}
          style={({ pressed }) => [styles.quote, pressed && styles.pressed]}
        >
          <Ionicons name="document-text-outline" size={18} color={colors.primary} />
          <View style={styles.quoteInfo}>
            <Text style={styles.quoteTitle}>Presupuesto {conversation.budget_number}</Text>
            <Text style={styles.quoteTotal}>
              {formatMoney(conversation.budget_total ?? 0, conversation.currency_code ?? undefined)}
            </Text>
          </View>
          {budgetState ? <StatusPill label={budgetState.label} tone={budgetState.tone} /> : null}
        </Pressable>
      ) : null}
    </View>
  );
}

export default function ClientJobRequestDetailScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const [detail, setDetail] = useState<ClientJobRequestDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [closing, setClosing] = useState(false);

  const load = useCallback(
    async (showRefresh = false) => {
      if (!id) return;
      if (showRefresh) setRefreshing(true);
      const result = await getMyJobRequest(id);
      setError(result.error);
      if (result.detail) setDetail(result.detail);
      setLoading(false);
      setRefreshing(false);
    },
    [id],
  );

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const addPhoto = async (source: ProjectPhotoSource) => {
    if (!id) return;
    try {
      const photo = await prepareProjectPhoto(source);
      if (!photo) return;
      setUploading(true);
      const uploaded = await uploadJobRequestPhoto(id, { fileData: photo.fileData, mimeType: photo.mimeType });
      setDetail((current) => (current ? { ...current, photos: [...current.photos, uploaded] } : current));
    } catch (photoError) {
      showAlert("No se pudo agregar la foto", photoError instanceof Error ? photoError.message : "Inténtalo de nuevo.");
    } finally {
      setUploading(false);
    }
  };

  const choosePhotoSource = () => {
    if (Platform.OS === "web") {
      void addPhoto("library");
      return;
    }
    showAlert("Agregar foto", "¿De dónde quieres tomarla?", [
      { text: "Cancelar", style: "cancel" },
      { text: "Galería", onPress: () => void addPhoto("library") },
      { text: "Cámara", onPress: () => void addPhoto("camera") },
    ]);
  };

  const removePhoto = async (photoId: string) => {
    if (!id) return;
    const confirmed = await confirmAction({
      title: "Quitar foto",
      message: "Los contratistas dejarán de verla.",
      confirmText: "Quitar",
      destructive: true,
    });
    if (!confirmed) return;
    try {
      await deleteJobRequestPhoto(id, photoId);
      setDetail((current) =>
        current ? { ...current, photos: current.photos.filter((photo) => photo.id !== photoId) } : current,
      );
    } catch (photoError) {
      showAlert("No se pudo quitar la foto", photoError instanceof Error ? photoError.message : "Inténtalo de nuevo.");
    }
  };

  const close = async () => {
    if (!id) return;
    const confirmed = await confirmAction({
      title: "Cerrar petición",
      message: "Dejará de aparecer a los contratistas y no recibirás más presupuestos. Los que ya recibiste siguen en Presupuestos.",
      confirmText: "Cerrar petición",
      destructive: true,
    });
    if (!confirmed) return;
    setClosing(true);
    try {
      await closeJobRequest(id, null);
      await load();
    } catch (closeError) {
      showAlert("No se pudo cerrar", closeError instanceof Error ? closeError.message : "Inténtalo de nuevo.");
    } finally {
      setClosing(false);
    }
  };

  if (loading) return <LeuretLoading fullScreen message="Cargando petición…" />;

  if (!detail) {
    return (
      <View style={styles.center}>
        <LeuretFeedback
          tone="error"
          title="No pudimos abrir la petición"
          message={error ?? "Inténtalo de nuevo."}
          actionLabel="Reintentar"
          onAction={() => void load(true)}
        />
      </View>
    );
  }

  const { request, photos, conversations } = detail;
  const state = clientRequestState(request.effective_status);
  const isOpen = request.status === "open";
  const budget = budgetRangeLabel(request.budget_min, request.budget_max);
  const quotes = conversations.filter((conversation) => conversation.budget_id);

  return (
    <SafeAreaView style={styles.safeArea} edges={["left", "right", "bottom"]}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void load(true)} />}
      >
        <View style={styles.hero}>
          <Text style={styles.category}>{request.category}</Text>
          <Text style={styles.title}>{request.title}</Text>
          <View style={styles.pills}>
            <StatusPill label={state.label} tone={state.tone} />
            {request.effective_status === "open" ? (
              <Text style={styles.metaPill}>Vence en {daysLeft(request.expires_at)} días</Text>
            ) : null}
          </View>
          <View style={styles.stats}>
            <View style={styles.stat}>
              <Text style={styles.statValue}>
                {request.quotes_sent_count}/{request.max_quotes}
              </Text>
              <Text style={styles.statLabel}>presupuestos</Text>
            </View>
            <View style={styles.stat}>
              <Text style={styles.statValue}>{conversations.length}</Text>
              <Text style={styles.statLabel}>empresas interesadas</Text>
            </View>
          </View>
        </View>

        <Text style={styles.section}>Presupuestos y conversaciones</Text>
        {conversations.length === 0 ? (
          <View style={styles.card}>
            <Text style={styles.empty}>
              {isOpen
                ? "Te avisaremos cuando un contratista te escriba o te envíe un presupuesto."
                : "Esta petición no recibió respuestas."}
            </Text>
          </View>
        ) : (
          <>
            {quotes.length > 1 ? (
              <Text style={styles.compareHint}>Compara los presupuestos: ábrelos para ver partidas, vigencia y condiciones.</Text>
            ) : null}
            {conversations.map((conversation) => (
              <ConversationRow key={conversation.company_id} conversation={conversation} requestId={request.id} />
            ))}
          </>
        )}

        <Text style={styles.section}>Fotos</Text>
        <View style={styles.card}>
          <PhotoStrip
            photos={photos.map((photo) => ({ id: photo.id, uri: photo.signedUrl }))}
            {...(isOpen ? { onAdd: choosePhotoSource, onRemove: (photo: { id: string }) => void removePhoto(photo.id) } : {})}
            busy={uploading}
            emptyText="Sin fotos."
          />
        </View>

        <Text style={styles.section}>Detalle</Text>
        <View style={styles.card}>
          <Text style={styles.description}>{request.description}</Text>
          <View style={styles.divider} />
          <InfoRow icon="time-outline" label="Plazo" value={timingLabel(request.desired_timing)} />
          {budget ? <InfoRow icon="cash-outline" label="Presupuesto" value={budget} /> : null}
          <InfoRow icon="location-outline" label="Zona" value={locationLabel(request)} />
          {request.address_line ? (
            <InfoRow
              icon="lock-closed-outline"
              label="Dirección (privada)"
              value={[request.address_line, request.reference].filter(Boolean).join(" · ")}
            />
          ) : null}
          <InfoRow icon="calendar-outline" label="Publicada" value={timeAgo(request.created_at)} />
        </View>

        {request.closed_reason ? (
          <LeuretFeedback tone="info" title="Motivo del cierre" message={request.closed_reason} style={styles.feedback} />
        ) : null}

        {isOpen ? (
          <LeuretButton
            label="Cerrar petición"
            icon="close-circle-outline"
            variant="secondary"
            onPress={() => void close()}
            loading={closing}
            disabled={closing}
            fullWidth
            style={styles.closeButton}
          />
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

function InfoRow({
  icon,
  label,
  value,
}: {
  icon: React.ComponentProps<typeof Ionicons>["name"];
  label: string;
  value: string;
}) {
  return (
    <View style={styles.infoRow}>
      <Ionicons name={icon} size={16} color={colors.textMuted} />
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, padding: 20, justifyContent: "center", backgroundColor: colors.background },
  content: { padding: 20, paddingBottom: 48 },
  hero: { padding: 18, borderRadius: radius.lg, backgroundColor: colors.surfaceDark },
  category: { color: colors.sand, fontSize: 12, fontWeight: "900", textTransform: "uppercase" },
  title: { marginTop: 4, color: colors.textLight, fontSize: 22, fontWeight: "900" },
  pills: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 8, marginTop: 12 },
  metaPill: { color: colors.textLightMuted, fontSize: 12, fontWeight: "700" },
  stats: { flexDirection: "row", gap: 12, marginTop: 16 },
  stat: { flex: 1, padding: 12, borderRadius: radius.md, backgroundColor: colors.surfaceDarkRaised },
  statValue: { color: colors.textLight, fontSize: 20, fontWeight: "900" },
  statLabel: { color: colors.textLightMuted, fontSize: 12, fontWeight: "700", marginTop: 2 },
  section: { marginTop: 22, marginBottom: 10, color: colors.textSecondary, fontSize: 12, fontWeight: "900", textTransform: "uppercase" },
  card: { padding: 14, borderRadius: radius.lg, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  empty: { color: colors.textSecondary, fontSize: 14, fontWeight: "600", lineHeight: 20 },
  compareHint: { color: colors.textSecondary, fontSize: 12, fontWeight: "600", marginBottom: 10 },
  companyCard: {
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 10,
    overflow: "hidden",
    ...shadows.soft,
  },
  pressed: { backgroundColor: colors.surfaceRaised },
  companyHeader: { flexDirection: "row", alignItems: "center", gap: 12, padding: 14 },
  avatar: { width: 42, height: 42, borderRadius: 21, backgroundColor: colors.primarySoft, alignItems: "center", justifyContent: "center" },
  avatarText: { color: colors.primary, fontSize: 17, fontWeight: "900" },
  companyInfo: { flex: 1 },
  companyName: { color: colors.text, fontSize: 15, fontWeight: "800" },
  preview: { marginTop: 2, color: colors.textSecondary, fontSize: 13, fontWeight: "600" },
  companyRight: { alignItems: "flex-end", gap: 4 },
  when: { color: colors.textMuted, fontSize: 11, fontWeight: "700" },
  unread: { minWidth: 22, height: 22, borderRadius: 11, paddingHorizontal: 6, backgroundColor: colors.accent, alignItems: "center", justifyContent: "center" },
  unreadText: { color: colors.textInverse, fontSize: 11, fontWeight: "900" },
  quote: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: colors.primaryWash,
    borderTopWidth: 1,
    borderTopColor: colors.divider,
  },
  quoteInfo: { flex: 1 },
  quoteTitle: { color: colors.textSecondary, fontSize: 12, fontWeight: "800" },
  quoteTotal: { color: colors.text, fontSize: 17, fontWeight: "900" },
  description: { color: colors.text, fontSize: 15, lineHeight: 22 },
  divider: { height: 1, backgroundColor: colors.divider, marginVertical: 12 },
  infoRow: { flexDirection: "row", alignItems: "flex-start", gap: 8, paddingVertical: 5 },
  infoLabel: { width: 118, color: colors.textSecondary, fontSize: 13, fontWeight: "700" },
  infoValue: { flex: 1, color: colors.text, fontSize: 13, fontWeight: "700" },
  feedback: { marginTop: 16 },
  closeButton: { marginTop: 22 },
});
