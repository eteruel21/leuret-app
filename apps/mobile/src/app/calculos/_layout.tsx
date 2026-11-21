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
      <Stack.Screen name="acero" options={{ title: "Acero de refuerzo" }} />
      <Stack.Screen name="techos" options={{ title: "Techos y cubiertas" }} />
      <Stack.Screen name="plomeria" options={{ title: "Plomería" }} />
      <Stack.Screen name="impermeabilizacion" options={{ title: "Impermeabilización" }} />
      <Stack.Screen name="excavacion" options={{ title: "Excavación y relleno" }} />
      <Stack.Screen name="encofrado" options={{ title: "Encofrado" }} />
      <Stack.Screen name="estructura" options={{ title: "Estructura" }} />
      <Stack.Screen name="cercas" options={{ title: "Cercas" }} />
      <Stack.Screen name="puertas-ventanas" options={{ title: "Puertas y ventanas" }} />
      <Stack.Screen name="premezclado" options={{ title: "Concreto premezclado" }} />
      <Stack.Screen name="contrapiso" options={{ title: "Contrapiso y zócalo" }} />
      <Stack.Screen name="cielo-falso-gypsum" options={{ title: "Cielo falso de gypsum" }} />
      <Stack.Screen name="centro-carga" options={{ title: "Centro de carga y tierra" }} />
    </Stack>
  );
}
