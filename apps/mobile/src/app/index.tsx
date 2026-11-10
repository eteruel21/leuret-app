import { Redirect } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { LeuretLoading } from "@/components/LeuretLoading";
import { colors, radius } from "@/constants/theme";
import { useAuth } from "@/contexts/AuthContext";
import { useCompany } from "@/contexts/CompanyContext";
import { initialRouteFor } from "@/utils/initial-navigation";

/**
 * Ruta de entrada estable. Evita que Expo Router use /invitacion
 * como pantalla de respaldo para rutas protegidas o para la URL raíz.
 */
export default function IndexScreen() {
  const { session, profile, loading: authLoading, signOut } = useAuth();
  const { activeCompany, loading: companyLoading } = useCompany();

  if (
    authLoading ||
    (session && profile?.role === "contractor" && profile.active && companyLoading)
  ) {
    return <LeuretLoading fullScreen message="Preparando tu espacio de trabajo…" />;
  }

  const destination = initialRouteFor({
    authenticated: Boolean(session),
    role: profile?.role,
    active: Boolean(profile?.active),
    primaryCategory: profile?.primary_category,
    hasActiveCompany: Boolean(activeCompany),
  });

  if (destination) return <Redirect href={destination} />;

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
