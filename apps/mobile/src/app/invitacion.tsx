import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { LeuretLoading } from "@/components/LeuretLoading";
import { JoinCompanyForm } from "@/components/JoinCompanyForm";
import { colors, radius } from "@/constants/theme";
import { useAuth } from "@/contexts/AuthContext";
import { savePendingInvitation } from "@/utils/pending-invitation";

/**
 * Destino del enlace del correo de invitación (leuret://invitacion?codigo=…
 * o https://app.leurettech.com/invitacion?codigo=…). Guarda el código y
 * lleva a la persona a unirse, o le pide entrar primero.
 */
export default function InvitationLinkScreen() {
  const params = useLocalSearchParams<{ codigo?: string | string[]; id?: string }>();
  const rawCode = Array.isArray(params.codigo) ? params.codigo[0] : params.codigo;
  const { session, profile, loading: authLoading } = useAuth();
  const [linkCode, setLinkCode] = useState<string | null | undefined>(rawCode ? undefined : null);

  useEffect(() => {
    if (!rawCode) return;
    let active = true;

    void savePendingInvitation(rawCode).then((code) => {
      if (!active) return;
      setLinkCode(code);
      if (Platform.OS === "web" && typeof window !== "undefined") {
        window.history.replaceState(window.history.state, "", window.location.pathname);
      }
    });

    return () => {
      active = false;
    };
  }, [rawCode]);

  if (authLoading || (rawCode && linkCode === undefined)) {
    return <LeuretLoading fullScreen message="Abriendo tu invitación…" />;
  }

  const invalid = Boolean(rawCode && !linkCode);
  if (!invalid && session && profile) {
    return (
      <SafeAreaView style={styles.form} edges={["left", "right", "bottom"]}>
        <JoinCompanyForm key={rawCode ?? params.id ?? "invitaciones"} invitationId={params.id} initialCode={linkCode ?? undefined} />
      </SafeAreaView>
    );
  }

  const content = {
    invalid: {
      icon: "alert-circle-outline" as const,
      title: "Enlace no válido",
      text: "El enlace de invitación está incompleto. Pide que te lo reenvíen o pega el código en Invitaciones de equipo.",
    },
    login: {
      icon: "mail-open-outline" as const,
      title: "Tienes una invitación",
      text: "Usa el correo al que te enviaron la invitación. Cuando entres, podrás ver la empresa y confirmar que quieres unirte.",
    },
  }[invalid ? "invalid" : "login"];

  return (
    <SafeAreaView style={styles.safeArea} edges={["left", "right", "bottom"]}>
      <View style={styles.card}>
        <View style={styles.icon}>
          <Ionicons name={content.icon} size={30} color={colors.primary} />
        </View>
        <Text style={styles.title}>{content.title}</Text>
        <Text style={styles.text}>{content.text}</Text>

        {!invalid ? (
          <>
            <Pressable
              accessibilityRole="button"
              onPress={() => router.replace("/login")}
              style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}
            >
              <Text style={styles.buttonLabel}>Iniciar sesión</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              onPress={() => router.replace({ pathname: "/registro", params: { equipo: "1" } })}
              style={({ pressed }) => [
                styles.button,
                styles.buttonSmall,
                styles.buttonSecondary,
                pressed && styles.buttonPressed,
              ]}
            >
              <Text style={[styles.buttonLabel, styles.buttonSecondaryLabel]}>Crear cuenta</Text>
            </Pressable>
          </>
        ) : (
          <Pressable
            accessibilityRole="button"
            onPress={() => router.replace("/")}
            style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}
          >
            <Text style={styles.buttonLabel}>Ir a Leuret</Text>
          </Pressable>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  form: { flex: 1, backgroundColor: colors.background },
  safeArea: { flex: 1, justifyContent: "center", padding: 20, backgroundColor: colors.background },
  card: { padding: 24, borderRadius: radius.xl, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
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
  // Botones nativos con fondo explícito: buen contraste también en Safari/iOS.
  button: {
    minHeight: 52,
    width: "100%",
    marginTop: 20,
    paddingHorizontal: 18,
    borderRadius: radius.md,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  buttonPressed: { opacity: 0.85 },
  buttonLabel: { color: colors.textInverse, fontSize: 15, fontWeight: "800" },
  buttonSmall: { marginTop: 10 },
  buttonSecondary: {
    backgroundColor: colors.surfaceRaised,
    borderWidth: 1,
    borderColor: colors.borderStrong,
  },
  buttonSecondaryLabel: { color: colors.primary },
});
