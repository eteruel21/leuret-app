import { router, useFocusEffect } from "expo-router";
import { useCallback, useContext } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { LeuretLoading } from "@/components/LeuretLoading";
import { colors, radius } from "@/constants/theme";
import { useAuth } from "@/contexts/AuthContext";
import { useCompany } from "@/contexts/CompanyContext";
import { ScreenResumeContext } from "@/contexts/screen-resume-context";
import { initialRouteFor } from "@/utils/initial-navigation";
import { readPendingInvitation } from "@/utils/pending-invitation";

/**
 * Ruta de entrada estable. Evita que Expo Router use /invitacion
 * como pantalla de respaldo para rutas protegidas o para la URL raíz.
 */
export default function IndexScreen() {
  const { session, profile, loading: authLoading, signOut } = useAuth();
  const { activeCompany, loading: companyLoading } = useCompany();
  const takeStartupScreen = useContext(ScreenResumeContext);
  const loading = authLoading ||
    Boolean(session && profile?.active && companyLoading);
  const destination = loading ? null : initialRouteFor({
    authenticated: Boolean(session),
    role: profile?.role,
    active: Boolean(profile?.active),
    primaryCategory: profile?.primary_category,
    hasActiveCompany: Boolean(activeCompany),
    hasContractorApproval: Boolean(profile?.contractor_approved_at),
  });

  useFocusEffect(useCallback(() => {
    if (!destination) return;
    let focused = true;
    void readPendingInvitation().then((code) => {
      if (!focused) return;
      router.replace(session && code ? "/invitacion" : takeStartupScreen() ?? destination);
    });
    return () => { focused = false; };
  }, [destination, session?.sessionId, takeStartupScreen]));

  if (loading || destination) {
    return <LeuretLoading fullScreen message="Preparando tu espacio de trabajo…" />;
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Cuenta sin espacio móvil</Text>
      <Text style={styles.description}>
        Esta cuenta no tiene una pantalla de inicio habilitada en Leuret App.
        Si administras la plataforma, utiliza el panel de administración web.
      </Text>
      <Pressable
        accessibilityRole="button"
        onPress={() => void signOut()}
        style={({ pressed }) => [styles.button, pressed && styles.pressed]}
      >
        <Text style={styles.buttonLabel}>Cerrar sesión</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    padding: 24,
    backgroundColor: colors.background,
  },
  title: {
    color: colors.text,
    fontSize: 23,
    fontWeight: "800",
  },
  description: {
    marginTop: 12,
    color: colors.textSecondary,
    fontSize: 15,
    lineHeight: 23,
  },
  button: {
    minHeight: 52,
    marginTop: 24,
    borderRadius: radius.md,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  pressed: { opacity: 0.85 },
  buttonLabel: {
    color: colors.textInverse,
    fontSize: 15,
    fontWeight: "800",
  },
});
