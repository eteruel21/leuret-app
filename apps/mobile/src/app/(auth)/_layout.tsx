import { Stack } from "expo-router";

import { BackBar } from "@/components/back-navigation";
import { colors } from "@/constants/theme";

export default function AuthLayout() {
  return (
    <Stack
      screenOptions={({ route }) => ({
        headerShown: route.name !== "login",
        header: () => (
          <BackBar fallback="/login" tone={route.name === "registro" ? "dark" : "light"} />
        ),
        contentStyle: {
          backgroundColor: colors.background,
        },
      })}
    />
  );
}
