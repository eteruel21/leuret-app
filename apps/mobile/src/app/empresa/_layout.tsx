import { Stack } from "expo-router";

import { confirmReturnToLogin, stackBackOptions } from "@/components/back-navigation";
import { useAuth } from "@/contexts/AuthContext";

export default function CompanyLayout() {
  const { signOut } = useAuth();

  return (
    <Stack
      screenOptions={({ route }) =>
        stackBackOptions(route.name === "unirme" ? "/empresa" : () => void confirmReturnToLogin(signOut))
      }
    >
      <Stack.Screen
        name="index"
        options={{
          headerShown: false,
        }}
      />

      <Stack.Screen
        name="crear"
        options={{
          title: "Crear empresa",
        }}
      />

      <Stack.Screen
        name="seleccionar"
        options={{
          title: "Seleccionar empresa",
        }}
      />

      <Stack.Screen
        name="unirme"
        options={{
          title: "Unirme a una empresa",
        }}
      />
    </Stack>
  );
}
