import { Stack } from "expo-router";

import { stackBackOptions } from "@/components/back-navigation";
import { RequirePermission } from "@/components/RequirePermission";

export default function SalesReportLayout() {
  return (
    <RequirePermission capability="sales.report" section="Informe de ventas">
      <Stack screenOptions={stackBackOptions("/(tabs)/mas")}>
        <Stack.Screen name="index" options={{ title: "Informe de ventas" }} />
      </Stack>
    </RequirePermission>
  );
}
