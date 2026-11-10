import { Ionicons } from "@expo/vector-icons";
import { type Href, router } from "expo-router";
import { useEffect, useState } from "react";
import { ScrollView, StyleSheet, Text, TextInput, View } from "react-native";

import { LeuretButton } from "@/components/LeuretButton";
import { colors, radius } from "@/constants/theme";
import { useAuth } from "@/contexts/AuthContext";
import { useCompany } from "@/contexts/CompanyContext";
import { acceptCompanyInvitation } from "@/services/users-service";
import { showAlert } from "@/utils/alert";
import { clearPendingInvitation, readPendingInvitation } from "@/utils/pending-invitation";
import { extractInvitationCode, isValidInvitationCode } from "@/utils/team";

/** Formulario para unirse a una empresa con el código de invitación. */
export function JoinCompanyForm() {
  const { profile } = useAuth();
  const { refreshCompanies } = useCompany();
  const [input, setInput] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fromLink, setFromLink] = useState(false);

  // Si llegó desde el enlace del correo, el código ya está listo.
  useEffect(() => {
    let active = true;
    void readPendingInvitation().then((code) => {
      if (active && code) {
        setInput(code);
        setFromLink(true);
      }
    });
    return () => {
      active = false;
    };
  }, []);

  const submit = async () => {
    const code = extractInvitationCode(input);
    if (!isValidInvitationCode(code)) {
      setError("El código no parece completo. Pega el mensaje de invitación o el código tal como lo recibiste.");
      return;
    }

    setSubmitting(true);
    setError(null);
    const result = await acceptCompanyInvitation(code);

    if (!result.success || !result.companyId) {
      setSubmitting(false);
      setError(
        result.error ??
          "La invitación no es válida, ya se usó o fue enviada a otro correo."
      );
      return;
    }

    await clearPendingInvitation();
    await refreshCompanies(result.companyId);
    setSubmitting(false);
    showAlert("¡Bienvenido!", "Ya formas parte de la empresa. Te llevamos al inicio.");
    router.replace("/(tabs)" as Href);
  };

  return (
    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
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

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <LeuretButton
        label="Unirme a la empresa"
        icon="enter-outline"
        fullWidth
        loading={submitting}
        disabled={!input.trim()}
        onPress={() => void submit()}
        style={styles.button}
      />

      {fromLink ? (
        <LeuretButton
          label="Descartar esta invitación"
          variant="ghost"
          fullWidth
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
