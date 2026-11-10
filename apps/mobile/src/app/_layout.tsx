import { type Href, Stack, router } from "expo-router";
import {
  StyleSheet,
  Text,
  View,
} from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import Animated, { useAnimatedStyle, useSharedValue, withRepeat, withSequence, withTiming } from "react-native-reanimated";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { colors } from "@/constants/theme";
import {
  AuthProvider,
  useAuth,
} from "@/contexts/AuthContext";
import {
  CompanyProvider,
  useCompany,
} from "@/contexts/CompanyContext";

import { useEffect, useRef } from "react";
import {
  registerForPushNotificationsAsync,
  unregisterCurrentPushTokenAsync,
} from "@/services/push-notification-service";
import { processOfflineSyncQueue } from "@/services/offline-sync-service";
import { readPendingInvitation } from "@/utils/pending-invitation";
import { useNotificationNavigation } from "@/hooks/useNotificationNavigation";

function LeuretStartupMark() {
  const pulse = useSharedValue(0);

  useEffect(() => {
    pulse.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 780 }),
        withTiming(0, { duration: 780 }),
      ),
      -1,
      false,
    );
  }, [pulse]);

  const haloStyle = useAnimatedStyle(() => ({
    opacity: 0.22 + pulse.value * 0.5,
    transform: [{ scale: 1 + pulse.value * 0.28 }],
  }));

  const markStyle = useAnimatedStyle(() => ({
    transform: [{ scale: 1 + pulse.value * 0.035 }],
  }));

  return (
    <View style={styles.loadingLogo}>
      <Animated.View style={[styles.loadingPulseRing, haloStyle]} />
      <Animated.Image
        source={require("../../assets/images/leuret-logo-header.png")}
        style={[styles.loadingLogoImage, markStyle]}
        resizeMode="contain"
        accessibilityLabel="Logo oficial de LEURET"
      />
    </View>
  );
}

function RootNavigator() {
  const {
    session,
    profile,
    loading: authLoading,
  } = useAuth();

  const {
    activeCompany,
    loading: companyLoading,
  } = useCompany();

  const isAuthenticated = Boolean(session);
  const isContractor = isAuthenticated && profile?.role === "contractor";

  const needsProfileSetup = isContractor && !profile?.primary_category;
  const isApproved = isAuthenticated && Boolean(profile?.active);

  useEffect(() => {
    if (!isApproved) {
      return;
    }

    if (profile?.notifications_opt_in) {
      void registerForPushNotificationsAsync();
    } else {
      void unregisterCurrentPushTokenAsync();
    }

    void processOfflineSyncQueue();
  }, [
    isApproved,
    profile?.notifications_opt_in,
  ]);
  const isPendingApproval = isAuthenticated && !profile?.active && !needsProfileSetup;

  const isClientAuthenticated = isApproved && profile?.role === "client";
  const isContractorAuthenticated = isApproved && profile?.role === "contractor";

  const hasActiveCompany = isContractorAuthenticated && Boolean(activeCompany);
  const needsCompanySetup = isContractorAuthenticated && !activeCompany;

  // Si la persona llegó desde un correo de invitación antes de entrar,
  // la llevamos a unirse en cuanto su cuenta pueda usar una empresa.
  const pendingInvitationChecked = useRef(false);
  const canUseCompany = (hasActiveCompany || needsCompanySetup) && !needsProfileSetup && !companyLoading;

  useEffect(() => {
    if (!canUseCompany || pendingInvitationChecked.current) return;
    pendingInvitationChecked.current = true;
    void readPendingInvitation().then((code) => {
      if (!code) return;
      router.push((hasActiveCompany ? "/equipo/unirme" : "/empresa/unirme") as Href);
    });
  }, [canUseCompany, hasActiveCompany]);

  // Tocar un aviso push abre su presupuesto o factura (también en arranque en frío).
  useNotificationNavigation({
    enabled: isClientAuthenticated || hasActiveCompany,
    isClient: isClientAuthenticated,
  });

  const isInitialLoading = authLoading && !profile;
  const isCompanyInitialLoading =
    isContractorAuthenticated && companyLoading && !activeCompany;

  if (isInitialLoading || isCompanyInitialLoading) {
    return (
      <View style={styles.loading}>
        <View style={styles.loadingOrb} />
        <LeuretStartupMark />

        <Text style={styles.loadingText}>
          Preparando tu espacio de trabajo
        </Text>
      </View>
    );
  }

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: {
          backgroundColor: colors.background,
        },
      }}
    >
      {/* Índice raíz: destino seguro ante enlaces inválidos o rutas protegidas. */}
      <Stack.Screen name="index" />

      {/* Enlace del correo de invitación: solo se abre con /invitacion. */}
      <Stack.Screen name="invitacion" />

      <Stack.Protected guard={!isAuthenticated}>
        <Stack.Screen name="(auth)" />
      </Stack.Protected>

      <Stack.Protected guard={needsProfileSetup}>
        <Stack.Screen name="perfil-profesional" />
      </Stack.Protected>

      <Stack.Protected guard={isPendingApproval}>
        <Stack.Screen name="pendiente" />
      </Stack.Protected>

      <Stack.Protected guard={needsCompanySetup}>
        <Stack.Screen name="empresa" />
      </Stack.Protected>

      <Stack.Protected guard={hasActiveCompany}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="agenda" />
        <Stack.Screen name="calculos" />
        <Stack.Screen name="clientes" />
        <Stack.Screen name="facturas" />
        <Stack.Screen name="presupuestos" />
        <Stack.Screen name="proyectos" />
        <Stack.Screen name="tareas" />
        <Stack.Screen name="equipo" />
        <Stack.Screen name="catalogo" />
      </Stack.Protected>


      <Stack.Protected guard={isClientAuthenticated}>
        <Stack.Screen name="(client-tabs)" />
        <Stack.Screen name="cliente-presupuestos" />
        <Stack.Screen name="cliente-facturas" />
        <Stack.Screen name="cliente-proyectos" />
      </Stack.Protected>

      <Stack.Protected guard={hasActiveCompany || isClientAuthenticated}>
        <Stack.Screen name="perfil" />
      </Stack.Protected>
    </Stack>
  );
}

function AppProviders() {
  return (
    <AuthProvider>
      <CompanyProvider>
        <RootNavigator />
      </CompanyProvider>
    </AuthProvider>
  );
}

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={styles.flex}>
      <SafeAreaProvider>
        <AppProviders />
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },

  loading: {
    flex: 1,
    backgroundColor: colors.surfaceDark,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },

  loadingOrb: {
    position: "absolute",
    width: 330,
    height: 330,
    top: -145,
    right: -170,
    borderRadius: 165,
    borderWidth: 52,
    borderColor: "rgba(255,255,255,0.035)",
  },

  loadingLogo: {
    width: 216,
    height: 170,
    borderRadius: 24,
    backgroundColor: colors.cream,
    alignItems: "center",
    justifyContent: "center",
  },

  loadingPulseRing: {
    position: "absolute",
    width: 216,
    height: 170,
    borderRadius: 24,
    borderWidth: 2,
    borderColor: colors.primary,
    backgroundColor: colors.glowBlue,
  },

  loadingLogoImage: {
    width: 196,
    height: 138,
  },

  loadingText: {
    marginTop: 22,
    color: colors.textLightMuted,
    fontSize: 12,
    fontWeight: "600",
  },

  loadingIndicator: {
    marginTop: 22,
  },
});
