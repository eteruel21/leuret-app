import { Ionicons } from "@expo/vector-icons";
import { type BottomTabNavigationOptions } from "expo-router/js-tabs";
import { useMemo } from "react";
import { type ColorValue, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { colors, layout, radius, spacing, typography } from "@/constants/theme";

type IconName = React.ComponentProps<typeof Ionicons>["name"];

export function TabIcon({ focused, active, inactive, color }: {
  focused: boolean;
  active: IconName;
  inactive: IconName;
  color: ColorValue;
}) {
  return (
    <View aria-hidden style={[styles.icon, focused && styles.selected]}>
      <Ionicons name={focused ? active : inactive} size={21} color={color} />
    </View>
  );
}

export function useLeuretTabsOptions(): BottomTabNavigationOptions {
  const { bottom } = useSafeAreaInsets();
  return useMemo(() => ({
    tabBarHideOnKeyboard: true,
    tabBarActiveTintColor: colors.accentPressed,
    tabBarInactiveTintColor: colors.textSecondary,
    tabBarLabelPosition: "below-icon",
    tabBarStyle: {
      alignSelf: "center",
      width: "100%",
      maxWidth: layout.maxContentWidth,
      height: layout.tabBarHeight + bottom,
      paddingTop: spacing.xs,
      paddingBottom: spacing.xs + bottom,
      backgroundColor: colors.surface,
      borderTopColor: colors.borderStrong,
    },
    tabBarLabelStyle: { ...typography.caption, fontWeight: "700" },
    sceneStyle: { backgroundColor: colors.background },
  }), [bottom]);
}

const styles = StyleSheet.create({
  icon: {
    minWidth: 42,
    minHeight: 28,
    paddingHorizontal: spacing.sm,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.md,
  },
  selected: { backgroundColor: colors.accentSoft },
});
