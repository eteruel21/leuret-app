import { type ErrorBoundaryProps, Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { StyleSheet, View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";

import { stackBackOptions } from "@/components/back-navigation";
import { LeuretBrand } from "@/components/LeuretBrand";
import { LeuretFeedback } from "@/components/LeuretFeedback";
import { LeuretLoading } from "@/components/LeuretLoading";
import { colors, layout, spacing } from "@/constants/theme";
import {
  AuthProvider,
  useAuth,
} from "@/contexts/AuthContext";
import {
  CompanyProvider,
  useCompany,
} from "@/contexts/CompanyContext";
import { ScreenResumeContext, useScreenResume } from "@/contexts/screen-resume-context";

import { useEffect, useMemo } from "react";
import {
  registerForPushNotificationsAsync,
  subscribeToPushTokenChanges,
  unregisterCurrentPushTokenAsync,
} from "@/services/push-notification-service";
import { useBackgroundSync } from "@/hooks/useBackgroundSync";
import { initialRouteFor } from "@/utils/initial-navigation";
import { useNotificationNavigation } from "@/hooks/useNotificationNavigation";
import { installWebAlert } from "@/utils/alert";

// En la web, Alert.alert no muestra nada: se reemplaza antes del primer render.
installWebAlert();

function StartupScreen({ title, message, onRetry }: { title?: string; message?: string; onRetry?: () => void }) {
  return (
    <SafeAreaView style={styles.startup}>
      {/* Fondo claro: barra de estado oscura. */}
      <StatusBar style="dark" />
      <View style={styles.startupContent}>
        <LeuretBrand width={120} />
        {title && onRetry ? (
          <LeuretFeedback
            tone="error"
            title={title}
            message={message}
            actionLabel="Reintentar"
            onAction={onRetry}
          />
        ) : (
          <LeuretLoading message={message ?? "Recuperando tu sesión…"} compact />
        )}
      </View>
    </SafeAreaView>
  );
}

export function ErrorBoundary({ retry }: ErrorBoundaryProps) {
  return (
    <SafeAreaProvider>
      <StartupScreen
        title="No pudimos abrir esta pantalla"
        message="Inténtalo de nuevo para volver a cargarla."
        onRetry={() => void retry()}
      />
    </SafeAreaProvider>
  );
}

function RootNavigator() {
  const {
    session,
    profile,
    loading: authLoading,
    restoreError,
    retryRestore,
  } = useAuth();

  const {
    activeCompany,
    memberships,
    loading: companyLoading,
    initialError: companyError,
    refreshCompanies,
    setActiveCompanyId,
    useClientSpace: switchToClientSpace,
  } = useCompany();
  const memberCompanyIds = useMemo(
    () => memberships.filter((membership) => membership.active).map((membership) => membership.company_id),
    [memberships],
  );

  const isAuthenticated = Boolean(session);
  const isContractor = isAuthenticated && profile?.role === "contractor";

  const isApproved = isAuthenticated && Boolean(profile?.active);
  const needsProfileSetup = isContractor && !profile?.primary_category && !isApproved;
  const canUseSpaces = isApproved && (isContractor || profile?.role === "client");
  const hasContractorApproval = Boolean(profile?.contractor_approved_at);

  useEffect(() => {
    if (!isApproved) {
      return;
    }

    if (profile?.notifications_opt_in) {
      void registerForPushNotificationsAsync();
    } else {
      void unregisterCurrentPushTokenAsync();
    }
  }, [
    isApproved,
    profile?.id,
    profile?.notifications_opt_in,
  ]);

  // Si el sistema rota el token push, se vuelve a registrar.
  const pushEnabled = isApproved && Boolean(profile?.notifications_opt_in);
  useEffect(() => {
    if (!pushEnabled) return;
    return subscribeToPushTokenChanges();
  }, [pushEnabled]);
  useBackgroundSync(isApproved, profile?.id ?? null);
  const isPendingApproval = isAuthenticated && !profile?.active && !needsProfileSetup;

  const isClientAuthenticated = isApproved && profile?.role === "client";

  const hasActiveCompany = canUseSpaces && Boolean(activeCompany);
  const canCreateCompany = canUseSpaces && hasContractorApproval && Boolean(profile?.primary_category);
  const isInitialLoading = authLoading && !profile;
  const isCompanyInitialLoading =
    canUseSpaces && companyLoading && !activeCompany;
  const loading = isInitialLoading || isCompanyInitialLoading;
  const startupError = restoreError ?? (canUseSpaces ? companyError : null);

  const initialRoute = initialRouteFor({
    authenticated: isAuthenticated,
    role: profile?.role,
    active: isApproved,
    primaryCategory: profile?.primary_category,
    hasActiveCompany,
    hasContractorApproval,
  });
  const resumeScope = initialRoute === "/login" ? null : initialRoute;
  const resumeKey = session?.sessionId && profile?.id && resumeScope
    ? JSON.stringify([
      session.sessionId, profile.id, resumeScope,
      resumeScope === "/(tabs)" ? activeCompany?.id : null,
    ])
    : null;
  const resume = useScreenResume({
    authenticated: isAuthenticated,
    loading: loading || Boolean(startupError),
    scope: resumeScope,
    scopeKey: resumeKey,
  });
  const navigationReady = !loading && !startupError && resume.ready;

  // Tocar un aviso abre su solicitud o documento, incluso en arranque en frío.
  // Si el aviso es de otro espacio u otra empresa, primero cambia a ese espacio.
  useNotificationNavigation({
    enabled: navigationReady && canUseSpaces,
    isClient: isClientAuthenticated && !hasActiveCompany,
    activeCompanyId: activeCompany?.id ?? null,
    memberCompanyIds,
    hasClientSpace: isClientAuthenticated,
    switchToCompany: setActiveCompanyId,
    switchToClientSpace,
  });

  if (startupError) {
    return (
      <StartupScreen
        title={restoreError ? "No pudimos recuperar tu sesión" : "No pudimos cargar tu espacio"}
        message={startupError}
        onRetry={restoreError ? () => void retryRestore() : () => void refreshCompanies()}
      />
    );
  }

  if (!navigationReady) {
    return <StartupScreen message={authLoading ? "Recuperando tu sesión…" : "Preparando tu espacio de trabajo…"} />;
  }

  return (
    <ScreenResumeContext.Provider value={resume.takeStartupScreen}>
      {/* La mayoría de las pantallas empiezan con un encabezado azul marino;
          las de fondo claro usan <FocusAwareStatusBar style="dark" />. */}
      <StatusBar style="light" />
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
        <Stack.Screen
          name="invitacion"
          options={{ ...stackBackOptions("/"), headerShown: true, title: "Invitación" }}
        />

        <Stack.Protected guard={!isAuthenticated}>
          <Stack.Screen name="(auth)" />
        </Stack.Protected>

        <Stack.Protected guard={needsProfileSetup || canUseSpaces}>
          <Stack.Screen name="perfil-profesional" />
        </Stack.Protected>

        <Stack.Protected guard={isPendingApproval}>
          <Stack.Screen name="pendiente" />
        </Stack.Protected>

        <Stack.Protected guard={canCreateCompany}>
          <Stack.Screen name="empresa" />
        </Stack.Protected>

        <Stack.Protected guard={canUseSpaces}>
          <Stack.Screen
            name="espacios"
            options={{ ...stackBackOptions(hasActiveCompany ? "/(tabs)" : "/"), headerShown: true, title: "Espacios de trabajo" }}
          />
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
          <Stack.Screen name="peticiones" />
          <Stack.Screen name="ventas" />
        </Stack.Protected>

        <Stack.Protected guard={isClientAuthenticated}>
          <Stack.Screen name="(client-tabs)" />
          <Stack.Screen name="contratistas" />
          <Stack.Screen name="cliente-presupuestos" />
          <Stack.Screen name="cliente-facturas" />
          <Stack.Screen name="cliente-proyectos" />
          <Stack.Screen name="cliente-peticiones" />
        </Stack.Protected>

        <Stack.Protected guard={canUseSpaces}>
          <Stack.Screen name="perfil" />
        </Stack.Protected>
        <Stack.Protected guard={hasActiveCompany || isClientAuthenticated}>
          <Stack.Screen name="solicitudes" options={{ ...stackBackOptions(initialRoute ?? "/"), headerShown: true, title: "Solicitudes de vinculación" }} />
          <Stack.Screen name="notificaciones" options={{ ...stackBackOptions(initialRoute ?? "/"), headerShown: true, title: "Notificaciones" }} />
        </Stack.Protected>
      </Stack>
    </ScreenResumeContext.Provider>
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
  flex: { flex: 1 },
  startup: {
    flex: 1,
    backgroundColor: colors.background,
    justifyContent: "center",
    paddingHorizontal: spacing.lg,
  },
  startupContent: {
    alignSelf: "center",
    alignItems: "center",
    width: "100%",
    maxWidth: layout.maxContentWidth / 2,
    gap: spacing.lg,
  },
});
