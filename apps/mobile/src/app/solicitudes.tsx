import { Ionicons } from "@expo/vector-icons";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { useCallback, useRef, useState } from "react";
import { AppState, Linking, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";

import { StatusPill } from "@/components/client/StatusPill";
import { LeuretButton } from "@/components/LeuretButton";
import { LeuretEmptyState } from "@/components/LeuretEmptyState";
import { LeuretFeedback } from "@/components/LeuretFeedback";
import { LeuretLoading } from "@/components/LeuretLoading";
import { colors, radius } from "@/constants/theme";
import { useAuth } from "@/contexts/AuthContext";
import { useCompany } from "@/contexts/CompanyContext";
import { usePermissions } from "@/hooks/usePermissions";
import {
  listClientConnections, requestClientConnection, respondToClientConnection,
  type ClientConnection, type ConnectionAction,
} from "@/services/client-connections-service";

const requestStates = {
  pending: { label: "Pendiente", tone: "warning" },
  accepted: { label: "Aceptada", tone: "success" },
  rejected: { label: "Rechazada", tone: "danger" },
  cancelled: { label: "Cancelada", tone: "neutral" },
} as const;

function messageFor(error: unknown) {
  return error instanceof Error ? error.message : "No pudimos completar la operación.";
}

export default function ClientConnectionsScreen() {
  const { profile } = useAuth();
  const { activeCompany, companies, setActiveCompanyId } = useCompany();
  const { can } = usePermissions();
  const { id: highlightedId } = useLocalSearchParams<{ id?: string }>();
  const isClient = profile?.role === "client";
  const canSend = isClient || Boolean(activeCompany && can("clients.edit"));
  const [requests, setRequests] = useState<ClientConnection[] | null>(null);
  const [contact, setContact] = useState("");
  const [loadingError, setLoadingError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [working, setWorking] = useState<string | null>(null);
  const requestNumber = useRef(0);

  const load = useCallback(async (showRefresh = false) => {
    const number = ++requestNumber.current;
    if (showRefresh) setRefreshing(true);
    try {
      const data = await listClientConnections();
      if (number !== requestNumber.current) return;
      setRequests(data.requests);
      setLoadingError(null);
    } catch (error) {
      if (number === requestNumber.current) setLoadingError(messageFor(error));
    } finally {
      if (number === requestNumber.current) setRefreshing(false);
    }
  }, []);

  useFocusEffect(useCallback(() => {
    void load();
    const interval = setInterval(() => { if (AppState.currentState === "active") void load(); }, 30_000);
    const appState = AppState.addEventListener("change", (state) => { if (state === "active") void load(); });
    return () => {
      requestNumber.current += 1;
      clearInterval(interval);
      appState.remove();
    };
  }, [load]));

  async function sendRequest() {
    if (!canSend || working || !contact.trim()) return;
    setWorking("send");
    setActionError(null);
    setSuccess(null);
    try {
      const value = contact.trim();
      const { outcome } = await requestClientConnection({
        ...(!isClient && activeCompany ? { companyId: activeCompany.id } : {}),
        ...(value.includes("@") ? { email: value } : { phone: value }),
      });
      setContact("");
      setSuccess(outcome === "linked" ? "Ya existe una vinculación." : outcome === "pending"
        ? "Ya hay una solicitud pendiente. Revísala en la bandeja."
        : "Solicitud enviada. La otra parte debe aceptarla en Leuret.");
      await load();
    } catch (error) {
      setActionError(messageFor(error));
    } finally {
      setWorking(null);
    }
  }

  async function handleAction(item: ClientConnection, action: ConnectionAction, phoneCode?: string) {
    if (working) return;
    setWorking(item.id);
    setActionError(null);
    setSuccess(null);
    try {
      await respondToClientConnection(item.id, action, phoneCode);
      setSuccess(action === "accept" ? "Vinculación aceptada." : action === "reject" ? "Solicitud rechazada." : "Solicitud cancelada.");
      await load();
    } catch (error) {
      setActionError(messageFor(error));
    } finally {
      setWorking(null);
    }
  }

  async function openProfile(item: ClientConnection) {
    if (isClient) {
      router.push({ pathname: "/contratistas/[id]", params: { id: item.company_id } });
    } else if (item.client_id) {
      try {
        if (activeCompany?.id !== item.company_id) await setActiveCompanyId(item.company_id);
        router.push({ pathname: "/clientes/[id]", params: { id: item.client_id } });
      } catch (error) {
        setActionError(messageFor(error));
      }
    }
  }

  const ordered = requests && [...requests].sort((a, b) => {
    const priority = (item: ClientConnection) => item.id === highlightedId ? 0
      : item.status === "pending" && item.incoming ? 1 : item.status === "pending" ? 2 : 3;
    return priority(a) - priority(b);
  });

  return (
    <ScrollView
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void load(true)} />}
    >
      {canSend ? (
        <View style={styles.card}>
          <Text style={styles.title}>{isClient ? "Agregar contratista" : "Vincular cliente"}</Text>
          <Text style={styles.text}>
            {isClient ? "Usa el correo o celular del contratista o de su empresa." : "Usa el correo o celular registrado por el cliente en Leuret."}
          </Text>
          <TextInput
            accessibilityLabel="Correo o celular"
            placeholder="Correo o celular"
            placeholderTextColor={colors.textSecondary}
            autoCapitalize="none"
            autoCorrect={false}
            value={contact}
            maxLength={254}
            onChangeText={setContact}
            onSubmitEditing={() => void sendRequest()}
            style={styles.input}
          />
          <LeuretButton label="Enviar solicitud" icon="send-outline" accessibilityRole="button" loading={working === "send"}
            disabled={!contact.trim() || Boolean(working)} onPress={() => void sendRequest()} />
        </View>
      ) : null}

      {success ? <LeuretFeedback title={success} tone="success" compact /> : null}
      {actionError ? <LeuretFeedback title={actionError} tone="error" compact /> : null}
      {loadingError ? (
        <LeuretFeedback title="No pudimos cargar las solicitudes" message={loadingError} tone="error"
          actionLabel="Reintentar" onAction={() => void load(true)} />
      ) : null}
      {!ordered && !loadingError ? <LeuretLoading message="Cargando solicitudes…" compact /> : null}
      {ordered?.length === 0 ? <LeuretEmptyState icon="notifications-outline" title="Aún no hay solicitudes"
        description={canSend ? "Puedes enviar una solicitud desde esta pantalla." : "Las solicitudes recibidas aparecerán aquí."} compact /> : null}
      {ordered?.map((item) => (
        <ConnectionCard key={item.id} item={item} companyName={companies.find((company) => company.id === item.company_id)?.name}
          highlighted={item.id === highlightedId} working={working} onAction={handleAction}
          onOpen={isClient || item.client_id ? () => void openProfile(item) : undefined} />
      ))}
    </ScrollView>
  );
}

function ConnectionCard({ item, companyName, highlighted, working, onAction, onOpen }: {
  item: ClientConnection;
  companyName?: string;
  highlighted: boolean;
  working: string | null;
  onAction: (item: ClientConnection, action: ConnectionAction, code?: string) => Promise<void>;
  onOpen?: () => void;
}) {
  const [code, setCode] = useState("");
  const needsCode = item.incoming && item.requires_phone_code;
  const pending = item.status === "pending";

  return (
    <View style={[styles.card, highlighted && styles.highlighted]}>
      <View style={styles.row}>
        <View style={styles.icon}><Ionicons name="person-add-outline" size={20} color={colors.primary} /></View>
        <View style={styles.identity}>
          <Text style={styles.title}>{item.name}</Text>
          <Text style={styles.text}>{item.incoming ? "Recibida" : "Enviada"}{companyName ? ` · ${companyName}` : ""}</Text>
        </View>
        <StatusPill {...requestStates[item.status]} />
      </View>

      {pending && item.phone_code && item.phone_to_confirm ? (
        <View style={styles.codePanel}>
          <Text style={styles.text}>Comparte este código únicamente con el cliente en el número +{item.phone_to_confirm}.</Text>
          <Text selectable style={styles.code}>{item.phone_code.toUpperCase()}</Text>
          <LeuretButton label="Enviar código por WhatsApp" icon="logo-whatsapp" variant="secondary" accessibilityRole="button"
            onPress={() => void Linking.openURL(`https://wa.me/${item.phone_to_confirm}?text=${encodeURIComponent(`Tu código para aceptar mi solicitud en Leuret es ${item.phone_code?.toUpperCase()}.`)}`)
              .catch(() => setCode("manual"))} />
          {code === "manual" ? <Text style={styles.text}>Puedes copiar el código y compartirlo directamente.</Text> : null}
        </View>
      ) : null}

      {pending && item.incoming ? (
        <>
          {needsCode ? (
            <>
              <Text style={styles.text}>Ingresa el código que tu contratista te envió al celular.</Text>
              <TextInput accessibilityLabel="Código de confirmación" placeholder="Código de confirmación"
                placeholderTextColor={colors.textSecondary} autoCapitalize="characters" autoCorrect={false}
                maxLength={12} style={styles.input} value={code} onChangeText={setCode} />
            </>
          ) : null}
          <View style={styles.actions}>
            <LeuretButton label="Rechazar" variant="secondary" accessibilityRole="button" disabled={Boolean(working)}
              onPress={() => void onAction(item, "reject")} />
            <LeuretButton label="Aceptar" accessibilityRole="button" loading={working === item.id}
              disabled={Boolean(working) || (needsCode && code.trim().length !== 12)}
              onPress={() => void onAction(item, "accept", needsCode ? code.trim() : undefined)} />
          </View>
        </>
      ) : null}
      {pending && !item.incoming ? <LeuretButton label="Cancelar solicitud" variant="ghost" accessibilityRole="button" loading={working === item.id}
        disabled={Boolean(working)} onPress={() => void onAction(item, "cancel")} /> : null}
      {item.status === "accepted" && onOpen ? <LeuretButton label="Ver perfil" variant="secondary" accessibilityRole="button" onPress={onOpen} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  content: { padding: 20, paddingBottom: 40, gap: 14 },
  card: { gap: 12, padding: 16, backgroundColor: colors.surface, borderRadius: radius.lg, borderColor: colors.border, borderWidth: 1 },
  highlighted: { borderColor: colors.accent },
  title: { color: colors.text, fontSize: 16, fontWeight: "900" },
  text: { color: colors.textSecondary, lineHeight: 20 },
  input: { minHeight: 48, paddingHorizontal: 12, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, color: colors.text, backgroundColor: colors.surfaceRaised },
  row: { flexDirection: "row", alignItems: "center", gap: 10, flexWrap: "wrap" },
  identity: { flex: 1, minWidth: 100 },
  icon: { width: 40, height: 40, borderRadius: radius.md, backgroundColor: colors.primarySoft, alignItems: "center", justifyContent: "center" },
  actions: { flexDirection: "row", flexWrap: "wrap", justifyContent: "flex-end", gap: 8 },
  codePanel: { gap: 8, padding: 10, borderRadius: radius.md, backgroundColor: colors.surfaceAlt },
  code: { color: colors.text, fontSize: 18, fontWeight: "900", letterSpacing: 2 },
});
