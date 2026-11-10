import { Stack } from "expo-router";

import { colors } from "@/constants/theme";

export default function TeamLayout() {
  return (
    <Stack
      screenOptions={{
        headerStyle: {
          backgroundColor: colors.surfaceDark,
        },
        headerTintColor: colors.textLight,
        headerTitleStyle: {
          fontWeight: "800",
        },
        contentStyle: {
          backgroundColor: colors.background,
        },
      }}
    >
      <Stack.Screen name="index" options={{ title: "Equipo" }} />
      <Stack.Screen name="historial" options={{ title: "Historial del equipo" }} />
      <Stack.Screen name="unirme" options={{ title: "Unirme a una empresa" }} />
    </Stack>
  );
}
