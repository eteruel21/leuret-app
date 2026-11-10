import { Ionicons } from "@expo/vector-icons";
import { type Href, Stack, router, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { Image, Modal, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { ContactActions } from "@/components/client/ContactActions";
import { StatusPill } from "@/components/client/StatusPill";
import { LeuretFeedback } from "@/components/LeuretFeedback";
import { LeuretLoading } from "@/components/LeuretLoading";
import { MotionPressable } from "@/components/MotionPressable";
import { colors, radius } from "@/constants/theme";
import { API_URL } from "@/services/api";
import { getClientProject, type ClientActivity, type ClientProjectDetail } from "@/services/client-portal-service";
import { getProjectStatusLabel } from "@/types/project";
import {
  clientBudgetState,
  clientInvoiceState,
  daysUntil,
  projectStatusTone,
  relativeDayLabel,
  shortMonth,
  todayKey,
} from "@/utils/client-portal";
import { formatMoney, formatShortDate } from "@/utils/format";

type Tab = "progress" | "photos" | "visits" | "documents";

const ACTIVITY_LABELS: Record<ClientActivity["type"], string> = {
  visit: "Visita",
  meeting: "Reunión",
  work: "Trabajo en obra",
  payment: "Cobro",
  other: "Actividad",
};

function photoUrl(signedUrl: string) {
  return signedUrl.startsWith("http") ? signedUrl : `${API_URL}${signedUrl}`;
}

export default function ClientProjectDetailScreen() {
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const projectId = Array.isArray(params.id) ? params.id[0] : params.id;
  const [project, setProject] = useState<ClientProjectDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("progress");
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);

  const load = useCallback(
    async (showRefresh = false) => {
      if (!projectId) {
        setLoading(false);
        return;
      }
      if (showRefresh) setRefreshing(true);
      const result = await getClientProject(projectId);
      if (result.project) setProject(result.project);
      setError(result.error);
      setLoading(false);
      setRefreshing(false);
    },
    [projectId],
  );

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) return <LeuretLoading message="Cargando proyecto…" fullScreen />;

  if (!projectId || !project) {
    return (
      <SafeAreaView style={styles.centered}>
        <LeuretFeedback
          tone="error"
          title="Proyecto no disponible"
          message={error || "No encontramos este proyecto."}
          actionLabel="Reintentar"
          onAction={() => void load(true)}
        />
      </SafeAreaView>
    );
  }

  const progress = Math.max(0, Math.min(100, Math.round(project.progress_percentage || 0)));
  const today = todayKey(project.company.timezone || undefined);
  const upcoming = project.activities.filter((activity) => activity.date >= today && activity.status !== "completed");
  const past = project.activities.filter((activity) => !upcoming.includes(activity)).reverse();
  const endDate = project.actual_end_date ?? project.estimated_end_date;
  const viewerPhoto = viewerIndex !== null ? project.photos[viewerIndex] : null;

  const tabs: { value: Tab; label: string; count: number }[] = [
    { value: "progress", label: "Avance", count: project.progress_history.length },
    { value: "photos", label: "Fotos", count: project.photos.length },
    { value: "visits", label: "Visitas", count: upcoming.length },
    { value: "documents", label: "Documentos", count: project.budgets.length + project.invoices.length },
  ];

  return (
    <SafeAreaView style={styles.safeArea} edges={["bottom"]}>
      <Stack.Screen options={{ title: project.name }} />
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void load(true)} />}
      >
        <View style={styles.hero}>
          <View style={styles.heroTop}>
            <View style={styles.heroInfo}>
              <Text style={styles.code}>{project.project_code || "PROYECTO"}</Text>
              <Text style={styles.title}>{project.name}</Text>
              <Text style={styles.meta}>{project.company.name}</Text>
            </View>
            <StatusPill label={getProjectStatusLabel(project.status)} tone={projectStatusTone(project.status)} />
          </View>

          <View style={styles.progressRow}>
            <Text style={styles.progressBig}>{progress}%</Text>
            <Text style={styles.progressCaption}>de avance</Text>
          </View>
          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: `${progress}%` }]} />
          </View>

          <View style={styles.datesRow}>
            <HeroDate label="Inicio" value={project.start_date} />
            <HeroDate label={project.actual_end_date ? "Entregado" : "Entrega estimada"} value={endDate} />
          </View>
        </View>

        {project.description ? <Text style={styles.description}>{project.description}</Text> : null}

        {error ? <LeuretFeedback tone="error" title="No se pudo actualizar" message={error} /> : null}

        <View style={styles.tabs} accessibilityRole="tablist">
          {tabs.map((option) => {
            const selected = option.value === tab;
            return (
              <Pressable
                key={option.value}
                accessibilityRole="tab"
                accessibilityState={{ selected }}
                onPress={() => setTab(option.value)}
                style={[styles.tab, selected && styles.tabSelected]}
              >
                <Text style={[styles.tabText, selected && styles.tabTextSelected]}>{option.label}</Text>
                {option.count > 0 ? (
                  <Text style={[styles.tabCount, selected && styles.tabTextSelected]}>{option.count}</Text>
                ) : null}
              </Pressable>
            );
          })}
        </View>

        {tab === "progress" ? (
          <View style={styles.card}>
            {project.progress_history.length === 0 ? (
              <Text style={styles.empty}>El contratista todavía no ha registrado avances.</Text>
            ) : (
              project.progress_history.map((entry, index) => {
                const delta = Math.round(entry.progress_percentage - entry.previous_percentage);
                return (
                  <View key={entry.id} style={styles.timelineItem}>
                    <View style={styles.timelineRail}>
                      <View style={[styles.timelineDot, index === 0 && styles.timelineDotCurrent]} />
                      {index < project.progress_history.length - 1 ? <View style={styles.timelineLine} /> : null}
                    </View>
                    <View style={styles.timelineBody}>
                      <View style={styles.timelineHeader}>
                        <Text style={styles.timelineValue}>{Math.round(entry.progress_percentage)}%</Text>
                        {delta !== 0 ? (
                          <Text style={[styles.delta, delta < 0 && styles.deltaDown]}>
                            {delta > 0 ? `+${delta}` : delta} pts
                          </Text>
                        ) : null}
                        <Text style={styles.timelineDate}>{formatShortDate(entry.created_at)}</Text>
                      </View>
                      {entry.notes ? <Text style={styles.timelineNotes}>{entry.notes}</Text> : null}
                    </View>
                  </View>
                );
              })
            )}
          </View>
        ) : null}

        {tab === "photos" ? (
          project.photos.length === 0 ? (
            <View style={styles.card}>
              <Text style={styles.empty}>Aún no hay fotos compartidas de la obra.</Text>
            </View>
          ) : (
            <View style={styles.photoGrid}>
              {project.photos.map((photo, index) => (
                <Pressable
                  key={photo.id}
                  onPress={() => setViewerIndex(index)}
                  accessibilityRole="imagebutton"
                  accessibilityLabel={photo.caption || "Foto de la obra"}
                  style={styles.photoCard}
                >
                  <Image source={{ uri: photoUrl(photo.signedUrl) }} style={styles.photo} resizeMode="cover" />
                  <View style={styles.photoInfo}>
                    <Text style={styles.photoCaption} numberOfLines={1}>
                      {photo.caption || "Foto de avance"}
                    </Text>
                    <Text style={styles.photoDate}>{formatShortDate(photo.created_at)}</Text>
                  </View>
                </Pressable>
              ))}
            </View>
          )
        ) : null}

        {tab === "visits" ? (
          <View style={styles.card}>
            {upcoming.length === 0 && past.length === 0 ? (
              <Text style={styles.empty}>No hay visitas programadas.</Text>
            ) : null}
            {upcoming.map((activity) => (
              <ActivityRow key={activity.id} activity={activity} today={today} />
            ))}
            {past.length > 0 ? <Text style={styles.subheading}>Anteriores</Text> : null}
            {past.slice(0, 10).map((activity) => (
              <ActivityRow key={activity.id} activity={activity} today={today} muted />
            ))}
          </View>
        ) : null}

        {tab === "documents" ? (
          <View style={styles.card}>
            <Text style={styles.subheadingFirst}>Presupuestos</Text>
            {project.budgets.length === 0 ? <Text style={styles.emptyInline}>Sin presupuestos.</Text> : null}
            {project.budgets.map((budget) => {
              const state = clientBudgetState(budget.status, budget.valid_until, today);
              return (
                <MotionPressable
                  key={budget.id}
                  pressedScale={0.985}
                  onPress={() => router.push({ pathname: "/cliente-presupuestos/[id]", params: { id: budget.id } } as Href)}
                  style={styles.docRow}
                >
                  <Ionicons name="document-text-outline" size={20} color={colors.primary} />
                  <View style={styles.docInfo}>
                    <Text style={styles.docTitle} numberOfLines={1}>
                      {budget.budget_number} · {budget.title}
                    </Text>
                    <Text style={styles.docMeta}>{formatMoney(budget.total, budget.currency_code)}</Text>
                  </View>
                  <StatusPill label={state.label} tone={state.tone} />
                </MotionPressable>
              );
            })}

            <Text style={styles.subheading}>Facturas</Text>
            {project.invoices.length === 0 ? <Text style={styles.emptyInline}>Sin facturas.</Text> : null}
            {project.invoices.map((invoice) => {
              const state = clientInvoiceState(invoice);
              return (
                <MotionPressable
                  key={invoice.id}
                  pressedScale={0.985}
                  onPress={() => router.push({ pathname: "/cliente-facturas/[id]", params: { id: invoice.id } } as Href)}
                  style={styles.docRow}
                >
                  <Ionicons name="receipt-outline" size={20} color={colors.primary} />
                  <View style={styles.docInfo}>
                    <Text style={styles.docTitle} numberOfLines={1}>
                      {invoice.invoice_number}
                    </Text>
                    <Text style={styles.docMeta}>
                      {state.key === "paid"
                        ? formatMoney(invoice.adjusted_total_amount, invoice.currency_code)
                        : `Saldo ${formatMoney(invoice.balance_due, invoice.currency_code)}`}
                    </Text>
                  </View>
                  <StatusPill label={state.label} tone={state.tone} />
                </MotionPressable>
              );
            })}
          </View>
        ) : null}

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Contacto de {project.company.name}</Text>
          <View style={styles.contact}>
            <ContactActions
              phone={project.company.phone}
              email={project.company.email}
              whatsappMessage={`Hola, te escribo por el proyecto ${project.name}.`}
              emailSubject={`Proyecto ${project.name}`}
            />
          </View>
        </View>
      </ScrollView>

      <Modal
        visible={viewerPhoto !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setViewerIndex(null)}
      >
        <View style={styles.viewer}>
          <Pressable style={styles.viewerClose} onPress={() => setViewerIndex(null)} accessibilityLabel="Cerrar foto" hitSlop={12}>
            <Ionicons name="close" size={28} color={colors.textInverse} />
          </Pressable>
          {viewerPhoto ? (
            <>
              <Image source={{ uri: photoUrl(viewerPhoto.signedUrl) }} style={styles.viewerImage} resizeMode="contain" />
              <Text style={styles.viewerCaption}>
                {viewerPhoto.caption || "Foto de avance"} · {formatShortDate(viewerPhoto.created_at)}
              </Text>
              <View style={styles.viewerNav}>
                <Pressable
                  disabled={viewerIndex === 0}
                  onPress={() => setViewerIndex((index) => (index === null ? null : Math.max(0, index - 1)))}
                  accessibilityLabel="Foto anterior"
                  style={[styles.viewerButton, viewerIndex === 0 && styles.disabled]}
                >
                  <Ionicons name="chevron-back" size={24} color={colors.textInverse} />
                </Pressable>
                <Text style={styles.viewerCount}>
                  {(viewerIndex ?? 0) + 1} / {project.photos.length}
                </Text>
                <Pressable
                  disabled={viewerIndex === project.photos.length - 1}
                  onPress={() =>
                    setViewerIndex((index) => (index === null ? null : Math.min(project.photos.length - 1, index + 1)))
                  }
                  accessibilityLabel="Foto siguiente"
                  style={[styles.viewerButton, viewerIndex === project.photos.length - 1 && styles.disabled]}
                >
                  <Ionicons name="chevron-forward" size={24} color={colors.textInverse} />
                </Pressable>
              </View>
            </>
          ) : null}
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function HeroDate({ label, value }: { label: string; value: string | null }) {
  return (
    <View style={styles.heroDate}>
      <Text style={styles.heroDateLabel}>{label}</Text>
      <Text style={styles.heroDateValue}>{value ? formatShortDate(value) : "Por definir"}</Text>
    </View>
  );
}

function ActivityRow({ activity, today, muted = false }: { activity: ClientActivity; today: string; muted?: boolean }) {
  const days = daysUntil(activity.date, today);
  return (
    <View style={[styles.activity, muted && styles.activityMuted]}>
      <View style={styles.activityDate}>
        <Text style={styles.activityDay}>{activity.date.slice(8, 10)}</Text>
        <Text style={styles.activityMonth}>{shortMonth(activity.date)}</Text>
      </View>
      <View style={styles.docInfo}>
        <Text style={styles.docTitle}>{activity.title}</Text>
        <Text style={styles.docMeta}>
          {ACTIVITY_LABELS[activity.type] ?? "Actividad"} · {activity.start_time}
          {activity.end_time ? `–${activity.end_time}` : ""}
          {!muted && days >= 0 ? ` · ${relativeDayLabel(activity.date, today)}` : ""}
        </Text>
        {activity.address ? <Text style={styles.docMeta}>{activity.address}</Text> : null}
      </View>
      {activity.status === "confirmed" ? <StatusPill label="Confirmada" tone="success" /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.background },
  centered: { flex: 1, padding: 20, justifyContent: "center", backgroundColor: colors.background },
  content: { padding: 20, paddingBottom: 48, gap: 16 },
  hero: { padding: 18, borderRadius: radius.lg, backgroundColor: colors.surfaceDark },
  heroTop: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  heroInfo: { flex: 1 },
  code: { color: colors.textLightMuted, fontSize: 11, fontWeight: "900", textTransform: "uppercase" },
  title: { marginTop: 4, color: colors.textLight, fontSize: 20, fontWeight: "900" },
  meta: { marginTop: 4, color: colors.textLightMuted, fontSize: 12, fontWeight: "700" },
  progressRow: { marginTop: 18, flexDirection: "row", alignItems: "baseline", gap: 8 },
  progressBig: { color: colors.textLight, fontSize: 36, fontWeight: "900" },
  progressCaption: { color: colors.textLightMuted, fontSize: 13, fontWeight: "700" },
  progressTrack: { marginTop: 8, height: 10, borderRadius: 5, backgroundColor: colors.surfaceDarkRaised, overflow: "hidden" },
  progressFill: { height: "100%", borderRadius: 5, backgroundColor: colors.success },
  datesRow: { marginTop: 16, flexDirection: "row", gap: 12 },
  heroDate: { flex: 1 },
  heroDateLabel: { color: colors.textLightMuted, fontSize: 11, fontWeight: "800" },
  heroDateValue: { marginTop: 2, color: colors.textLight, fontSize: 14, fontWeight: "900" },
  description: { color: colors.textSecondary, fontSize: 14, lineHeight: 20 },
  tabs: { flexDirection: "row", padding: 4, gap: 4, borderRadius: radius.md, backgroundColor: colors.surfaceAlt },
  tab: { flex: 1, minHeight: 38, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 4, borderRadius: radius.sm },
  tabSelected: { backgroundColor: colors.surfaceRaised },
  tabText: { color: colors.textSecondary, fontSize: 12, fontWeight: "800" },
  tabTextSelected: { color: colors.text },
  tabCount: { color: colors.textMuted, fontSize: 11, fontWeight: "900" },
  card: { padding: 16, borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, backgroundColor: colors.surface },
  sectionTitle: { color: colors.text, fontSize: 16, fontWeight: "900" },
  empty: { color: colors.textSecondary, fontSize: 13, textAlign: "center", paddingVertical: 12 },
  emptyInline: { marginTop: 6, color: colors.textSecondary, fontSize: 13 },
  subheadingFirst: { color: colors.text, fontSize: 14, fontWeight: "900" },
  subheading: { marginTop: 18, color: colors.text, fontSize: 14, fontWeight: "900" },
  timelineItem: { flexDirection: "row", gap: 12 },
  timelineRail: { width: 14, alignItems: "center" },
  timelineDot: { width: 12, height: 12, marginTop: 4, borderRadius: 6, backgroundColor: colors.steel },
  timelineDotCurrent: { backgroundColor: colors.success },
  timelineLine: { flex: 1, width: 2, marginTop: 2, backgroundColor: colors.divider },
  timelineBody: { flex: 1, paddingBottom: 18 },
  timelineHeader: { flexDirection: "row", alignItems: "center", gap: 8 },
  timelineValue: { color: colors.text, fontSize: 15, fontWeight: "900" },
  delta: { color: colors.success, fontSize: 12, fontWeight: "800" },
  deltaDown: { color: colors.danger },
  timelineDate: { marginLeft: "auto", color: colors.textSecondary, fontSize: 12, fontWeight: "700" },
  timelineNotes: { marginTop: 4, color: colors.textSecondary, fontSize: 13, lineHeight: 19 },
  photoGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  photoCard: { width: "48%", borderRadius: radius.md, overflow: "hidden", borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  photo: { width: "100%", height: 130, backgroundColor: colors.border },
  photoInfo: { padding: 8 },
  photoCaption: { color: colors.text, fontSize: 12, fontWeight: "700" },
  photoDate: { marginTop: 2, color: colors.textSecondary, fontSize: 11 },
  activity: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.divider },
  activityMuted: { opacity: 0.6 },
  activityDate: { width: 48, height: 52, borderRadius: radius.md, alignItems: "center", justifyContent: "center", backgroundColor: colors.primaryWash },
  activityDay: { color: colors.primary, fontSize: 18, fontWeight: "900" },
  activityMonth: { color: colors.primary, fontSize: 10, fontWeight: "800", textTransform: "uppercase" },
  docRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.divider },
  docInfo: { flex: 1 },
  docTitle: { color: colors.text, fontSize: 13, fontWeight: "800" },
  docMeta: { marginTop: 3, color: colors.textSecondary, fontSize: 12, fontWeight: "600" },
  contact: { marginTop: 12 },
  viewer: { flex: 1, backgroundColor: "rgba(10, 14, 20, 0.94)", justifyContent: "center", padding: 16 },
  viewerClose: { position: "absolute", top: 48, right: 20, zIndex: 2 },
  viewerImage: { width: "100%", height: "70%" },
  viewerCaption: { marginTop: 14, color: colors.textInverse, fontSize: 14, fontWeight: "700", textAlign: "center" },
  viewerNav: { marginTop: 16, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 24 },
  viewerButton: { width: 48, height: 48, borderRadius: 24, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,255,255,0.12)" },
  viewerCount: { color: colors.textInverse, fontSize: 13, fontWeight: "800" },
  disabled: { opacity: 0.3 },
});
