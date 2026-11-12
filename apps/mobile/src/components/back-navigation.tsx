import { Ionicons } from "@expo/vector-icons";
import { type Href, type NativeStackNavigationOptions, router } from "expo-router";
import { Platform, Pressable, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { colors, radius, spacing } from "@/constants/theme";
import { confirmAction } from "@/utils/alert";

type BackDestination = Href | (() => void);

type BackButtonProps = {
  fallback?: BackDestination;
  fallbackMode?: "replace" | "navigate";
  onPress?: () => void;
  tone?: "dark" | "light";
};

export function BackButton({
  fallback = "/",
  fallbackMode = "replace",
  onPress,
  tone = "dark",
}: BackButtonProps) {
  function goBack() {
    if (router.canGoBack()) {
      router.back();
    } else if (typeof fallback === "function") {
      fallback();
    } else if (fallbackMode === "navigate") {
      router.navigate(fallback);
    } else {
      router.replace(fallback);
    }
  }

  return (
    <Pressable
      accessibilityLabel="Regresar"
      accessibilityRole="button"
      onPress={onPress ?? goBack}
      style={({ pressed }) => [
        styles.button,
        tone === "dark" ? styles.darkButton : styles.lightButton,
        pressed && styles.pressed,
      ]}
    >
      <Ionicons
        name="arrow-back"
        size={22}
        color={tone === "dark" ? colors.textLight : colors.text}
      />
    </Pressable>
  );
}

export function BackBar({ tone = "dark", ...buttonProps }: BackButtonProps) {
  return (
    <SafeAreaView
      edges={["top", "left", "right"]}
      style={[styles.bar, tone === "dark" ? styles.darkBar : styles.lightBar]}
    >
      <BackButton tone={tone} {...buttonProps} />
    </SafeAreaView>
  );
}

export function HeaderBackButton(props: BackButtonProps) {
  return (
    <View style={Platform.OS === "web" ? styles.webHeaderButton : undefined}>
      <BackButton {...props} />
    </View>
  );
}

export function stackBackOptions(fallback: BackDestination): NativeStackNavigationOptions {
  return {
    headerStyle: { backgroundColor: colors.surfaceDark },
    headerTintColor: colors.textLight,
    headerTitleStyle: { fontWeight: "800" },
    headerBackVisible: false,
    headerLeft: () => <HeaderBackButton fallback={fallback} />,
    contentStyle: { backgroundColor: colors.background },
  };
}

export async function confirmReturnToLogin(signOut: () => Promise<unknown>): Promise<void> {
  const confirmed = await confirmAction({
    title: "Volver al inicio de sesión",
    message: "Para regresar a la pantalla de acceso, debes cerrar tu sesión.",
    confirmText: "Cerrar sesión",
  });
  if (confirmed) await signOut();
}

const styles = StyleSheet.create({
  bar: {
    alignItems: "flex-start",
    paddingHorizontal: spacing.ml,
    paddingVertical: spacing.xs,
  },
  darkBar: { backgroundColor: colors.surfaceDark },
  lightBar: { backgroundColor: colors.background },
  webHeaderButton: { marginStart: spacing.md, marginEnd: spacing.xs },
  button: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  darkButton: { backgroundColor: colors.surfaceDarkRaised, borderColor: colors.glowSoft },
  lightButton: { backgroundColor: colors.surface, borderColor: colors.border },
  pressed: { opacity: 0.72 },
});
