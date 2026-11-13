import { Stack, useFocusEffect, useLocalSearchParams } from "expo-router";
import { useCallback, useRef, useState } from "react";
import { RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";

import { ContactActions } from "@/components/client/ContactActions";
import { RelationshipProcesses } from "@/components/client/relationship-processes";
import { LeuretFeedback } from "@/components/LeuretFeedback";
import { LeuretLoading } from "@/components/LeuretLoading";
import { UserAvatar } from "@/components/UserAvatar";
import { colors, radius } from "@/constants/theme";
import { getClientContractorProfile, type ContractorProfile } from "@/services/client-portal-service";

export default function ContractorProfileScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [data, setData] = useState<ContractorProfile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const requestNumber = useRef(0);

  const load = useCallback(async (refresh = false) => {
    const number = ++requestNumber.current;
    if (refresh) setRefreshing(true);
    const result = await getClientContractorProfile(id);
    if (number !== requestNumber.current) return;
    setData(result.profile);
    setError(result.error);
    setRefreshing(false);
  }, [id]);

  useFocusEffect(useCallback(() => {
    void load();
    return () => { requestNumber.current += 1; };
  }, [load]));

  if (!data && !error) return <LeuretLoading message="Cargando contratista…" fullScreen />;

  return (
    <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void load(true)} />}>
      <Stack.Screen options={{ title: data?.company.name ?? "Contratista" }} />
      {error ? <LeuretFeedback title="No pudimos abrir el perfil" message={error} tone="error" actionLabel="Reintentar" onAction={() => void load(true)} /> : null}
      {data ? (
        <>
          <View style={styles.card}>
            <View style={styles.header}>
              <UserAvatar size={60} uri={data.company.logo_url} fallback={data.company.name.trim().charAt(0).toUpperCase()}
                style={styles.avatar} textStyle={styles.initial} />
              <View style={styles.identity}>
                <Text style={styles.title} selectable>{data.company.name}</Text>
                {data.company.address ? <Text selectable style={styles.meta}>{data.company.address}</Text> : null}
                {data.company.phone ? <Text selectable style={styles.meta}>{data.company.phone}</Text> : null}
                {data.company.email ? <Text selectable style={styles.meta}>{data.company.email}</Text> : null}
              </View>
            </View>
            <ContactActions phone={data.company.phone} email={data.company.email} address={data.company.address} />
          </View>
          <RelationshipProcesses processes={data.processes} isClient />
        </>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: 20, paddingBottom: 40, gap: 18 },
  card: { padding: 16, gap: 16, borderRadius: radius.lg, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  header: { flexDirection: "row", alignItems: "center", gap: 12 },
  avatar: { backgroundColor: colors.primarySoft },
  initial: { color: colors.primary, fontSize: 24, fontWeight: "900" },
  identity: { flex: 1, gap: 4 },
  title: { color: colors.text, fontSize: 20, fontWeight: "900" },
  meta: { color: colors.textSecondary, fontSize: 13 },
});
