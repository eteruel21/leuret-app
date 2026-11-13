import { type Href, router, useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { FlatList, RefreshControl, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { JobRequestCard } from "@/components/job-requests/JobRequestCard";
import { LeuretButton } from "@/components/LeuretButton";
import { LeuretEmptyState } from "@/components/LeuretEmptyState";
import { LeuretFeedback } from "@/components/LeuretFeedback";
import { LeuretLoading } from "@/components/LeuretLoading";
import { colors } from "@/constants/theme";
import { listMyJobRequests } from "@/services/job-request-service";
import type { ClientJobRequestSummary } from "@/types/job-request";
import { clientRequestState } from "@/utils/job-requests";

function footerFor(request: ClientJobRequestSummary): string {
  const quotes = `${request.quotes_sent_count} presupuesto${request.quotes_sent_count === 1 ? "" : "s"}`;
  const talks = request.conversation_count
    ? ` · ${request.conversation_count} conversación${request.conversation_count === 1 ? "" : "es"}`
    : "";
  return quotes + talks;
}

export default function ClientJobRequestsScreen() {
  const [requests, setRequests] = useState<ClientJobRequestSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (showRefresh = false) => {
    if (showRefresh) setRefreshing(true);
    const result = await listMyJobRequests();
    setError(result.error);
    if (!result.error) setRequests(result.requests);
    setLoading(false);
    setRefreshing(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  if (loading) return <LeuretLoading message="Cargando tus peticiones…" fullScreen />;

  const openCount = requests.filter((request) => request.effective_status === "open").length;
  const unread = requests.reduce((sum, request) => sum + request.unread_count, 0);

  return (
    <SafeAreaView style={styles.safeArea} edges={["left", "right"]}>
      <FlatList
        data={requests}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void load(true)} />}
        ListHeaderComponent={
          <View>
            <Text style={styles.title}>Peticiones de trabajo</Text>
            <Text style={styles.subtitle}>
              {unread > 0
                ? `${unread} mensaje${unread === 1 ? "" : "s"} nuevo${unread === 1 ? "" : "s"} de contratistas`
                : "Describe lo que necesitas y recibe hasta 5 presupuestos."}
            </Text>

            <LeuretButton
              label="Publicar una petición"
              icon="add-circle-outline"
              onPress={() => router.push("/cliente-peticiones/nueva" as Href)}
              fullWidth
              style={styles.cta}
            />

            {error ? (
              <LeuretFeedback
                tone="error"
                title="No pudimos cargar tus peticiones"
                message={error}
                actionLabel="Reintentar"
                onAction={() => void load(true)}
                style={styles.feedback}
              />
            ) : null}

            {requests.length > 0 ? (
              <Text style={styles.section}>
                {openCount > 0 ? `${openCount} abierta${openCount === 1 ? "" : "s"}` : "Tus peticiones"}
              </Text>
            ) : null}
          </View>
        }
        ListEmptyComponent={
          error ? null : (
            <LeuretEmptyState
              icon="megaphone-outline"
              title="Aún no has publicado peticiones"
              description="Cuenta qué trabajo necesitas, agrega fotos y los contratistas de tu zona te escribirán o te enviarán su presupuesto. Tu dirección y teléfono solo los ve quien te envíe un presupuesto."
              compact
            />
          )
        }
        renderItem={({ item }) => (
          <JobRequestCard
            request={item}
            state={clientRequestState(item.effective_status)}
            unread={item.unread_count}
            footer={footerFor(item)}
            onPress={() => router.push({ pathname: "/cliente-peticiones/[id]", params: { id: item.id } } as Href)}
          />
        )}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.background },
  content: { padding: 20, paddingBottom: 40 },
  title: { color: colors.text, fontSize: 28, fontWeight: "900" },
  subtitle: { marginTop: 4, color: colors.textSecondary, fontSize: 14, fontWeight: "700" },
  cta: { marginTop: 16, marginBottom: 8 },
  feedback: { marginVertical: 12 },
  section: { marginTop: 18, marginBottom: 10, color: colors.textSecondary, fontSize: 12, fontWeight: "900", textTransform: "uppercase" },
});
