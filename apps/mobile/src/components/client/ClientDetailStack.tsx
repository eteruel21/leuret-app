import { type Href, Stack } from "expo-router";

import { stackBackOptions } from "@/components/back-navigation";

/** Stack con encabezado y botón atrás para las pantallas de detalle del cliente. */
export function ClientDetailStack({ title, fallback }: { title: string; fallback: Href }) {
  return (
    <Stack screenOptions={stackBackOptions(fallback)}>
      <Stack.Screen name="[id]" options={{ title }} />
    </Stack>
  );
}
