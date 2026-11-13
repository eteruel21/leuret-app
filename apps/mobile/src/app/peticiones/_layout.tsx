import { Stack } from "expo-router";

import { stackBackOptions } from "@/components/back-navigation";
import { RequirePermission } from "@/components/RequirePermission";

export default function JobRequestsLayout() {
  return (
    <RequirePermission capability="jobRequests.view" section="Peticiones de clientes">
      <Stack
        screenOptions={({ route }) => stackBackOptions(route.name === "index" ? "/(tabs)" : "/peticiones")}
      >
        <Stack.Screen name="index" options={{ title: "Peticiones de clientes" }} />
        <Stack.Screen name="[id]" options={{ title: "Petición de trabajo" }} />
        <Stack.Screen name="conversacion" options={{ title: "Conversación" }} />
      </Stack>
    </RequirePermission>
  );
}
