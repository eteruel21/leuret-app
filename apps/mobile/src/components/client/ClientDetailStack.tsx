import { Stack } from "expo-router";

import { colors } from "@/constants/theme";

/** Stack con encabezado y botón atrás para las pantallas de detalle del cliente. */
export function ClientDetailStack({ title }: { title: string }) {
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: colors.surfaceDark },
        headerTintColor: colors.textLight,
        headerTitleStyle: { fontWeight: "800" },
        headerBackTitle: "Atrás",
        contentStyle: { backgroundColor: colors.background },
      }}
    >
      <Stack.Screen name="[id]" options={{ title }} />
    </Stack>
  );
}
