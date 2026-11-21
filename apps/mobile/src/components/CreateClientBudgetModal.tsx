import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator, FlatList, Modal, Pressable, StyleSheet, Text, TextInput, View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { colors, radius } from "@/constants/theme";
import { useCompany } from "@/contexts/CompanyContext";
import { createBudgetForClient, type BudgetLineDraft } from "@/services/budget-service";
import { listClients } from "@/services/client-service";
import { getClientDisplayName, type ClientWithDetails } from "@/types/client";

export function CreateClientBudgetModal({
  visible, onClose, onCreated, item, defaultTitle,
}: {
  visible: boolean;
  onClose: () => void;
  onCreated: (budgetId: string) => void;
  item: BudgetLineDraft;
  defaultTitle: string;
}) {
  const { activeCompany } = useCompany();
  const [title, setTitle] = useState(defaultTitle);
  const [search, setSearch] = useState("");
  const [clients, setClients] = useState<ClientWithDetails[]>([]);
  const [clientId, setClientId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadKey, setLoadKey] = useState(0);
  const inFlight = useRef(false);

  useEffect(() => {
    if (!visible) return;
    setTitle(defaultTitle);
    setSearch("");
    setClientId(null);
    setError(null);
  }, [visible, defaultTitle]);

  useEffect(() => {
    if (!visible || !activeCompany?.id) return;
    let current = true;
    setLoading(true);
    setError(null);
    setClients([]);
    void listClients(activeCompany.id).then((response) => {
      if (!current) return;
      setLoading(false);
      if (response.error) setError(response.error);
      else setClients(response.clients.filter((client) => client.active));
    });
    return () => { current = false; };
  }, [visible, activeCompany?.id, loadKey]);

  const filtered = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    return clients.filter((client) =>
      `${getClientDisplayName(client)} ${client.phone ?? ""} ${client.email ?? ""}`
        .toLocaleLowerCase().includes(query)
    );
  }, [clients, search]);

  const submit = async () => {
    if (inFlight.current) return;
    if (!activeCompany) { setError("Selecciona una empresa para continuar."); return; }
    if (title.trim().length < 2) { setError("Escribe un título de al menos dos caracteres."); return; }
    if (!clientId) { setError("Elige el cliente del presupuesto."); return; }

    inFlight.current = true;
    setSaving(true);
    setError(null);
    try {
      const response = await createBudgetForClient({
        companyId: activeCompany.id, clientId, title: title.trim(), item,
      });
      if (!response.budgetId) {
        setError(response.error || "No fue posible crear el presupuesto.");
        return;
      }
      onClose();
      onCreated(response.budgetId);
    } finally {
      inFlight.current = false;
      setSaving(false);
    }
  };

  const close = () => { if (!inFlight.current) onClose(); };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={close}>
      <SafeAreaView style={styles.safe}>
        <View style={styles.header}>
          <View style={styles.headerText}>
            <Text style={styles.heading}>Crear presupuesto nuevo</Text>
            <Text style={styles.hint}>Elige un cliente y guarda esta partida de pintura en su presupuesto.</Text>
          </View>
          <Pressable onPress={close} disabled={saving} hitSlop={12} accessibilityRole="button" accessibilityLabel="Cerrar">
            <Ionicons name="close" size={26} color={colors.text} />
          </Pressable>
        </View>

        <View style={styles.form}>
          <Text style={styles.label}>Título del presupuesto</Text>
          <TextInput
            value={title} onChangeText={(value) => { setTitle(value); setError(null); }}
            maxLength={250} placeholder="Ej. Pintura de la sala"
            placeholderTextColor={colors.textMuted} style={styles.input}
          />
          <Text style={styles.label}>Cliente</Text>
          <TextInput
            value={search} onChangeText={setSearch} placeholder="Buscar por nombre, teléfono o correo"
            placeholderTextColor={colors.textMuted} style={styles.input} autoCorrect={false}
          />
        </View>

        {loading ? <ActivityIndicator style={styles.loading} color={colors.primary} /> : (
          <FlatList
            data={filtered} keyExtractor={(client) => client.id}
            keyboardShouldPersistTaps="handled" contentContainerStyle={styles.list}
            ListEmptyComponent={
              <View style={styles.empty}>
                <Text style={styles.hint}>
                  {clients.length ? "No hay clientes que coincidan." : "Todavía no hay clientes activos en esta empresa."}
                </Text>
                {!clients.length ? (
                  <Pressable onPress={() => { close(); router.push("/clientes"); }} style={styles.linkButton}>
                    <Text style={styles.linkText}>Ir a clientes</Text>
                  </Pressable>
                ) : null}
              </View>
            }
            renderItem={({ item: client }) => {
              const selected = client.id === clientId;
              return (
                <Pressable
                  onPress={() => { setClientId(client.id); setError(null); }}
                  style={[styles.option, selected && styles.optionSelected]}
                  accessibilityRole="radio" accessibilityState={{ selected }}
                  accessibilityLabel={getClientDisplayName(client)}
                >
                  <Ionicons name={selected ? "radio-button-on" : "radio-button-off"} size={22}
                    color={selected ? colors.primary : colors.textMuted} />
                  <View style={styles.clientText}>
                    <Text style={styles.clientName}>{getClientDisplayName(client)}</Text>
                    {client.phone || client.email ? (
                      <Text style={styles.hint} numberOfLines={1}>{client.phone || client.email}</Text>
                    ) : null}
                  </View>
                </Pressable>
              );
            }}
          />
        )}

        <View style={styles.footer}>
          {error ? <View style={styles.errorRow}>
            <Text style={styles.error}>{error}</Text>
            {!loading && !clients.length ? (
              <Pressable onPress={() => setLoadKey((key) => key + 1)} accessibilityRole="button">
                <Text style={styles.linkText}>Reintentar</Text>
              </Pressable>
            ) : null}
          </View> : null}
          <Pressable onPress={() => void submit()} disabled={saving || loading || !clients.length}
            style={[styles.createButton, (saving || loading || !clients.length) && styles.disabled]}
            accessibilityRole="button" accessibilityLabel="Crear presupuesto con la partida de pintura">
            {saving ? <ActivityIndicator color={colors.textLight} /> : (
              <Text style={styles.createText}>Crear presupuesto</Text>
            )}
          </Pressable>
        </View>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  header: { flexDirection: "row", alignItems: "flex-start", padding: 20, gap: 12 },
  headerText: { flex: 1, gap: 6 },
  heading: { color: colors.text, fontSize: 21, fontWeight: "800" },
  hint: { color: colors.textSecondary, fontSize: 14, lineHeight: 20 },
  form: { paddingHorizontal: 20, gap: 9 },
  label: { color: colors.text, fontSize: 14, fontWeight: "700", marginTop: 5 },
  input: { minHeight: 48, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md,
    backgroundColor: colors.surface, paddingHorizontal: 14, fontSize: 16, color: colors.text },
  loading: { flex: 1 },
  list: { padding: 20, gap: 9, flexGrow: 1 },
  empty: { flex: 1, justifyContent: "center", alignItems: "center", gap: 12, padding: 20 },
  option: { flexDirection: "row", alignItems: "center", gap: 12, minHeight: 62, padding: 12,
    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md },
  optionSelected: { borderColor: colors.primary, backgroundColor: colors.steelSoft },
  clientText: { flex: 1, gap: 2 },
  clientName: { color: colors.text, fontSize: 16, fontWeight: "700" },
  footer: { padding: 20, borderTopWidth: 1, borderTopColor: colors.border, gap: 10 },
  errorRow: { gap: 8 }, error: { color: colors.danger, fontSize: 14 },
  linkButton: { padding: 10 }, linkText: { color: colors.primary, fontWeight: "700" },
  createButton: { height: 52, justifyContent: "center", alignItems: "center", borderRadius: radius.md,
    backgroundColor: colors.accent },
  createText: { color: colors.textLight, fontSize: 16, fontWeight: "800" },
  disabled: { opacity: 0.55 },
});
