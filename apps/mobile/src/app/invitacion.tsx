import { Ionicons } from "@expo/vector-icons";
import { type Href, router, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { LeuretButton } from "@/components/LeuretButton";
import { LeuretLoading } from "@/components/LeuretLoading";
import { colors, radius } from "@/constants/theme";
import { useAuth } from "@/contexts/AuthContext";
import { useCompany } from "@/contexts/CompanyContext";
import { savePendingInvitation } from "@/utils/pending-invitation";

/**
 * Destino del enlace del correo de invitación (leuret://invitacion?codigo=…
 * o https://app.leurettech.com/invitacion?codigo=…). Guarda el código y
 * lleva a la persona a unirse, o le pide entrar primero.
 */
export default function InvitationLinkScreen() {
  const params = useLocalSearchParams<{ codigo?: string | string[] }>();
  const rawCode = Array.isArray(params.codigo) ? params.codigo[0] : params.codigo;
  const { session, profile, loading: authLoading } = useAuth();
  const { activeCompany, loading: companyLoading } = useCompany();
  const [state, setState] = useState<"checking" | "invalid" | "login" | "waiting" | "client">("checking");

  useEffect(() => {
    if (authLoading) return;
    let active = true;

    void savePendingInvitation(rawCode).then((code) => {
      if (!active) return;
      if (!code) {
        setState("invalid");
        return;
      }
      if (!session) {
        setState("login");
        return;
      }
      if (profile?.role === "client") {
        setState("client");
        return;
      }
      if (profile?.role !== "contractor" || !profile.active) {
        setState("waiting");
        return;
      }
      if (companyLoading) return;
      router.replace((activeCompany ? "/equipo/unirme" : "/empresa/unirme") as Href);
    });

    return () => {
      active = false;
    };
  }, [authLoading, companyLoading, session, profile?.role, profile?.active, activeCompany, rawCode]);

  if (state === "checking") {
    return <LeuretLoading fullScreen message="Abriendo tu invitación…" />;
  }

  const content = {
    invalid: {
      icon: "alert-circle-outline" as const,
      title: "Enlace no válido",
      text: "El enlace de invitación está incompleto. Pide que te lo reenvíen o pega el código desde Más → Unirme a una empresa.",
    },
    login: {
      icon: "mail-open-outline" as const,
      title: "Tienes una invitación",
      text: "Inicia sesión o crea tu cuenta con el mismo correo al que llegó la invitación. Te uniremos a la empresa en cuanto entres.",
    },
    waiting: {
      icon: "time-outline" as const,
      title: "Invitación guardada",
      text: "Tu cuenta todavía se está activando. La invitación quedó guardada y se aplicará cuando tu cuenta esté aprobada.",
    },
    client: {
      icon: "person-circle-outline" as const,
      title: "Esta invitación es para un equipo",
      text: "Entraste con una cuenta de cliente. Para unirte al equipo de la empresa, entra con una cuenta de profesional registrada con el correo invitado.",
    },
  }[state];

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.card}>
        <View style={styles.icon}>
          <Ionicons name={content.icon} size={30} color={colors.primary} />
        </View>
        <Text style={styles.title}>{content.title}</Text>
        <Text style={styles.text}>{content.text}</Text>

        {state === "login" ? (
          <>
            <LeuretButton label="Iniciar sesión" icon="log-in-outline" fullWidth onPress={() => router.replace("/login" as Href)} style={styles.button} />
            <LeuretButton label="Crear cuenta" variant="secondary" fullWidth onPress={() => router.replace("/registro" as Href)} style={styles.buttonSmall} />
          </>
        ) : (
          <LeuretButton label="Ir a Leuret" fullWidth onPress={() => router.replace("/" as Href)} style={styles.button} />
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
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
  button: { marginTop: 20 },
  buttonSmall: { marginTop: 10 },
});
