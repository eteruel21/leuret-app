import { Stack } from "expo-router";

import { stackBackOptions } from "@/components/back-navigation";

export default function CalculationsLayout() {
  return (
    <Stack
      screenOptions={stackBackOptions("/(tabs)/calculos")}
    >
      <Stack.Screen
        name="concreto"
        options={{
          title: "Cálculo de concreto",
        }}
      />
      <Stack.Screen
        name="bloques-repello"
        options={{
          title: "Bloques y repello",
        }}
      />
      <Stack.Screen
        name="gypsum"
        options={{ title: "Cálculo de gypsum" }}
      />
      <Stack.Screen
        name="cielo-raso-pvc"
        options={{ title: "Cielo raso PVC" }}
      />
      <Stack.Screen name="pintura" options={{ title: "Cálculo de pintura" }} />
      <Stack.Screen name="pisos" options={{ title: "Pisos y revestimientos" }} />
      <Stack.Screen name="electricidad" options={{ title: "Electricidad" }} />
      <Stack.Screen name="sistemas-especiales" options={{ title: "Sistemas especiales" }} />
      <Stack.Screen name="aire-acondicionado" options={{ title: "Aire acondicionado" }} />
      <Stack.Screen name="muebles-mdf" options={{ title: "Muebles MDF" }} />
    </Stack>
  );
}
