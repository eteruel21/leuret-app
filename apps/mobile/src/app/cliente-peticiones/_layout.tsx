import { Stack } from "expo-router";

import { stackBackOptions } from "@/components/back-navigation";

export default function ClientJobRequestsLayout() {
  return (
    <Stack screenOptions={stackBackOptions("/(client-tabs)/peticiones")}>
      <Stack.Screen name="nueva" options={{ title: "Nueva petición" }} />
      <Stack.Screen name="[id]" options={{ title: "Petición de trabajo" }} />
      <Stack.Screen name="conversacion" options={{ title: "Conversación" }} />
    </Stack>
  );
}
