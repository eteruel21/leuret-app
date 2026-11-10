import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { type Href, router, useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";

import { colors, radius } from "@/constants/theme";
import { useCompany } from "@/contexts/CompanyContext";
import { listBudgetsByCompany } from "@/services/budget-service";
import { listClients } from "@/services/client-service";
import { listCompanyInvitations, listCompanyMembers } from "@/services/users-service";
import { hasBillingDetails, onboardingProgress, onboardingSteps, type OnboardingStep } from "@/utils/onboarding";

const dismissKey = (companyId: string) => `@contractor-pro:onboarding-dismissed:${companyId}`;

/**
 * Primeros pasos para el dueño/administrador de una empresa nueva.
 * Desaparece al completar todo o si se oculta.
 */
export function OnboardingChecklist() {
  const { activeCompany } = useCompany();
  const companyId = activeCompany?.id;
  const [steps, setSteps] = useState<OnboardingStep[] | null>(null);
  const [dismissed, setDismissed] = useState(true);

  useFocusEffect(
    useCallback(() => {
      if (!companyId) return;
      let mounted = true;

      void (async () => {
        let wasDismissed = false;
        try {
          wasDismissed = (await AsyncStorage.getItem(dismissKey(companyId))) === "1";
        } catch {
          wasDismissed = false;
        }
        if (!mounted) return;
        setDismissed(wasDismissed);
        if (wasDismissed) return;

        const [members, invitations, clients, budgets] = await Promise.all([
          listCompanyMembers(companyId),
          listCompanyInvitations(companyId),
          listClients(companyId),
          listBudgetsByCompany(companyId),
        ]);
        if (!mounted) return;
        // Si algo no cargó, no mostramos pasos que podrían estar ya hechos.
        if (members.error || clients.error || budgets.error) {
          setSteps(null);
          return;
        }
        setSteps(
          onboardingSteps({
            hasBillingDetails: hasBillingDetails(activeCompany),
            teamSize: members.members.length,
            pendingInvitations: invitations.invitations.length,
            clientCount: clients.clients.length,
            budgetCount: budgets.budgets.length,
          })
        );
      })();

      return () => {
        mounted = false;
      };
    }, [companyId, activeCompany])
  );

  if (!companyId || dismissed || !steps) return null;

  const progress = onboardingProgress(steps);
  if (progress.complete) return null;

  const hide = () => {
    setDismissed(true);
    void AsyncStorage.setItem(dismissKey(companyId), "1").catch(() => undefined);
  };

  return (
    <Animated.View entering={FadeInDown.delay(240).duration(420)} style={styles.card}>
      <View style={styles.header}>
        <View style={styles.headerCopy}>
          <Text style={styles.eyebrow}>PRIMEROS PASOS</Text>
          <Text style={styles.title}>Deja lista tu empresa</Text>
          <Text style={styles.subtitle}>
            {progress.done} de {progress.total} completados
          </Text>
        </View>
        <Pressable onPress={hide} hitSlop={10} accessibilityRole="button" accessibilityLabel="Ocultar primeros pasos">
          <Text style={styles.hide}>Ocultar</Text>
        </Pressable>
      </View>

      <View style={styles.track}>
        <View style={[styles.fill, { width: `${(progress.done / progress.total) * 100}%` }]} />
      </View>

      {steps.map((step) => (
        <Pressable
          key={step.id}
          disabled={step.done}
          onPress={() => router.push(step.href as Href)}
          accessibilityRole="button"
          accessibilityState={{ checked: step.done }}
          style={({ pressed }) => [styles.step, pressed && styles.pressed]}
        >
          <Ionicons
            name={step.done ? "checkmark-circle" : "ellipse-outline"}
            size={22}
            color={step.done ? colors.success : colors.textMuted}
          />
          <View style={styles.stepCopy}>
            <Text style={[styles.stepTitle, step.done && styles.stepDone]}>{step.title}</Text>
            {!step.done ? <Text style={styles.stepDetail}>{step.detail}</Text> : null}
          </View>
          {!step.done ? <Ionicons name="chevron-forward" size={18} color={colors.textMuted} /> : null}
        </Pressable>
      ))}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: 16,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.glowAccent,
    backgroundColor: colors.surface,
    gap: 4,
  },
  header: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
  headerCopy: { flex: 1 },
  eyebrow: { color: colors.accent, fontSize: 9, fontWeight: "900", letterSpacing: 1.4 },
  title: { marginTop: 4, color: colors.text, fontSize: 18, fontWeight: "900" },
  subtitle: { marginTop: 2, color: colors.textSecondary, fontSize: 12 },
  hide: { color: colors.textMuted, fontSize: 12, fontWeight: "800" },
  track: { height: 6, marginVertical: 10, borderRadius: 3, backgroundColor: colors.steelSoft, overflow: "hidden" },
  fill: { height: "100%", borderRadius: 3, backgroundColor: colors.success },
  step: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 9 },
  stepCopy: { flex: 1 },
  stepTitle: { color: colors.text, fontSize: 14, fontWeight: "800" },
  stepDone: { color: colors.textSecondary, textDecorationLine: "line-through" },
  stepDetail: { marginTop: 2, color: colors.textSecondary, fontSize: 12, lineHeight: 17 },
  pressed: { opacity: 0.7 },
});
