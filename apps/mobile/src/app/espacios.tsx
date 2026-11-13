import { router, useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";

import { LeuretButton } from "@/components/LeuretButton";
import { colors, radius } from "@/constants/theme";
import { useAuth } from "@/contexts/AuthContext";
import { useCompany } from "@/contexts/CompanyContext";
import { ROLE_LABELS } from "@/permissions/permissions";

export default function WorkspacesScreen() {
  const { profile, refreshProfile, signOut } = useAuth();
  const { activeCompany, memberships, setActiveCompanyId, useClientSpace } = useCompany();
  const [error, setError] = useState<string | null>(null);
  const [switching, setSwitching] = useState(false);

  useFocusEffect(useCallback(() => {
    void refreshProfile();
  }, [refreshProfile]));

  async function switchSpace(companyId?: string) {
    if (switching) return;
    setSwitching(true);
    setError(null);
    try {
      if (companyId) await setActiveCompanyId(companyId);
      else await useClientSpace();
      router.replace(companyId ? "/(tabs)" : "/(client-tabs)");
    } catch {
      setError("No pudimos cambiar de espacio. Inténtalo de nuevo.");
    } finally {
      setSwitching(false);
    }
  }

  const canCreateCompany = Boolean(profile?.contractor_approved_at && profile.primary_category);
  const awaitingApproval = Boolean(profile?.contractor_requested_at && !profile.contractor_approved_at);
  const canRequestContractorAccess = profile?.role === "contractor" || memberships.length > 0;

  return (
    <ScrollView contentContainerStyle={styles.content}>
      {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
      {memberships.map((membership) => {
        const company = membership.company;
        if (!company) return null;
        const selected = company.id === activeCompany?.id;
        return (
          <View key={company.id} style={styles.card}>
            <Text style={styles.title}>{company.name}</Text>
            <Text style={styles.detail}>
              {membership.role === "owner" ? "Contratista independiente" : ROLE_LABELS[membership.role]}
              {selected ? " · Espacio activo" : ""}
            </Text>
            <LeuretButton
              label={selected ? "Continuar" : "Entrar"}
              accessibilityRole="button"
              accessibilityLabel={`${selected ? "Continuar en" : "Entrar a"} ${company.name}`}
              disabled={switching}
              variant={selected ? "secondary" : "primary"}
              onPress={() => void switchSpace(company.id)}
            />
          </View>
        );
      })}

      {profile?.role === "client" ? (
        <LeuretButton
          label="Entrar como cliente"
          accessibilityLabel="Entrar como cliente"
          icon="person-outline"
          variant="secondary"
          accessibilityRole="button"
          disabled={switching}
          onPress={() => void switchSpace()}
        />
      ) : null}

      {canRequestContractorAccess && !memberships.some((membership) => membership.role === "owner") ? (
        <View style={styles.card}>
          <Text style={styles.title}>Contratista independiente</Text>
          {awaitingApproval ? (
            <Text style={styles.detail}>Tu perfil profesional está en revisión.</Text>
          ) : (
            <LeuretButton
              label={canCreateCompany ? "Crear mi empresa" : "Trabajar por mi cuenta"}
              accessibilityLabel={canCreateCompany ? "Crear mi empresa" : "Trabajar por mi cuenta"}
              icon={canCreateCompany ? "business-outline" : "hammer-outline"}
              accessibilityRole="button"
              onPress={() => router.push(canCreateCompany ? "/empresa/crear" : "/perfil-profesional")}
            />
          )}
        </View>
      ) : null}

      <LeuretButton
        label="Invitaciones de equipo"
        accessibilityLabel="Invitaciones de equipo"
        icon="mail-open-outline"
        variant="secondary"
        accessibilityRole="button"
        onPress={() => router.push("/invitacion")}
      />
      {!activeCompany && profile?.role === "contractor" ? (
        <LeuretButton
          label="Cerrar sesión"
          variant="ghost"
          accessibilityRole="button"
          onPress={() => void signOut()}
        />
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: 20, paddingBottom: 40, gap: 14 },
  card: { padding: 16, gap: 10, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  title: { color: colors.text, fontSize: 18, fontWeight: "800" },
  detail: { color: colors.textSecondary, fontSize: 14, lineHeight: 20 },
  error: { color: colors.danger, fontSize: 14 },
});
