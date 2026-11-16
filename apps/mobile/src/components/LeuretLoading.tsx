import { ActivityIndicator, StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";

import { colors, radius, spacing, typography } from "@/constants/theme";

type LeuretLoadingProps = {
  message?: string;
  fullScreen?: boolean;
  compact?: boolean;
  style?: StyleProp<ViewStyle>;
};

export function LeuretLoading({
  message = "Cargando…",
  fullScreen = false,
  compact = false,
  style,
}: LeuretLoadingProps) {
  return (
    <View
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={message || "Cargando"}
      accessibilityState={{ busy: true }}
      accessibilityLiveRegion="polite"
      style={[styles.container, compact && styles.compact, fullScreen && styles.fullScreen, style]}
    >
      <ActivityIndicator color={colors.accentPressed} />
      {message ? <Text style={styles.message}>{message}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    minHeight: 136,
    padding: spacing.lg,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.base,
  },
  compact: {
    minHeight: 80,
    padding: spacing.md,
  },
  fullScreen: {
    flex: 1,
    borderRadius: 0,
    backgroundColor: colors.background,
  },
  message: {
    ...typography.label,
    color: colors.textSecondary,
    textAlign: "center",
  },
});
