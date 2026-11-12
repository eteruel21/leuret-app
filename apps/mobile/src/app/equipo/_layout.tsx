import { Stack } from "expo-router";

import { stackBackOptions } from "@/components/back-navigation";

export default function TeamLayout() {
  return (
    <Stack
      screenOptions={({ route }) =>
        stackBackOptions(route.name === "index" ? "/(tabs)/mas" : "/equipo")
      }
    >
      <Stack.Screen name="index" options={{ title: "Equipo" }} />
      <Stack.Screen name="historial" options={{ title: "Historial del equipo" }} />
      <Stack.Screen name="unirme" options={{ title: "Unirme a una empresa" }} />
    </Stack>
  );
}
