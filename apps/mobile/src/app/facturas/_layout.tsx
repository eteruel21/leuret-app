import { Stack } from "expo-router";

import { stackBackOptions } from "@/components/back-navigation";
import { RequirePermission } from "@/components/RequirePermission";

export default function InvoicesLayout() {
  return (
    <RequirePermission capability="invoices.view" section="Facturas">
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
    </RequirePermission>
  );
}
