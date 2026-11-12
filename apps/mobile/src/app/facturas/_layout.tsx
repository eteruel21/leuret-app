import { Stack } from "expo-router";

import { stackBackOptions } from "@/components/back-navigation";

export default function InvoicesLayout() {
  return (
    <Stack
      screenOptions={({ route }) =>
        stackBackOptions(route.name === "index" ? "/(tabs)/mas" : "/facturas")
      }
    >
      <Stack.Screen
        name="index"
        options={{
          title: "Facturas",
        }}
      />

      <Stack.Screen
        name="[id]"
        options={{
          title: "Detalle de factura",
        }}
      />

      <Stack.Screen
        name="settings"
        options={{
          title: "Diseño de Factura",
          presentation: "card",
        }}
      />
    </Stack>
  );
}
