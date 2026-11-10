import { Stack } from "expo-router";

import { RequirePermission } from "@/components/RequirePermission";

import { colors } from "../../constants/theme";

export default function BudgetsLayout() {
  return (
    <RequirePermission capability="budgets.view" section="Presupuestos">
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
      <Stack.Screen
        name="index"
        options={{
          title: "Presupuesto en borrador",
        }}
      />

      <Stack.Screen
        name="seleccionar-cliente"
        options={{
          title: "Seleccionar cliente",
        }}
      />
    </Stack>
    </RequirePermission>
  );
}
