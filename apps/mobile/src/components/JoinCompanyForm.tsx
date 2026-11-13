import { Ionicons } from "@expo/vector-icons";
import { router, useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { ScrollView, StyleSheet, Text, TextInput, View } from "react-native";

import { LeuretButton } from "@/components/LeuretButton";
import { colors, radius } from "@/constants/theme";
import { useAuth } from "@/contexts/AuthContext";
import { useCompany } from "@/contexts/CompanyContext";
import { ROLE_LABELS } from "@/permissions/permissions";
import {
  acceptCompanyInvitation,
  listReceivedCompanyInvitations,
  type ReceivedCompanyInvitation,
} from "@/services/users-service";
import { clearPendingInvitation, readPendingInvitation } from "@/utils/pending-invitation";
import { extractInvitationCode, isValidInvitationCode } from "@/utils/team";

/** Formulario para unirse a una empresa con el código de invitación. */
export function JoinCompanyForm({ invitationId, initialCode }: { invitationId?: string; initialCode?: string } = {}) {
  const { profile, refreshProfile } = useAuth();
  const { refreshCompanies } = useCompany();
  const [input, setInput] = useState(initialCode ?? "");
  const [submitting, setSubmitting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fromLink, setFromLink] = useState(Boolean(initialCode));
  const [invitations, setInvitations] = useState<ReceivedCompanyInvitation[]>([]);
  const [listError, setListError] = useState<string | null>(null);

  useFocusEffect(useCallback(() => {
    let active = true;
    if (!initialCode) void readPendingInvitation().then((code) => {
      if (active && code) {
        setInput(code);
        setFromLink(true);
      }
    });
    void listReceivedCompanyInvitations().then(({ invitations: received }) => {
      if (!active) return;
      setInvitations(received);
      setListError(null);
    }).catch((err: unknown) => {
      if (active) setListError(err instanceof Error ? err.message : "No se pudieron cargar tus invitaciones.");
    });
    return () => {
      active = false;
    };
  }, [initialCode]));

  const submit = async (id?: string) => {
    if (submitting) return;
    const code = id ? "" : extractInvitationCode(input);
    if (!id && !isValidInvitationCode(code)) {
      setError("El código no parece completo. Pega el mensaje de invitación o el código tal como lo recibiste.");
      return;
    }

    setSubmitting(id ?? "code");
    setError(null);
    const result = await acceptCompanyInvitation(id ? { invitationId: id } : code);

    if (!result.success || !result.companyId) {
      setSubmitting(null);
      setError(
        result.error ??
          "La invitación no es válida, ya se usó o fue enviada a otro correo."
      );
      return;
    }

    await clearPendingInvitation();
    setInput("");
    setFromLink(false);
    try {
      const activated = await refreshCompanies(result.companyId);
      await refreshProfile();
      if (!activated) {
        setInvitations((current) => current.filter((item) => item.company_id !== result.companyId));
        setError("Ya te uniste al equipo. Vuelve al inicio para cargar tu espacio de trabajo.");
        return;
      }
      if (!profile?.full_name?.trim() || !profile.phone?.trim()) {
        router.replace({ pathname: "/perfil", params: { equipo: "1" } });
      } else {
        router.replace("/(tabs)");
      }
    } finally {
      setSubmitting(null);
    }
  };

  const received = invitationId
    ? [...invitations].sort((left, right) => Number(right.id === invitationId) - Number(left.id === invitationId))
    : invitations;

  return (
    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      {received.length ? (
        <View style={styles.invitations}>
          <Text style={styles.title}>Invitaciones recibidas</Text>
          {received.map((invitation) => (
            <View key={invitation.id} style={styles.invitation}>
              <Text style={styles.companyName}>{invitation.company_name}</Text>
              <Text style={styles.text}>{ROLE_LABELS[invitation.role]}</Text>
              <LeuretButton
                label="Unirme al equipo"
                icon="enter-outline"
                fullWidth
                accessibilityRole="button"
                accessibilityLabel="Unirme al equipo"
                disabled={Boolean(submitting)}
                loading={submitting === invitation.id}
                onPress={() => void submit(invitation.id)}
                style={styles.button}
              />
            </View>
          ))}
        </View>
      ) : null}
      {listError ? <Text accessibilityRole="alert" style={styles.error}>{listError}</Text> : null}
      {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
      <View style={styles.icon}>
        <Ionicons name="key-outline" size={30} color={colors.primary} />
      </View>
      <Text style={styles.title}>Unirme con un código</Text>
      <Text style={styles.text}>
        Pega el código o el mensaje completo que te enviaron. La invitación debe ser para tu correo
        {profile?.email ? ` (${profile.email})` : ""}.
      </Text>

      <TextInput
        value={input}
        accessibilityLabel="Código de invitación"
        editable={!submitting}
        onChangeText={(value) => {
          setInput(value);
          setError(null);
        }}
        placeholder="Código de invitación"
        placeholderTextColor={colors.textMuted}
        autoCapitalize="none"
        autoCorrect={false}
        multiline
        style={styles.input}
      />

      {fromLink ? (
        <View style={styles.linkNotice}>
          <Ionicons name="mail-open-outline" size={16} color={colors.success} />
          <Text style={styles.linkNoticeText}>Código cargado desde tu correo de invitación.</Text>
        </View>
      ) : null}

      <LeuretButton
        label="Unirme con el código"
        icon="enter-outline"
        fullWidth
        accessibilityRole="button"
        accessibilityLabel="Unirme con el código"
        loading={submitting === "code"}
        disabled={!input.trim() || Boolean(submitting)}
        onPress={() => void submit()}
        style={styles.button}
      />

      {fromLink ? (
        <LeuretButton
          label="Descartar esta invitación"
          variant="ghost"
          fullWidth
          disabled={Boolean(submitting)}
          onPress={() => {
            void clearPendingInvitation();
            setInput("");
            setFromLink(false);
          }}
          style={styles.discard}
        />
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: 20, paddingBottom: 40 },
  invitations: { gap: 12, marginBottom: 24 },
  invitation: {
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
  },
  companyName: { color: colors.text, fontSize: 17, fontWeight: "800" },
  icon: {
    width: 60,
    height: 60,
    marginBottom: 16,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.primarySoft,
  },
  title: { color: colors.text, fontSize: 22, fontWeight: "900" },
  text: { marginTop: 8, color: colors.textSecondary, fontSize: 14, lineHeight: 21 },
  input: {
    minHeight: 96,
    marginTop: 20,
    padding: 14,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    color: colors.text,
    fontSize: 15,
    textAlignVertical: "top",
  },
  error: { marginTop: 10, color: colors.danger, fontSize: 13, fontWeight: "700", lineHeight: 19 },
  button: { marginTop: 18 },
  discard: { marginTop: 8 },
  linkNotice: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 10 },
  linkNoticeText: { flex: 1, color: colors.success, fontSize: 13, fontWeight: "700" },
});
