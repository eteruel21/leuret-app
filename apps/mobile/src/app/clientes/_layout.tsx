import { Stack } from "expo-router";

import { stackBackOptions } from "@/components/back-navigation";

export default function ClientsLayout() {
  return (
    <Stack
      screenOptions={stackBackOptions("/(tabs)/clientes")}
    >
      <Stack.Screen
        name="[id]"
        options={{
          title: "Cliente",
        }}
      />
    </Stack>
  );
}
