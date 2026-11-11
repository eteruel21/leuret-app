import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import TurnstileChallenge from "@/components/TurnstileChallenge";
import { colors, radius, shadows } from "@/constants/theme";
import { confirmEmailApi, resendVerificationEmail } from "@/services/api";

type VerificationStatus = "waiting" | "verifying" | "verified" | "error";

export default function ConfirmEmailScreen() {
  const params = useLocalSearchParams<{ token?: string; email?: string }>();
  const token = typeof params.token === "string" ? params.token.trim() : "";
  const attemptedTokenRef = useRef<string | null>(null);
  const [status, setStatus] = useState<VerificationStatus>(token ? "verifying" : "waiting");
  const [verificationError, setVerificationError] = useState("");
  const [email, setEmail] = useState(params.email || "");
  const [resending, setResending] = useState(false);
  const [resendMessage, setResendMessage] = useState("");
  const [resendCaptchaToken, setResendCaptchaToken] = useState<string | null>(null);
  const [resendCaptchaResetKey, setResendCaptchaResetKey] = useState(0);

  useEffect(() => {
    if (params.email) setEmail(params.email);
  }, [params.email]);

  useEffect(() => {
    if (!token || attemptedTokenRef.current === token) return;
    attemptedTokenRef.current = token;
    setStatus("verifying");
    setVerificationError("");

    // El enlace ya fue recibido: retirarlo de la barra de direcciones y
    // del historial antes de llamar a la API, sin mostrarlo en la pantalla.
    if (Platform.OS === "web" && typeof window !== "undefined") {
      window.history.replaceState(window.history.state, "", window.location.pathname);
    }

    void confirmEmailApi(token)
      .then(() => setStatus("verified"))
      .catch((error: unknown) => {
        const message = error instanceof Error ? error.message : "";
        setVerificationError(message || "El enlace ha expirado o no es válido.");
        setStatus("error");
      });
  }, [token]);

  async function handleResend() {
    const cleanEmail = email.trim().toLowerCase();
    setResendMessage("");

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      setResendMessage("Introduce el correo electrónico asociado a tu cuenta.");
      return;
    }

    if (!resendCaptchaToken) {
      setResendMessage("Completa la verificación de seguridad antes de reenviar el correo.");
      return;
    }

    const captchaToken = resendCaptchaToken;
    setResendCaptchaToken(null);
    setResendCaptchaResetKey((current) => current + 1);

    try {
      setResending(true);
      const response = await resendVerificationEmail(cleanEmail, captchaToken);
      setResendMessage(
        response.message ||
          "Si tu cuenta necesita verificación, recibirás un nuevo correo."
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      setResendMessage(message || "No se pudo reenviar el correo. Inténtalo nuevamente.");
    } finally {
      setResending(false);
    }
  }

  const verified = status === "verified";
  const verifying = status === "verifying";
  const showResend = status === "waiting" || status === "error";

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView contentContainerStyle={styles.scrollContent}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Volver"
            style={styles.backButton}
            onPress={() => router.replace("/(auth)/login")}
          >
            <Ionicons name="arrow-back" size={24} color={colors.text} />
          </Pressable>

          <View style={styles.header}>
            <View style={styles.iconContainer}>
              <Ionicons
                name={verified ? "checkmark-circle" : status === "error" ? "alert-circle" : "mail-unread"}
                size={40}
                color={verified ? colors.success : status === "error" ? colors.danger : colors.primary}
              />
            </View>
            <Text style={styles.title}>
              {verified
                ? "¡Correo verificado!"
                : verifying
                  ? "Verificando tu correo..."
                  : status === "error"
                    ? "No pudimos verificar tu correo"
                    : "Verifica tu correo electrónico"}
            </Text>
            <Text style={styles.subtitle}>
              {verified
                ? "Tu correo fue confirmado correctamente. Regresa a Leuret App para iniciar sesión y continuar tu registro."
                : verifying
                  ? "Estamos confirmando tu cuenta de forma segura."
                  : status === "error"
                    ? verificationError
                    : "Revisa tu correo y presiona el botón Verificar. No necesitas copiar ningún código."}
            </Text>
          </View>

          <View style={styles.formCard}>
            {verifying ? (
              <View style={styles.centered}>
                <ActivityIndicator size="large" color={colors.primary} />
                <Text style={styles.helpText}>Verificando tu cuenta...</Text>
              </View>
            ) : null}

            {verified ? (
              <View style={styles.centered}>
                <Text style={styles.successText}>Ya puedes continuar desde Leuret App.</Text>
                <Text style={styles.helpText}>
                  La aprobación del administrador, cuando corresponda, es un proceso separado.
                </Text>
                <Pressable
                  accessibilityRole="button"
                  style={styles.primaryButton}
                  onPress={() => router.replace("/(auth)/login")}
                >
                  <Text style={styles.primaryButtonText}>Ir a iniciar sesión</Text>
                </Pressable>
              </View>
            ) : null}

            {showResend ? (
              <>
                <Text style={styles.label}>Reenviar correo de verificación</Text>
                <TextInput
                  style={styles.input}
                  placeholder="correo@empresa.com"
                  value={email}
                  onChangeText={setEmail}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                  autoComplete="email"
                />

                <TurnstileChallenge
                  action="resend_verification"
                  onToken={setResendCaptchaToken}
                  resetKey={resendCaptchaResetKey}
                />

                {resendMessage ? (
                  <Text style={styles.helpText}>{resendMessage}</Text>
                ) : null}

                <Pressable
                  accessibilityRole="button"
                  style={[
                    styles.secondaryButton,
                    (resending || !resendCaptchaToken) && styles.buttonDisabled
                  ]}
                  onPress={handleResend}
                  disabled={resending || !resendCaptchaToken}
                >
                  {resending ? (
                    <ActivityIndicator color={colors.primary} />
                  ) : (
                    <Text style={styles.secondaryButtonText}>Reenviar correo</Text>
                  )}
                </Pressable>
              </>
            ) : null}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.background
  },
  flex: {
    flex: 1
  },
  scrollContent: {
    padding: 20,
    flexGrow: 1
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16
  },
  header: {
    alignItems: "center",
    marginBottom: 24
  },
  iconContainer: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: colors.primaryWash,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16
  },
  title: {
    fontSize: 24,
    fontWeight: "700",
    color: colors.text,
    textAlign: "center"
  },
  subtitle: {
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: "center",
    marginTop: 8
  },
  formCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: 20,
    ...shadows.soft
  },
  centered: {
    alignItems: "center",
    gap: 16
  },
  successText: {
    color: colors.success,
    fontWeight: "700",
    fontSize: 17,
    textAlign: "center"
  },
  helpText: {
    color: colors.textSecondary,
    fontSize: 14,
    textAlign: "center",
    marginVertical: 12
  },
  label: {
    fontSize: 14,
    fontWeight: "600",
    color: colors.text,
    marginBottom: 8
  },
  input: {
    height: 48,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: 14,
    fontSize: 15,
    color: colors.text,
    marginBottom: 16
  },
  primaryButton: {
    minHeight: 48,
    width: "100%",
    paddingHorizontal: 18,
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center"
  },
  secondaryButton: {
    minHeight: 48,
    borderWidth: 1,
    borderColor: colors.primary,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 12
  },
  secondaryButtonText: {
    color: colors.primary,
    fontSize: 15,
    fontWeight: "600"
  },
  buttonDisabled: {
    opacity: 0.6
  },
  primaryButtonText: {
    color: colors.textInverse,
    fontSize: 16,
    fontWeight: "600"
  }
});
