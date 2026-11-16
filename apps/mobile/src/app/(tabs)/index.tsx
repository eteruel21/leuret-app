import { Ionicons } from "@expo/vector-icons";
import { router, type Href } from "expo-router";
import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { LeuretBrand } from "@/components/LeuretBrand";
import { LeuretFeedback } from "@/components/LeuretFeedback";
import { LeuretLoading } from "@/components/LeuretLoading";
import { NotificationsBell } from "@/components/notifications/NotificationsBell";
import Animated, {
  FadeIn,
  FadeInDown,
  FadeInUp,
} from "react-native-reanimated";
import { SafeAreaView } from "react-native-safe-area-context";

import {
  colors,
  layout,
  radius,
  shadows,
  spacing,
  typography,
} from "@/constants/theme";
import { UserAvatar } from "@/components/UserAvatar";
import { useAuth } from "@/contexts/AuthContext";
import { useCompany } from "@/contexts/CompanyContext";
import { OnboardingChecklist } from "@/components/OnboardingChecklist";
import { OwnerDashboard } from "@/components/OwnerDashboard";
import { RoleDashboard } from "@/components/RoleDashboard";
import { useFocusedResource } from "@/hooks/useFocusedResource";
import { useJobRequestsHomeSummary } from "@/hooks/useJobRequestsHomeSummary";
import { usePermissions } from "@/hooks/usePermissions";
import {
  ROLE_LABELS,
  quickActionsFor,
  type QuickActionId,
} from "@/permissions/permissions";
import { fetchCompanyActivities } from "@/services/activity-service";
import { listClients } from "@/services/client-service";
import { listInvoices } from "@/services/invoice-service";
import { listProjectsByCompany } from "@/services/project-service";
import type { Appointment } from "@/utils/appointment-storage";
import { FocusAwareStatusBar } from "@/components/FocusAwareStatusBar";

type IconName = React.ComponentProps<typeof Ionicons>["name"];

type QuickActionProps = {
  icon: IconName;
  title: string;
  subtitle: string;
  onPress: () => void;
  delay?: number;
  /** Número a destacar junto a la flecha (p. ej. peticiones nuevas). */
  badge?: number;
};

const QUICK_ACTIONS: Record<
  QuickActionId,
  { icon: IconName; title: string; subtitle: string; href: Href }
> = {
  calculate: { icon: "calculator-outline", title: "Calcular", subtitle: "Materiales y mano de obra", href: "/calculos" as Href },
  budget: { icon: "document-text-outline", title: "Presupuesto", subtitle: "Crear una cotización", href: "/presupuestos" as Href },
  project: { icon: "business-outline", title: "Proyectos", subtitle: "Obras, tareas y avances", href: "/proyectos" as Href },
  client: { icon: "person-add-outline", title: "Clientes", subtitle: "Gestionar contactos", href: "/(tabs)/clientes" as Href },
  agenda: { icon: "calendar-outline", title: "Agenda", subtitle: "Visitas y trabajos", href: "/(tabs)/agenda" as Href },
  invoices: { icon: "receipt-outline", title: "Facturas", subtitle: "Cobros y saldos", href: "/facturas" as Href },
  tasks: { icon: "checkbox-outline", title: "Mis tareas", subtitle: "Lo que tienes asignado", href: "/tareas" as Href },
};

function QuickAction({
  icon,
  title,
  subtitle,
  onPress,
  delay = 0,
  badge = 0,
}: QuickActionProps) {
  return (
    <Animated.View
      entering={FadeInDown.delay(delay).duration(420)}
      style={styles.quickActionWrapper}
    >
      <Pressable
        accessibilityRole="button"
        onPress={onPress}
        style={({ pressed }) => [
          styles.quickAction,
          pressed && styles.quickActionPressed,
        ]}
      >
        <View style={styles.quickIcon}>
          <Ionicons name={icon} size={22} color={colors.primary} />
        </View>

        <View style={styles.quickCopy}>
          <Text style={styles.quickTitle}>{title}</Text>
          <Text style={styles.quickSubtitle}>{subtitle}</Text>
        </View>

        {badge > 0 ? (
          <View style={styles.quickBadge}>
            <Text style={styles.quickBadgeText}>{badge > 99 ? "99+" : badge}</Text>
          </View>
        ) : null}

        <Ionicons
          name="arrow-forward"
          size={17}
          color={colors.textMuted}
        />
      </Pressable>
    </Animated.View>
  );
}

function SectionHeader({
  title,
  action,
  onAction,
}: {
  title: string;
  action?: string;
  onAction?: () => void;
}) {
  return (
    <View style={styles.sectionHeader}>
      <Text accessibilityRole="header" style={styles.sectionTitle}>{title}</Text>

      {action && onAction ? (
        <Pressable
          hitSlop={10}
          onPress={onAction}
          style={({ pressed }) => pressed && styles.actionPressed}
        >
          <Text style={styles.sectionAction}>{action}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const activityDate = new Intl.DateTimeFormat("es-PA", { weekday: "short", day: "numeric", month: "short" });
const todayDate = new Intl.DateTimeFormat("es-PA", { weekday: "long", day: "numeric", month: "long" });

function formatMoney(amount: number): string {
  return `B/. ${amount.toFixed(2)}`;
}

function formatActivityDate(date: string): string {
  const value = new Date(`${date}T12:00:00`);
  return Number.isNaN(value.getTime()) ? date : activityDate.format(value);
}

export default function HomeScreen() {
  const { profile, session } = useAuth();
  const { activeCompany, memberships, setActiveCompanyId } = useCompany();
  const { role, can } = usePermissions();
  const [companySheetOpen, setCompanySheetOpen] = useState(false);
  const [switchingCompanyId, setSwitchingCompanyId] = useState<string | null>(null);
  const [switchError, setSwitchError] = useState<string | null>(null);

  const openCompanySheet = () => { setSwitchError(null); setCompanySheetOpen(true); };
  const closeCompanySheet = () => { if (!switchingCompanyId) setCompanySheetOpen(false); };

  const handleSelectCompany = async (companyId: string) => {
    if (companyId === activeCompany?.id) { setCompanySheetOpen(false); return; }
    setSwitchingCompanyId(companyId);
    setSwitchError(null);
    try {
      await setActiveCompanyId(companyId);
      setCompanySheetOpen(false);
    } catch (error) {
      setSwitchError(error instanceof Error ? error.message : "No fue posible cambiar de empresa.");
    } finally {
      setSwitchingCompanyId(null);
    }
  };

  const goToCompanyRoute = (href: Href) => { setCompanySheetOpen(false); router.push(href); };
  const quickActions = quickActionsFor(role);
  const canSeeJobRequests = can("jobRequests.view") && Boolean(activeCompany);
  const jobRequests = useJobRequestsHomeSummary(canSeeJobRequests ? activeCompany!.id : null);
  const showProjects = can("projects.view");
  // Los cobros solo se muestran a quien los gestiona (owner, admin, sales).
  const showFinances = can("invoices.payments.record");
  // Owner/Admin ven el resumen completo del negocio en lugar de las filas simples.
  const showOwnerDashboard = can("company.manage") && Boolean(activeCompany?.id);

  const firstName =
    profile?.full_name?.trim().split(/\s+/)[0] || "Profesional";

  const initial = firstName.charAt(0).toUpperCase();
  const companyName = activeCompany?.name || "Leuret";

  const companyId = activeCompany?.id;
  const scope = companyId && role ? `${session?.sessionId}:${companyId}:${role}` : null;
  const loadMetrics = useCallback(async () => {
    const [projects, clients, invoices] = await Promise.all([
      listProjectsByCompany(companyId!),
      listClients(companyId!),
      listInvoices(companyId!),
    ]);
    const error = projects.error || clients.error || invoices.error;
    if (error) return { error };

    const openInvoices = invoices.invoices.filter(({ status }) => status !== "cancelled");
    return {
      data: {
        projectCount: projects.projects.length,
        activeProjectCount: projects.projects.filter(({ status }) => status !== "completed" && status !== "cancelled").length,
        clientCount: clients.clients.length,
        invoiceCount: openInvoices.length,
        balanceDue: openInvoices.reduce((total, invoice) => total + Math.max(Number(invoice.balance_due ?? 0), 0), 0),
      },
    };
  }, [companyId]);
  const loadNextActivity = useCallback(async () => {
    const activities = await fetchCompanyActivities(companyId!);
    const now = Date.now();
    let nextActivity: Appointment | null = null;
    let nextTime = Infinity;
    for (const activity of activities) {
      const time = new Date(`${activity.date}T${activity.time}`).getTime();
      if ((activity.status === "scheduled" || activity.status === "confirmed") && time >= now && time < nextTime) {
        nextActivity = activity;
        nextTime = time;
      }
    }
    return { data: { nextActivity } };
  }, [companyId]);

  const metrics = useFocusedResource(scope, loadMetrics);
  const agenda = useFocusedResource(scope, loadNextActivity, 0);
  const { data: dashboard } = metrics;
  const nextActivity = agenda.data?.nextActivity;

  const now = new Date();
  const hour = now.getHours();

  const greeting =
    hour < 12
      ? "Buenos días"
      : hour < 18
        ? "Buenas tardes"
        : "Buenas noches";

  const formattedDate = todayDate.format(now);

  const handleInvoices = () => {
    router.push("/facturas" as Href);
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={["top"]}>
      <FocusAwareStatusBar style="dark" />
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        <View style={styles.hero}>
          <View style={styles.glowTop} />
          <View style={styles.glowSide} />

          <Animated.View
            entering={FadeIn.duration(500)}
            style={styles.topBar}
          >
            <LeuretBrand width={96} />

            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <NotificationsBell />
              <Pressable
                accessibilityLabel="Abrir perfil"
                accessibilityRole="button"
                onPress={() => router.push("/perfil" as Href)}
                style={({ pressed }) => [styles.avatar, pressed && styles.avatarPressed]}
              >
                <UserAvatar fallback={initial} size={40} textStyle={styles.avatarText} uri={profile?.avatar_url} />
              </Pressable>
            </View>
          </Animated.View>

          <Animated.View
            entering={FadeInUp.delay(100).duration(520)}
            style={styles.heroCopy}
          >
            <Text style={styles.dateText}>
              {formattedDate.toUpperCase()}
            </Text>

            <Text accessibilityRole="header" style={styles.heroTitle}>
              {greeting}, {firstName}
            </Text>
          </Animated.View>

          <Animated.View
            entering={FadeInDown.delay(220).duration(520)}
            style={styles.companyCard}
          >
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Espacio activo: ${companyName}. Cambiar de empresa o ver el equipo`}
              onPress={openCompanySheet}
              style={({ pressed }) => pressed && styles.companyCardPressed}
            >
            <View style={styles.companyTop}>
              <View style={styles.companyIdentity}>
                <View style={styles.companyIndicator}>
                  <View style={styles.companyIndicatorDot} />
                </View>

                <View style={styles.companyCopy}>
                  <Text style={styles.companyLabel}>
                    {role
                      ? `ESPACIO ACTIVO · ${ROLE_LABELS[role].toUpperCase()}`
                      : "ESPACIO ACTIVO"}
                  </Text>

                  <Text
                    style={styles.companyName}
                    numberOfLines={1}
                  >
                    {companyName}
                  </Text>
                </View>
              </View>

              <Ionicons
                name="chevron-forward"
                size={19}
                color={colors.textMuted}
              />
            </View>

            <View style={styles.metrics}>
              <View style={styles.metric}>
                <Text style={styles.metricValue}>{dashboard?.projectCount ?? "—"}</Text>
                <Text style={styles.metricLabel}>Proyectos</Text>
              </View>

              <View style={styles.metricDivider} />

              <View style={styles.metric}>
                <Text style={styles.metricValue}>{dashboard?.clientCount ?? "—"}</Text>
                <Text style={styles.metricLabel}>Clientes</Text>
              </View>

              {can("invoices.view") ? (
                <>
                  <View style={styles.metricDivider} />

                  <View style={styles.metric}>
                    <Text style={styles.metricValue}>{dashboard?.invoiceCount ?? "—"}</Text>
                    <Text style={styles.metricLabel}>Facturas</Text>
                  </View>
                </>
              ) : null}
            </View>
            </Pressable>
          </Animated.View>
        </View>

        <View style={styles.content}>
          <SectionHeader title="Accesos rápidos" />

          <View style={styles.quickGrid}>
            {quickActions.map((id, index) => {
              const action = QUICK_ACTIONS[id];

              return (
                <QuickAction
                  key={id}
                  icon={action.icon}
                  title={action.title}
                  subtitle={action.subtitle}
                  delay={80 + index * 60}
                  onPress={() => router.push(action.href)}
                />
              );
            })}

            {canSeeJobRequests ? (
              <QuickAction
                icon="megaphone-outline"
                title="Peticiones de clientes"
                subtitle={jobRequests.subtitle}
                badge={jobRequests.badge}
                delay={80 + quickActions.length * 60}
                onPress={() => router.push("/peticiones" as Href)}
              />
            ) : null}
          </View>

          {metrics.loading ? <LeuretLoading message="Cargando indicadores…" compact /> : null}
          {metrics.error ? (
            <LeuretFeedback
              tone="error"
              title="No pudimos actualizar los indicadores"
              message={dashboard ? "Se muestran los últimos datos cargados. " + metrics.error : metrics.error}
              actionLabel="Reintentar"
              onAction={() => void metrics.reload()}
              compact
            />
          ) : null}

          {showOwnerDashboard && activeCompany ? (
            <>
              <OnboardingChecklist />
              <OwnerDashboard companyId={activeCompany.id} />
            </>
          ) : (role === "sales" || role === "estimator") && activeCompany ? (
            <RoleDashboard companyId={activeCompany.id} role={role} />
          ) : showProjects || showFinances ? (
          <Animated.View
            entering={FadeInDown.delay(320).duration(480)}
          >
            <SectionHeader
              title="Tu operación"
            />

            <View style={styles.operationCard}>
              {showProjects ? (
              <Pressable
                onPress={() =>
                  router.push("/proyectos" as Href)
                }
                style={({ pressed }) => [
                  styles.operationRow,
                  pressed && styles.rowPressed,
                ]}
              >
                <View
                  style={[
                    styles.operationIcon,
                    styles.operationIconBlue,
                  ]}
                >
                  <Ionicons
                    name="briefcase-outline"
                    size={20}
                    color={colors.primary}
                  />
                </View>

                <View style={styles.operationCopy}>
                  <Text style={styles.operationTitle}>
                    Proyectos
                  </Text>
                  <Text style={styles.operationText}>
                    {!dashboard ? "Ver obras, tareas y avances" : dashboard.projectCount === 0 ? "Todavía no tienes proyectos." : `${dashboard.activeProjectCount} activos de ${dashboard.projectCount}.`}
                  </Text>
                </View>

                <Ionicons
                  name="chevron-forward"
                  size={18}
                  color={colors.textMuted}
                />
              </Pressable>
              ) : null}

              {showProjects && showFinances ? (
                <View style={styles.rowDivider} />
              ) : null}

              {showFinances ? (
              <Pressable
                onPress={handleInvoices}
                style={({ pressed }) => [
                  styles.operationRow,
                  pressed && styles.rowPressed,
                ]}
              >
                <View
                  style={[
                    styles.operationIcon,
                    styles.operationIconCyan,
                  ]}
                >
                  <Ionicons
                    name="receipt-outline"
                    size={20}
                    color={colors.accent}
                  />
                </View>

                <View style={styles.operationCopy}>
                  <Text style={styles.operationTitle}>
                    Finanzas
                  </Text>
                  <Text style={styles.operationText}>
                    {!dashboard ? "Ver cobros y saldos" : dashboard.balanceDue > 0 ? `Por cobrar: ${formatMoney(dashboard.balanceDue)}` : "Sin saldos pendientes."}
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
              </Pressable>
              ) : null}
            </View>
          </Animated.View>
          ) : null}

          <Animated.View
            entering={FadeInDown.delay(390).duration(480)}
          >
            <SectionHeader
              title="Próximas actividades"
              action="Ver agenda"
              onAction={() =>
                router.push("/(tabs)/agenda" as Href)
              }
            />

            {agenda.loading ? <LeuretLoading message="Cargando agenda…" compact /> : null}
            {agenda.error ? (
              <LeuretFeedback
                tone="error"
                title="No pudimos actualizar la agenda"
                message={agenda.error}
                actionLabel="Reintentar"
                onAction={() => void agenda.reload()}
                compact
              />
            ) : null}
            {agenda.data ? (
              <Pressable
                onPress={() =>
                  router.push("/(tabs)/agenda" as Href)
                }
                style={({ pressed }) => [
                  styles.agendaCard,
                  pressed && styles.rowPressed,
                ]}
              >
                <View style={styles.agendaIcon}>
                  <Ionicons
                    name="calendar-clear-outline"
                    size={24}
                    color={colors.accent}
                  />
                </View>

                <View style={styles.agendaCopy}>
                  <Text style={styles.agendaTitle}>
                    {nextActivity ? nextActivity.title : "Tu agenda está libre"}
                  </Text>

                  <Text style={styles.agendaText}>
                    {nextActivity ? `${formatActivityDate(nextActivity.date)}  ${nextActivity.time.slice(0,5)}${nextActivity.clientName ? `  ${nextActivity.clientName}` : ""}` : "Tus próximas visitas, trabajos y recordatorios aparecerán aquí."}
                  </Text>
                </View>

                <Ionicons
                  name="arrow-forward"
                  size={18}
                  color={colors.textMuted}
                />
              </Pressable>
            ) : null}
          </Animated.View>

        </View>
      </ScrollView>
      <Modal
        visible={companySheetOpen}
        transparent
        animationType="fade"
        onRequestClose={closeCompanySheet}
      >
        <Pressable style={styles.sheetBackdrop} onPress={closeCompanySheet}>
          <Pressable style={styles.sheet} onPress={() => undefined}>
            <Text style={styles.sheetEyebrow}>ESPACIO DE TRABAJO</Text>
            <Text style={styles.sheetTitle}>Tus empresas</Text>
            <Text style={styles.sheetSubtitle}>
              Clientes, proyectos y presupuestos se cargan según la empresa activa.
            </Text>

            <ScrollView style={styles.sheetList} contentContainerStyle={styles.sheetListContent}>
              {memberships.filter((membership) => membership.company).map((membership) => {
                const isActive = membership.company_id === activeCompany?.id;
                const isSwitching = switchingCompanyId === membership.company_id;
                return (
                  <Pressable
                    key={membership.id}
                    accessibilityRole="button"
                    accessibilityState={{ selected: isActive, disabled: Boolean(switchingCompanyId) }}
                    disabled={Boolean(switchingCompanyId)}
                    onPress={() => void handleSelectCompany(membership.company_id)}
                    style={({ pressed }) => [
                      styles.sheetCompany,
                      isActive && styles.sheetCompanyActive,
                      pressed && styles.companyCardPressed,
                    ]}
                  >
                    <View style={styles.sheetCompanyCopy}>
                      <Text style={styles.sheetCompanyName} numberOfLines={1}>
                        {membership.company?.name ?? "Empresa"}
                      </Text>
                      <Text style={styles.sheetCompanyRole}>
                      {membership.role === "owner" ? "Contratista independiente" : ROLE_LABELS[membership.role]}
                      </Text>
                    </View>
                    {isSwitching ? (
                      <ActivityIndicator size="small" color={colors.primary} />
                    ) : isActive ? (
                      <Ionicons name="checkmark-circle" size={22} color={colors.primary} />
                    ) : (
                      <Ionicons name="swap-horizontal" size={20} color={colors.textMuted} />
                    )}
                  </Pressable>
                );
              })}
            </ScrollView>

            {switchError ? <Text style={styles.sheetError}>{switchError}</Text> : null}

            <View style={styles.sheetActions}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Espacios de trabajo"
                onPress={() => goToCompanyRoute("/espacios")}
                style={({ pressed }) => [styles.sheetAction, pressed && styles.companyCardPressed]}
              >
                <Ionicons name="swap-horizontal-outline" size={20} color={colors.text} />
                <Text style={styles.sheetActionText}>Espacios de trabajo</Text>
                <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
              </Pressable>
              <Pressable
                accessibilityRole="button"
                onPress={() => goToCompanyRoute("/equipo" as Href)}
                style={({ pressed }) => [styles.sheetAction, pressed && styles.companyCardPressed]}
              >
                <Ionicons name="people-outline" size={20} color={colors.text} />
                <Text style={styles.sheetActionText}>Equipo y roles</Text>
                <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
              </Pressable>
              <Pressable
                accessibilityRole="button"
                onPress={() => goToCompanyRoute("/equipo/unirme" as Href)}
                style={({ pressed }) => [styles.sheetAction, pressed && styles.companyCardPressed]}
              >
                <Ionicons name="enter-outline" size={20} color={colors.text} />
                <Text style={styles.sheetActionText}>Unirme a otra empresa</Text>
                <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
              </Pressable>
            </View>

            <Pressable
              accessibilityRole="button"
              onPress={closeCompanySheet}
              style={({ pressed }) => [styles.sheetClose, pressed && styles.companyCardPressed]}
            >
              <Text style={styles.sheetCloseText}>Cerrar</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.background,
  },

  scrollContent: {
    flexGrow: 1,
    paddingBottom: spacing.xxl,
    backgroundColor: colors.background,
  },

  hero: {
    position: "relative",
    overflow: "hidden",
    paddingHorizontal: layout.screenPadding,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xl,
  },

  glowTop: {
    position: "absolute",
    width: 280,
    height: 280,
    top: -165,
    right: -100,
    borderRadius: 140,
    backgroundColor: colors.glowBlue,
    opacity: 0.42,
  },

  glowSide: {
    position: "absolute",
    width: 190,
    height: 190,
    bottom: 40,
    left: -135,
    borderRadius: 95,
    backgroundColor: colors.glowSoft,
    opacity: 0.18,
  },

  topBar: {
    minHeight: 52,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },

  avatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.surfaceRaised,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },

  avatarPressed: {
    opacity: 0.72,
    transform: [{ scale: 0.96 }],
  },

  avatarText: {
    color: colors.text,
    fontSize: 15,
    fontWeight: "900",
  },

  heroCopy: {
    marginTop: spacing.lg,
    gap: spacing.xs,
  },

  dateText: {
    ...typography.caption,
    color: colors.textSecondary,
  },

  heroTitle: {
    ...typography.title,
    color: colors.text,
  },

  companyCard: {
    marginTop: spacing.xl,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.xl,
    backgroundColor: colors.surface,
    ...shadows.raised,
  },

  companyCardPressed: {
    opacity: 0.72,
  },

  sheetBackdrop: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(15, 23, 42, 0.45)",
  },

  sheet: {
    width: "100%",
    maxWidth: 560,
    alignSelf: "center",
    maxHeight: "85%",
    padding: spacing.lg,
    paddingBottom: spacing.xl,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    backgroundColor: colors.surface,
  },

  sheetEyebrow: {
    color: colors.primary,
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 2,
  },

  sheetTitle: {
    marginTop: 4,
    color: colors.text,
    fontSize: 22,
    fontWeight: "900",
  },

  sheetSubtitle: {
    marginTop: 4,
    color: colors.textMuted,
    fontSize: 14,
    lineHeight: 20,
  },

  sheetList: {
    marginTop: spacing.md,
    flexGrow: 0,
  },

  sheetListContent: {
    gap: spacing.sm,
  },

  sheetCompany: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    backgroundColor: colors.background,
  },

  sheetCompanyActive: {
    borderColor: colors.primary,
  },

  sheetCompanyCopy: {
    flex: 1,
  },

  sheetCompanyName: {
    color: colors.text,
    fontSize: 16,
    fontWeight: "800",
  },

  sheetCompanyRole: {
    marginTop: 2,
    color: colors.textMuted,
    fontSize: 13,
  },

  sheetError: {
    marginTop: spacing.sm,
    color: colors.danger,
    fontSize: 13,
  },

  sheetActions: {
    marginTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },

  sheetAction: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },

  sheetActionText: {
    flex: 1,
    color: colors.text,
    fontSize: 15,
    fontWeight: "700",
  },

  sheetClose: {
    marginTop: spacing.md,
    alignItems: "center",
    paddingVertical: spacing.sm,
  },

  sheetCloseText: {
    color: colors.textMuted,
    fontSize: 15,
    fontWeight: "700",
  },

  companyTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },

  companyIdentity: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
  },

  companyIndicator: {
    width: 42,
    height: 42,
    borderRadius: 14,
    backgroundColor: colors.primarySoft,
    alignItems: "center",
    justifyContent: "center",
  },

  companyIndicatorDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.accent,
    ...shadows.glow,
  },

  companyCopy: {
    flex: 1,
    marginLeft: spacing.base,
  },

  companyLabel: {
    color: colors.textMuted,
    fontSize: 8,
    fontWeight: "900",
    letterSpacing: 1.2,
  },

  companyName: {
    marginTop: 3,
    color: colors.text,
    fontSize: 15,
    fontWeight: "800",
  },

  metrics: {
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.divider,
    flexDirection: "row",
  },

  metric: {
    flex: 1,
    minHeight: 50,
    alignItems: "center",
    justifyContent: "center",
  },

  metricDivider: {
    width: 1,
    height: 36,
    alignSelf: "center",
    backgroundColor: colors.divider,
  },

  metricValue: {
    color: colors.text,
    fontSize: 20,
    fontWeight: "900",
  },

  metricValueSmall: {
    color: colors.text,
    fontSize: 13,
    fontWeight: "800",
  },

  metricOnline: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },

  onlineDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: colors.success,
  },

  metricLabel: {
    marginTop: 5,
    color: colors.textMuted,
    fontSize: 9,
    fontWeight: "700",
  },

  content: {
    width: "100%",
    maxWidth: layout.maxContentWidth,
    alignSelf: "center",
    paddingHorizontal: layout.screenPadding,
  },

  sectionHeader: {
    marginTop: spacing.xl,
    marginBottom: spacing.md,
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
  },


  sectionTitle: {
    color: colors.text,
    ...typography.heading,
  },

  sectionAction: {
    color: colors.primary,
    fontSize: 12,
    fontWeight: "800",
  },

  actionPressed: {
    opacity: 0.6,
  },

  quickGrid: {
    gap: layout.cardGap,
  },

  quickActionWrapper: {
    width: "100%",
  },

  quickAction: {
    minHeight: 82,
    paddingHorizontal: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    flexDirection: "row",
    alignItems: "center",
    ...shadows.soft,
  },

  quickActionPressed: {
    backgroundColor: colors.surfaceRaised,
    borderColor: colors.borderStrong,
    transform: [{ scale: 0.985 }],
  },

  quickIcon: {
    width: 46,
    height: 46,
    borderRadius: 15,
    backgroundColor: colors.accentSoft,
    alignItems: "center",
    justifyContent: "center",
  },

  quickBadge: {
    minWidth: 22,
    height: 22,
    paddingHorizontal: 6,
    marginRight: spacing.sm,
    borderRadius: 11,
    backgroundColor: colors.accent,
    alignItems: "center",
    justifyContent: "center",
  },

  quickBadgeText: {
    color: colors.textInverse,
    fontSize: 11,
    fontWeight: "900",
  },

  quickCopy: {
    flex: 1,
    marginLeft: spacing.base,
  },

  quickTitle: {
    color: colors.text,
    fontSize: 15,
    fontWeight: "800",
  },

  quickSubtitle: {
    marginTop: 4,
    color: colors.textSecondary,
    fontSize: 11,
    lineHeight: 16,
  },

  operationCard: {
    overflow: "hidden",
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
  },

  operationRow: {
    minHeight: 84,
    padding: spacing.md,
    flexDirection: "row",
    alignItems: "center",
  },

  rowPressed: {
    backgroundColor: colors.surfaceRaised,
  },

  operationIcon: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },

  operationIconBlue: {
    backgroundColor: colors.primarySoft,
  },

  operationIconCyan: {
    backgroundColor: colors.accentSoft,
  },

  operationCopy: {
    flex: 1,
    marginLeft: spacing.base,
  },

  operationTitle: {
    color: colors.text,
    fontSize: 14,
    fontWeight: "800",
  },

  operationText: {
    marginTop: 4,
    color: colors.textSecondary,
    fontSize: 11,
    lineHeight: 16,
  },

  rowDivider: {
    height: 1,
    marginLeft: 72,
    backgroundColor: colors.divider,
  },

  soonBadge: {
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: radius.full,
    backgroundColor: colors.primarySoft,
  },

  soonText: {
    color: colors.primary,
    fontSize: 8,
    fontWeight: "900",
    letterSpacing: 0.7,
  },

  agendaCard: {
    minHeight: 104,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    flexDirection: "row",
    alignItems: "center",
  },

  agendaIcon: {
    width: 48,
    height: 48,
    borderRadius: 16,
    backgroundColor: colors.accentSoft,
    alignItems: "center",
    justifyContent: "center",
  },

  agendaCopy: {
    flex: 1,
    marginHorizontal: spacing.base,
  },

  agendaTitle: {
    color: colors.text,
    fontSize: 14,
    fontWeight: "800",
  },

  agendaText: {
    marginTop: 5,
    color: colors.textSecondary,
    fontSize: 11,
    lineHeight: 17,
  },
});
