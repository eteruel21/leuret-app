import { Stack } from "expo-router";

import { stackBackOptions } from "@/components/back-navigation";
import { RequirePermission } from "@/components/RequirePermission";

export default function BudgetsLayout() {
  return (
    <RequirePermission capability="budgets.view" section="Presupuestos">
      <Stack
        screenOptions={({ route }) =>
          stackBackOptions(route.name === "index" ? "/(tabs)/mas" : "/presupuestos")
        }
      >
        <Stack.Screen name="index" options={{ title: "Presupuestos" }} />
        <Stack.Screen name="[id]" options={{ title: "Detalle de presupuesto" }} />
      </Stack>
    </RequirePermission>
  );
}
