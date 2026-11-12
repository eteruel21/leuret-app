import { Stack } from "expo-router";

import { stackBackOptions } from "@/components/back-navigation";

export default function CatalogLayout() {
  return (
    <Stack
      screenOptions={stackBackOptions("/(tabs)/mas")}
    >
      <Stack.Screen name="index" options={{ title: "Catálogo" }} />
    </Stack>
  );
}
