import { Tabs } from "expo-router/js-tabs";

import { BackBar } from "@/components/back-navigation";
import { TabIcon, useLeuretTabsOptions } from "@/components/leuret-tabs";

export default function TabsLayout() {
  const tabsOptions = useLeuretTabsOptions();
  return (
    <Tabs
      backBehavior="history"
      screenOptions={({ route }) => ({
        headerShown: route.name !== "index",
        header: () => (
          <BackBar
            tone={route.name === "clientes" ? "light" : "dark"}
            fallback="/(tabs)"
            fallbackMode="navigate"
          />
        ),
        ...tabsOptions,
      })}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Inicio",
          tabBarAccessibilityLabel: "Inicio",
          tabBarIcon: ({ color, focused }) => (
            <TabIcon focused={focused} active="home" inactive="home-outline" color={color} />
          ),
        }}
      />

      <Tabs.Screen
        name="calculos"
        options={{
          title: "Cálculos",
          tabBarAccessibilityLabel: "Cálculos",
          tabBarIcon: ({ color, focused }) => (
            <TabIcon focused={focused} active="calculator" inactive="calculator-outline" color={color} />
          ),
        }}
      />

      <Tabs.Screen
        name="clientes"
        options={{
          title: "Clientes",
          tabBarAccessibilityLabel: "Clientes",
          tabBarIcon: ({ color, focused }) => (
            <TabIcon focused={focused} active="people" inactive="people-outline" color={color} />
          ),
        }}
      />

      <Tabs.Screen
        name="agenda"
        options={{
          title: "Agenda",
          tabBarAccessibilityLabel: "Agenda",
          tabBarIcon: ({ color, focused }) => (
            <TabIcon focused={focused} active="calendar" inactive="calendar-outline" color={color} />
          ),
        }}
      />

      <Tabs.Screen
        name="mas"
        options={{
          title: "Más",
          tabBarAccessibilityLabel: "Más",
          tabBarIcon: ({ color, focused }) => (
            <TabIcon
              focused={focused}
              active="grid"
              inactive="grid-outline"
              color={color}
            />
          ),
        }}
      />
    </Tabs>
  );
}
