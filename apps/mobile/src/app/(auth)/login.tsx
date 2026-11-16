import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { BackBar } from "@/components/back-navigation";
import { LeuretBrand } from "@/components/LeuretBrand";
import { LeuretButton } from "@/components/LeuretButton";
import { LeuretFeedback } from "@/components/LeuretFeedback";
import TurnstileChallenge from "@/components/TurnstileChallenge";
import { colors, layout, radius, shadows, spacing, typography } from "@/constants/theme";
import { useAuth } from "@/contexts/AuthContext";

type Mode = "login" | "recovery" | "sent";

export default function LoginScreen() {
  const { signIn, resetPassword, sessionNotice } = useAuth();
  const [mode, setMode] = useState<Mode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [captchaResetKey, setCaptchaResetKey] = useState(0);

  const signingIn = mode === "login";
  const submitLabel = signingIn ? "Iniciar sesión" : "Enviar enlace de recuperación";

  function switchMode(next: Mode) {
    if (submitting) return;
    setFormError(null);
    setCaptchaToken(null);
    setMode(next);
  }

  async function submit() {
    if (submitting || !captchaToken) return;
    const cleanEmail = email.trim();
    if (!cleanEmail || (signingIn && !password)) {
      setFormError(signingIn ? "Introduce tu correo y contraseña." : "Introduce tu correo electrónico.");
      return;
    }

    setFormError(null);
    setSubmitting(true);
    try {
      const { error } = signingIn
        ? await signIn(cleanEmail, password, captchaToken)
        : await resetPassword(cleanEmail, captchaToken);
      if (error) setFormError(error.message);
      else if (!signingIn) setMode("sent");
    } finally {
      setSubmitting(false);
      setCaptchaToken(null);
      setCaptchaResetKey((current) => current + 1);
    }
  }

  const showBack = !signingIn;
  return (
    <SafeAreaView style={styles.safeArea} edges={showBack ? ["bottom", "left", "right"] : undefined}>
      {showBack ? <BackBar onPress={() => switchMode("login")} /> : null}
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
        >
          <LeuretBrand width={120} />
          <View style={styles.card}>
            {mode === "sent" ? (
              <>
                <LeuretFeedback
                  tone="success"
                  title="Solicitud enviada"
                  message={`Si hay una cuenta asociada a ${email.trim()}, recibirás un enlace para cambiar tu contraseña. Revisa también la carpeta de correo no deseado.`}
                />
                <LeuretButton
                  label="Volver al inicio de sesión"
                  variant="secondary"
                  icon="arrow-back-outline"
                  onPress={() => switchMode("login")}
                />
              </>
            ) : (
              <>
                <View style={styles.heading}>
                  <Text accessibilityRole="header" style={styles.title}>
                    {signingIn ? "Iniciar sesión" : "Recuperar contraseña"}
                  </Text>
                  <Text style={styles.subtitle}>
                    {signingIn
                      ? "Accede a tu espacio de trabajo."
                      : "Te enviaremos un enlace para recuperar el acceso."}
                  </Text>
                </View>

                {signingIn && sessionNotice && !formError ? (
                  <LeuretFeedback tone="info" compact title={sessionNotice} />
                ) : null}

                <View style={styles.field}>
                  <Text style={styles.label}>Correo electrónico</Text>
                  <View style={styles.inputContainer}>
                    <Ionicons name="mail-outline" size={20} color={colors.textSecondary} />
                    <TextInput
                      accessibilityLabel="Correo electrónico"
                      value={email}
                      onChangeText={setEmail}
                      placeholder="correo@empresa.com"
                      placeholderTextColor={colors.textSecondary}
                      autoCapitalize="none"
                      autoCorrect={false}
                      autoComplete="email"
                      keyboardType="email-address"
                      editable={!submitting}
                      style={styles.input}
                    />
                  </View>
                </View>

                {signingIn ? (
                  <View style={styles.field}>
                    <Text style={styles.label}>Contraseña</Text>
                    <View style={styles.inputContainer}>
                      <Ionicons name="lock-closed-outline" size={20} color={colors.textSecondary} />
                      <TextInput
                        accessibilityLabel="Contraseña"
                        value={password}
                        onChangeText={setPassword}
                        placeholder="Tu contraseña"
                        placeholderTextColor={colors.textSecondary}
                        secureTextEntry={!showPassword}
                        autoCapitalize="none"
                        autoComplete="current-password"
                        editable={!submitting}
                        returnKeyType="go"
                        onSubmitEditing={() => void submit()}
                        style={styles.input}
                      />
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={showPassword ? "Ocultar contraseña" : "Mostrar contraseña"}
                        onPress={() => setShowPassword((current) => !current)}
                        style={styles.visibilityButton}
                      >
                        <Ionicons name={showPassword ? "eye-off-outline" : "eye-outline"} size={21} color={colors.textSecondary} />
                      </Pressable>
                    </View>
                    <Pressable
                      accessibilityRole="button"
                      disabled={submitting}
                      onPress={() => switchMode("recovery")}
                      style={styles.forgotButton}
                    >
                      <Text style={styles.link}>¿Olvidaste tu contraseña?</Text>
                    </Pressable>
                  </View>
                ) : null}

                {formError ? (
                  <LeuretFeedback
                    tone="error"
                    compact
                    title={signingIn ? "No pudimos iniciar sesión" : "No pudimos enviar el enlace"}
                    message={formError}
                  />
                ) : null}

                <TurnstileChallenge
                  key={mode}
                  action={signingIn ? "login" : "recover_password"}
                  onToken={setCaptchaToken}
                  resetKey={captchaResetKey}
                />

                <LeuretButton
                  label={submitLabel}
                  icon={signingIn ? "arrow-forward-outline" : "send-outline"}
                  onPress={() => void submit()}
                  disabled={!captchaToken}
                  loading={submitting}
                />

                {signingIn ? (
                  <View style={styles.registerRow}>
                    <Text style={styles.registerLabel}>¿No tienes una cuenta?</Text>
                    <Pressable accessibilityRole="link" disabled={submitting} onPress={() => router.push("/registro")}>
                      <Text style={styles.link}>Crear cuenta</Text>
                    </Pressable>
                  </View>
                ) : null}
              </>
            )}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  safeArea: { flex: 1, backgroundColor: colors.surfaceDark },
  content: {
    flexGrow: 1,
    justifyContent: "center",
    alignSelf: "center",
    width: "100%",
    maxWidth: 480,
    gap: spacing.lg,
    paddingHorizontal: layout.screenPadding,
    paddingVertical: spacing.xl,
  },
  card: {
    padding: spacing.ml,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    gap: spacing.md,
    ...shadows.raised,
  },
  heading: { gap: spacing.xs },
  title: { ...typography.title, color: colors.text },
  subtitle: { ...typography.body, color: colors.textSecondary },
  field: { gap: spacing.sm },
  label: { ...typography.label, color: colors.text },
  inputContainer: {
    minHeight: 52,
    paddingHorizontal: spacing.base,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: radius.md,
    backgroundColor: colors.background,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  input: { flex: 1, minWidth: 0, color: colors.text, ...typography.body },
  visibilityButton: { minWidth: 44, minHeight: 44, alignItems: "center", justifyContent: "center" },
  forgotButton: { alignSelf: "flex-end", minHeight: 34, justifyContent: "center" },
  link: { ...typography.label, color: colors.accentPressed },
  registerRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, justifyContent: "center" },
  registerLabel: { ...typography.label, color: colors.textSecondary },
});
