import { Ionicons } from "@expo/vector-icons";
import { type Href, router, useFocusEffect } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { LeuretButton } from "@/components/LeuretButton";
import { LeuretLoading } from "@/components/LeuretLoading";
import { colors, radius, shadows } from "@/constants/theme";
import { useAuth } from "@/contexts/AuthContext";
import { useCompany } from "@/contexts/CompanyContext";
import { usePermissions } from "@/hooks/usePermissions";
import { ROLE_LABELS } from "@/permissions/permissions";
import {
  createCompanyInvitation,
  deleteCompanyMember,
  listCompanyInvitations,
  listCompanyMembers,
  revokeCompanyInvitation,
  updateCompanyMemberRole,
  updateCompanyMemberStatus,
} from "@/services/users-service";
import type { CompanyInvitation, CompanyRole, InvitableCompanyRole } from "@/types/company";
import { showAlert } from "@/utils/alert";
import { formatShortDate } from "@/utils/format";
import {
  INVITABLE_ROLES,
  ROLE_DESCRIPTIONS,
  invitationMessage,
  memberActions,
  normalizeMember,
  sortMembers,
  type TeamMember,
} from "@/utils/team";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function confirmAction(title: string, message: string, confirmLabel: string, onConfirm: () => void) {
  if (Platform.OS === "web") {
    if (window.confirm(`${title}\n\n${message}`)) onConfirm();
    return;
  }
  showAlert(title, message, [
    { text: "Cancelar", style: "cancel" },
    { text: confirmLabel, style: "destructive", onPress: onConfirm },
  ]);
}

export default function TeamScreen() {
  const { user } = useAuth();
  const { activeCompany } = useCompany();
  const { role: myRole, can } = usePermissions();
  const canManage = can("company.manage");
  const companyId = activeCompany?.id;

  const [members, setMembers] = useState<TeamMember[]>([]);
  const [invitations, setInvitations] = useState<CompanyInvitation[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selected, setSelected] = useState<TeamMember | null>(null);
  const [inviteVisible, setInviteVisible] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(
    async (isRefresh = false) => {
      if (!companyId) return;
      if (isRefresh) setRefreshing(true);

      const [membersResult, invitationsResult] = await Promise.all([
        listCompanyMembers(companyId),
        canManage ? listCompanyInvitations(companyId) : Promise.resolve({ invitations: [], error: null }),
      ]);

      setMembers(
        sortMembers(
          (membersResult.members as unknown as Parameters<typeof normalizeMember>[0][]).map(normalizeMember)
        )
      );
      setInvitations(invitationsResult.invitations);
      setLoadError(membersResult.error);
      setLoading(false);
      setRefreshing(false);
    },
    [companyId, canManage]
  );

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  const activeOwnerCount = useMemo(
    () => members.filter((m) => m.role === "owner" && m.active).length,
    [members]
  );
  const activeCount = members.filter((m) => m.active).length;

  const selectedActions = selected
    ? memberActions({ callerRole: myRole, callerUserId: user?.id ?? null, target: selected, activeOwnerCount })
    : null;

  const runMemberAction = async (action: () => Promise<{ error: string | null }>, success: string) => {
    setBusy(true);
    const { error } = await action();
    setBusy(false);
    if (error) {
      showAlert("No se pudo completar", error);
      return;
    }
    setSelected(null);
    await load();
    showAlert("Listo", success);
  };

  const handleRoleChange = (member: TeamMember, role: CompanyRole) => {
    if (!companyId) return;
    void runMemberAction(
      () => updateCompanyMemberRole(companyId, member.id, role),
      `${member.name} ahora es ${ROLE_LABELS[role]}.`
    );
  };

  const handleToggleActive = (member: TeamMember) => {
    if (!companyId) return;
    const deactivate = member.active;
    confirmAction(
      deactivate ? "Desactivar miembro" : "Reactivar miembro",
      deactivate
        ? `${member.name} ya no podrá entrar a esta empresa hasta que lo reactives.`
        : `${member.name} volverá a tener acceso con su rol de ${ROLE_LABELS[member.role]}.`,
      deactivate ? "Desactivar" : "Reactivar",
      () =>
        void runMemberAction(
          () => updateCompanyMemberStatus(companyId, member.id, !deactivate),
          deactivate ? `${member.name} fue desactivado.` : `${member.name} fue reactivado.`
        )
    );
  };

  const handleRemove = (member: TeamMember) => {
    if (!companyId) return;
    confirmAction(
      "Quitar de la empresa",
      `${member.name} perderá el acceso a ${activeCompany?.name}. Su historial de trabajo se conserva.`,
      "Quitar",
      () =>
        void runMemberAction(
          async () => {
            const result = await deleteCompanyMember(companyId, member.id);
            return { error: result.error };
          },
          `${member.name} ya no forma parte de la empresa.`
        )
    );
  };

  const handleRevoke = (invitation: CompanyInvitation) => {
    if (!companyId) return;
    confirmAction(
      "Cancelar invitación",
      `El código enviado a ${invitation.email} dejará de funcionar.`,
      "Cancelar invitación",
      async () => {
        const { error } = await revokeCompanyInvitation(companyId, invitation.id);
        if (error) {
          showAlert("No se pudo cancelar", error);
          return;
        }
        setInvitations((current) => current.filter((item) => item.id !== invitation.id));
      }
    );
  };

  if (!companyId || loading) {
    return <LeuretLoading fullScreen message="Cargando tu equipo…" />;
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={["bottom"]}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void load(true)} />}
      >
        <View style={styles.summary}>
          <View style={styles.summaryCopy}>
            <Text style={styles.summaryValue}>{activeCount}</Text>
            <Text style={styles.summaryLabel}>
              {activeCount === 1 ? "persona activa" : "personas activas"} en {activeCompany?.name}
            </Text>
          </View>
          {canManage ? (
            <LeuretButton label="Invitar" icon="person-add-outline" onPress={() => setInviteVisible(true)} />
          ) : null}
        </View>

        {loadError ? (
          <View style={styles.errorBox}>
            <Ionicons name="alert-circle-outline" size={18} color={colors.danger} />
            <Text style={styles.errorText}>{loadError}</Text>
          </View>
        ) : null}

        {canManage && invitations.length > 0 ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Invitaciones pendientes</Text>
            {invitations.map((invitation) => (
              <View key={invitation.id} style={styles.inviteRow}>
                <Ionicons name="mail-unread-outline" size={20} color={colors.textSecondary} />
                <View style={styles.rowCopy}>
                  <Text style={styles.rowTitle} numberOfLines={1}>{invitation.email}</Text>
                  <Text style={styles.rowMeta}>
                    {ROLE_LABELS[invitation.role]} · vence {formatShortDate(invitation.expires_at)}
                  </Text>
                </View>
                <Pressable onPress={() => handleRevoke(invitation)} hitSlop={10} accessibilityRole="button">
                  <Text style={styles.dangerLink}>Cancelar</Text>
                </Pressable>
              </View>
            ))}
          </View>
        ) : null}

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Miembros</Text>
          {members.map((member) => {
            const isMe = member.userId === user?.id;
            const actions = memberActions({
              callerRole: myRole,
              callerUserId: user?.id ?? null,
              target: member,
              activeOwnerCount,
            });
            const hasActions = actions.changeRole || actions.toggleActive || actions.remove;

            return (
              <Pressable
                key={member.id}
                disabled={!hasActions}
                onPress={() => setSelected(member)}
                accessibilityRole={hasActions ? "button" : undefined}
                style={({ pressed }) => [styles.memberRow, !member.active && styles.memberInactive, pressed && styles.pressed]}
              >
                <View style={styles.avatar}>
                  <Text style={styles.avatarText}>{member.name.charAt(0).toUpperCase()}</Text>
                </View>
                <View style={styles.rowCopy}>
                  <Text style={styles.rowTitle} numberOfLines={1}>
                    {member.name}
                    {isMe ? "  (tú)" : ""}
                  </Text>
                  <Text style={styles.rowMeta} numberOfLines={1}>{member.email}</Text>
                </View>
                <View style={styles.badges}>
                  <View style={[styles.roleBadge, member.role === "owner" && styles.roleBadgeOwner]}>
                    <Text style={styles.roleBadgeText}>{ROLE_LABELS[member.role]}</Text>
                  </View>
                  {!member.active ? <Text style={styles.inactiveText}>Inactivo</Text> : null}
                </View>
                {hasActions ? <Ionicons name="ellipsis-vertical" size={18} color={colors.textMuted} /> : null}
              </Pressable>
            );
          })}
        </View>

        {canManage ? (
          <Pressable
            onPress={() => router.push("/equipo/historial" as Href)}
            style={({ pressed }) => [styles.linkRow, pressed && styles.pressed]}
          >
            <Ionicons name="time-outline" size={20} color={colors.primary} />
            <Text style={styles.linkText}>Historial de cambios del equipo</Text>
            <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
          </Pressable>
        ) : null}
      </ScrollView>

      <MemberSheet
        member={selected}
        actions={selectedActions}
        busy={busy}
        onClose={() => setSelected(null)}
        onChangeRole={handleRoleChange}
        onToggleActive={handleToggleActive}
        onRemove={handleRemove}
      />

      <InviteSheet
        visible={inviteVisible}
        companyId={companyId}
        companyName={activeCompany?.name ?? "la empresa"}
        onClose={() => setInviteVisible(false)}
        onCreated={(invitation) => setInvitations((current) => [invitation, ...current])}
      />
    </SafeAreaView>
  );
}

function MemberSheet({
  member,
  actions,
  busy,
  onClose,
  onChangeRole,
  onToggleActive,
  onRemove,
}: {
  member: TeamMember | null;
  actions: ReturnType<typeof memberActions> | null;
  busy: boolean;
  onClose: () => void;
  onChangeRole: (member: TeamMember, role: CompanyRole) => void;
  onToggleActive: (member: TeamMember) => void;
  onRemove: (member: TeamMember) => void;
}) {
  return (
    <Modal visible={Boolean(member)} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      {member && actions ? (
        <SafeAreaView style={styles.sheet}>
          <View style={styles.sheetHeader}>
            <View style={styles.rowCopy}>
              <Text style={styles.sheetTitle}>{member.name}</Text>
              <Text style={styles.rowMeta}>
                {member.email} · {ROLE_LABELS[member.role]}
              </Text>
            </View>
            <Pressable onPress={onClose} hitSlop={12} accessibilityRole="button" accessibilityLabel="Cerrar">
              <Ionicons name="close" size={26} color={colors.text} />
            </Pressable>
          </View>

          <ScrollView contentContainerStyle={styles.sheetContent}>
            {busy ? <ActivityIndicator color={colors.primary} style={styles.sheetBusy} /> : null}

            {actions.changeRole ? (
              <>
                <Text style={styles.sectionTitle}>Cambiar rol</Text>
                {actions.assignableRoles.map((role) => (
                  <Pressable
                    key={role}
                    disabled={busy}
                    onPress={() => onChangeRole(member, role)}
                    style={({ pressed }) => [styles.roleOption, pressed && styles.pressed]}
                  >
                    <View style={styles.rowCopy}>
                      <Text style={styles.rowTitle}>{ROLE_LABELS[role]}</Text>
                      <Text style={styles.rowMeta}>{ROLE_DESCRIPTIONS[role]}</Text>
                    </View>
                    <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
                  </Pressable>
                ))}
              </>
            ) : null}

            {actions.toggleActive || actions.remove ? (
              <Text style={[styles.sectionTitle, styles.sheetSpacing]}>Acceso</Text>
            ) : null}
            {actions.toggleActive ? (
              <LeuretButton
                variant="secondary"
                fullWidth
                disabled={busy}
                icon={member.active ? "pause-circle-outline" : "play-circle-outline"}
                label={member.active ? "Desactivar acceso" : "Reactivar acceso"}
                onPress={() => onToggleActive(member)}
              />
            ) : null}
            {actions.remove ? (
              <LeuretButton
                variant="danger"
                fullWidth
                disabled={busy}
                icon="person-remove-outline"
                label="Quitar de la empresa"
                onPress={() => onRemove(member)}
                style={styles.sheetSpacingSmall}
              />
            ) : null}
          </ScrollView>
        </SafeAreaView>
      ) : null}
    </Modal>
  );
}

function InviteSheet({
  visible,
  companyId,
  companyName,
  onClose,
  onCreated,
}: {
  visible: boolean;
  companyId: string;
  companyName: string;
  onClose: () => void;
  onCreated: (invitation: CompanyInvitation) => void;
}) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<InvitableCompanyRole>("member");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<{ email: string; role: InvitableCompanyRole; code: string; emailSent: boolean } | null>(null);

  const reset = () => {
    setEmail("");
    setRole("member");
    setError(null);
    setCreated(null);
  };

  const close = () => {
    reset();
    onClose();
  };

  const submit = async () => {
    const cleanEmail = email.trim().toLowerCase();
    if (!EMAIL_PATTERN.test(cleanEmail)) {
      setError("Escribe un correo válido.");
      return;
    }
    setSubmitting(true);
    setError(null);
    const result = await createCompanyInvitation(companyId, cleanEmail, role);
    setSubmitting(false);

    if (result.error || !result.invitation) {
      setError(result.error ?? "No se pudo crear la invitación.");
      return;
    }

    onCreated(result.invitation);
    setCreated({
      email: cleanEmail,
      role,
      code: result.invitation.acceptanceToken ?? "",
      emailSent: result.invitation.emailSent === true,
    });
  };

  const share = async () => {
    if (!created) return;
    const message = invitationMessage({
      companyName,
      code: created.code,
      roleLabel: ROLE_LABELS[created.role],
      email: created.email,
    });
    try {
      await Share.share({ title: `Invitación a ${companyName}`, message });
    } catch {
      showAlert("No se pudo compartir", "Copia el código manualmente.");
    }
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={close}>
      <SafeAreaView style={styles.sheet}>
        <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === "ios" ? "padding" : undefined}>
          <View style={styles.sheetHeader}>
            <Text style={styles.sheetTitle}>{created ? "Invitación lista" : "Invitar al equipo"}</Text>
            <Pressable onPress={close} hitSlop={12} accessibilityRole="button" accessibilityLabel="Cerrar">
              <Ionicons name="close" size={26} color={colors.text} />
            </Pressable>
          </View>

          {created ? (
            <ScrollView contentContainerStyle={styles.sheetContent}>
              <View style={styles.successIcon}>
                <Ionicons name="checkmark-circle" size={44} color={colors.success} />
              </View>
              <Text style={styles.successText}>
                {created.emailSent
                  ? `Le enviamos un correo a ${created.email} con un enlace para unirse como ${ROLE_LABELS[created.role]}. Si no le llega, compártele también el código.`
                  : `Envía este código a ${created.email}. Debe entrar a Leuret con ese mismo correo para unirse como ${ROLE_LABELS[created.role]}.`}
              </Text>
              {created.code ? (
                <View style={styles.codeBox}>
                  <Text selectable style={styles.codeText}>{created.code}</Text>
                </View>
              ) : null}
              <Text style={styles.rowMeta}>Por seguridad, el código solo se muestra ahora. Vence en 7 días.</Text>
              <LeuretButton
                label="Compartir invitación"
                icon="share-social-outline"
                fullWidth
                onPress={() => void share()}
                style={styles.sheetSpacing}
              />
              <LeuretButton
                label="Invitar a otra persona"
                variant="secondary"
                fullWidth
                onPress={reset}
                style={styles.sheetSpacingSmall}
              />
            </ScrollView>
          ) : (
            <ScrollView contentContainerStyle={styles.sheetContent} keyboardShouldPersistTaps="handled">
              <Text style={styles.inputLabel}>Correo de la persona</Text>
              <TextInput
                value={email}
                onChangeText={setEmail}
                placeholder="nombre@correo.com"
                placeholderTextColor={colors.textMuted}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="email-address"
                style={styles.input}
              />

              <Text style={[styles.inputLabel, styles.sheetSpacing]}>Rol</Text>
              {INVITABLE_ROLES.map((option) => {
                const isSelected = option === role;
                return (
                  <Pressable
                    key={option}
                    onPress={() => setRole(option)}
                    accessibilityRole="radio"
                    accessibilityState={{ checked: isSelected }}
                    style={[styles.roleOption, isSelected && styles.roleOptionSelected]}
                  >
                    <Ionicons
                      name={isSelected ? "radio-button-on" : "radio-button-off"}
                      size={20}
                      color={isSelected ? colors.primary : colors.textMuted}
                    />
                    <View style={styles.rowCopy}>
                      <Text style={styles.rowTitle}>{ROLE_LABELS[option]}</Text>
                      <Text style={styles.rowMeta}>{ROLE_DESCRIPTIONS[option]}</Text>
                    </View>
                  </Pressable>
                );
              })}

              {error ? <Text style={styles.formError}>{error}</Text> : null}

              <LeuretButton
                label="Crear invitación"
                icon="send-outline"
                fullWidth
                loading={submitting}
                onPress={() => void submit()}
                style={styles.sheetSpacing}
              />
            </ScrollView>
          )}
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  safeArea: { flex: 1, backgroundColor: colors.background },
  content: { padding: 20, paddingBottom: 40, gap: 18 },
  summary: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 18,
    borderRadius: radius.xl,
    backgroundColor: colors.surfaceDark,
  },
  summaryCopy: { flex: 1 },
  summaryValue: { color: colors.textLight, fontSize: 30, fontWeight: "900" },
  summaryLabel: { color: colors.textLightMuted, fontSize: 13, marginTop: 2 },
  errorBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    padding: 12,
    borderRadius: radius.md,
    backgroundColor: colors.dangerSoft,
  },
  errorText: { flex: 1, color: colors.danger, fontSize: 13 },
  section: {
    padding: 14,
    gap: 4,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    ...shadows.soft,
  },
  sectionTitle: {
    marginBottom: 6,
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: "900",
    letterSpacing: 0.6,
    textTransform: "uppercase",
  },
  inviteRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 10 },
  memberRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 10, borderRadius: radius.md },
  memberInactive: { opacity: 0.55 },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.primarySoft,
  },
  avatarText: { color: colors.primary, fontSize: 16, fontWeight: "900" },
  rowCopy: { flex: 1, minWidth: 0 },
  rowTitle: { color: colors.text, fontSize: 15, fontWeight: "800" },
  rowMeta: { marginTop: 2, color: colors.textSecondary, fontSize: 12, lineHeight: 17 },
  badges: { alignItems: "flex-end", gap: 3 },
  roleBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radius.full,
    backgroundColor: colors.steelSoft,
  },
  roleBadgeOwner: { backgroundColor: colors.sandSoft },
  roleBadgeText: { color: colors.text, fontSize: 11, fontWeight: "800" },
  inactiveText: { color: colors.danger, fontSize: 11, fontWeight: "800" },
  dangerLink: { color: colors.danger, fontSize: 13, fontWeight: "800" },
  linkRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 16,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  linkText: { flex: 1, color: colors.primary, fontSize: 14, fontWeight: "800" },
  pressed: { opacity: 0.7 },
  sheet: { flex: 1, backgroundColor: colors.background },
  sheetHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  sheetTitle: { flex: 1, color: colors.text, fontSize: 20, fontWeight: "900" },
  sheetContent: { padding: 20, paddingBottom: 40 },
  sheetBusy: { marginBottom: 12 },
  sheetSpacing: { marginTop: 20 },
  sheetSpacingSmall: { marginTop: 10 },
  roleOption: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 14,
    marginBottom: 8,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  roleOptionSelected: { borderColor: colors.primary, backgroundColor: colors.primaryWash },
  inputLabel: { marginBottom: 8, color: colors.text, fontSize: 14, fontWeight: "800" },
  input: {
    minHeight: 50,
    paddingHorizontal: 14,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    color: colors.text,
    fontSize: 16,
  },
  formError: { marginTop: 12, color: colors.danger, fontSize: 13, fontWeight: "700" },
  successIcon: { alignItems: "center", marginBottom: 12 },
  successText: { color: colors.text, fontSize: 15, lineHeight: 22, textAlign: "center" },
  codeBox: {
    marginVertical: 16,
    padding: 14,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: colors.borderStrong,
    backgroundColor: colors.surfaceAlt,
  },
  codeText: {
    color: colors.text,
    fontSize: 14,
    fontFamily: Platform.select({ ios: "Menlo", android: "monospace", default: "monospace" }),
  },
});
