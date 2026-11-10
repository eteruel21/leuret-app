import { StyleSheet, Text, View } from "react-native";

import { colors, radius } from "@/constants/theme";
import type { StatusTone } from "@/utils/client-portal";

const TONES: Record<StatusTone, { background: string; color: string }> = {
  neutral: { background: colors.steelSoft, color: colors.textSecondary },
  info: { background: colors.infoSoft, color: colors.primary },
  success: { background: colors.successSoft, color: colors.success },
  warning: { background: colors.warningSoft, color: "#8A6D45" },
  danger: { background: colors.dangerSoft, color: colors.danger },
  accent: { background: colors.accentSoft, color: colors.accent },
};

export function StatusPill({ label, tone = "neutral" }: { label: string; tone?: StatusTone }) {
  const palette = TONES[tone];
  return (
    <View style={[styles.pill, { backgroundColor: palette.background }]}>
      <View style={[styles.dot, { backgroundColor: palette.color }]} />
      <Text style={[styles.text, { color: palette.color }]} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radius.full,
  },
  dot: { width: 6, height: 6, borderRadius: 3 },
  text: { fontSize: 11, fontWeight: "800" },
});
