import { Tabs } from "expo-router/js-tabs";

import { BackBar } from "@/components/back-navigation";
import { TabIcon, useLeuretTabsOptions } from "@/components/leuret-tabs";

export default function ClientTabsLayout() {
  const tabsOptions = useLeuretTabsOptions();
  return (
    <Tabs
      backBehavior="history"
      screenOptions={({ route }) => ({
        headerShown: route.name !== "index",
        header: () => <BackBar tone="light" fallback="/(client-tabs)" fallbackMode="navigate" />,
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
        name="peticiones"
        options={{
          title: "Peticiones",
          tabBarAccessibilityLabel: "Peticiones",
          tabBarIcon: ({ color, focused }) => (
            <TabIcon focused={focused} active="megaphone" inactive="megaphone-outline" color={color} />
          ),
        }}
      />

      <Tabs.Screen
        name="proyectos"
        options={{
          title: "Proyectos",
          tabBarAccessibilityLabel: "Proyectos",
          tabBarIcon: ({ color, focused }) => (
            <TabIcon focused={focused} active="business" inactive="business-outline" color={color} />
          ),
        }}
      />

      <Tabs.Screen
        name="presupuestos"
        options={{
          title: "Presupuestos",
          tabBarAccessibilityLabel: "Presupuestos",
          tabBarIcon: ({ color, focused }) => (
            <TabIcon focused={focused} active="document-text" inactive="document-text-outline" color={color} />
          ),
        }}
      />

      <Tabs.Screen
        name="facturas"
        options={{
          title: "Facturas",
          tabBarAccessibilityLabel: "Facturas",
          tabBarIcon: ({ color, focused }) => (
            <TabIcon focused={focused} active="receipt" inactive="receipt-outline" color={color} />
          ),
        }}
      />

      {/* Cuenta se abre desde el botón de perfil del inicio; su lugar en la barra es para Peticiones. */}
      <Tabs.Screen
        name="cuenta"
        options={{
          href: null,
          title: "Cuenta",
          tabBarAccessibilityLabel: "Cuenta",
          tabBarIcon: ({ color, focused }) => (
            <TabIcon focused={focused} active="person" inactive="person-outline" color={color} />
          ),
        }}
      />
    </Tabs>
  );
}
