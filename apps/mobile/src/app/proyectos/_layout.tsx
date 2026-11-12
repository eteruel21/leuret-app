import { Stack } from "expo-router";

import { stackBackOptions } from "@/components/back-navigation";

export default function ProjectsLayout() {
  return (
    <Stack
      screenOptions={({ route }) =>
        stackBackOptions(route.name === "index" ? "/(tabs)/mas" : "/proyectos")
      }
    >
      <Stack.Screen name="index" options={{ title: "Proyectos" }} />
    </Stack>
  );
}
