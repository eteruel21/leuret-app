import { Stack } from "expo-router";

import { stackBackOptions } from "@/components/back-navigation";

export default function AgendaLayout() {
  return (
    <Stack
      screenOptions={stackBackOptions("/(tabs)/agenda")}
    >
      <Stack.Screen
        name="[id]"
        options={{ title: "Actividad" }}
      />
    </Stack>
  );
}
