import { Ionicons } from "@expo/vector-icons";
import { ActivityIndicator, StyleSheet, Text, type PressableProps, type StyleProp, type ViewStyle } from "react-native";

import { MotionPressable } from "@/components/MotionPressable";
import { colors, motion, radius, shadows, spacing, typography } from "@/constants/theme";

type IconName = React.ComponentProps<typeof Ionicons>["name"];
type LeuretButtonVariant = "primary" | "secondary" | "ghost" | "danger";

type LeuretButtonProps = Omit<PressableProps, "children" | "style"> & {
  label: string;
  icon?: IconName;
  variant?: LeuretButtonVariant;
  loading?: boolean;
  fullWidth?: boolean;
  style?: StyleProp<ViewStyle>;
};

export function LeuretButton({
  label,
  icon,
  variant = "primary",
  loading = false,
  fullWidth = false,
  disabled,
  accessibilityState,
  style,
  ...props
}: LeuretButtonProps) {
  const isDisabled = disabled || loading;
  const buttonVariantStyle = variant === "primary" ? styles.primaryButton : variant === "secondary" ? styles.secondaryButton : variant === "danger" ? styles.dangerButton : styles.ghostButton;
  const textVariantStyle = variant === "primary" || variant === "danger" ? styles.lightText : variant === "secondary" ? styles.secondaryText : styles.ghostText;
  const iconColor = variant === "primary" || variant === "danger" ? colors.textLight : variant === "secondary" ? colors.primary : colors.accent;

  return (
    <MotionPressable
      accessibilityRole="button"
      accessibilityLabel={label}
      {...props}
      accessibilityState={{ ...accessibilityState, disabled: Boolean(isDisabled), busy: loading }}
      disabled={isDisabled}
      pressedScale={motion.pressScale}
      style={[styles.button, buttonVariantStyle, fullWidth && styles.fullWidth, isDisabled && styles.disabled, style]}
    >
      {loading ? <ActivityIndicator color={iconColor} /> : icon ? <Ionicons name={icon} size={19} color={iconColor} /> : null}
      <Text style={[styles.label, textVariantStyle]}>{label}</Text>
    </MotionPressable>
  );
}

const styles = StyleSheet.create({
  button: {
    minHeight: 52,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.base,
    borderRadius: radius.md,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
  },
  fullWidth: {
    width: "100%",
  },
  primaryButton: {
    backgroundColor: colors.accentPressed,
    ...shadows.glow,
  },
  secondaryButton: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    ...shadows.soft,
  },
  ghostButton: {
    backgroundColor: colors.accentSoft,
  },
  dangerButton: {
    backgroundColor: colors.accentPressed,
  },
  label: {
    ...typography.label,
    flexShrink: 1,
    textAlign: "center",
  },
  lightText: {
    color: colors.textLight,
  },
  secondaryText: {
    color: colors.primary,
  },
  ghostText: {
    color: colors.accentPressed,
  },
  disabled: {
    opacity: 0.55,
  },
});
