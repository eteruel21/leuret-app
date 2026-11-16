import { Ionicons } from "@expo/vector-icons";
import {
  type Href,
  router,
} from "expo-router";
import {
  useCallback,
  useDeferredValue,
  useMemo,
  useState,
} from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { LeuretEmptyState } from "@/components/LeuretEmptyState";
import { LeuretButton } from "@/components/LeuretButton";
import { LeuretFeedback } from "@/components/LeuretFeedback";
import { LeuretLoading } from "@/components/LeuretLoading";
import { MotionPressable } from "@/components/MotionPressable";
import {
  colors,
  radius,
  shadows,
  typography,
} from "@/constants/theme";
import { useCompany } from "@/contexts/CompanyContext";
import { useFocusedResource } from "@/hooks/useFocusedResource";
import { usePermissions } from "@/hooks/usePermissions";
import {
  createClient,
  deactivateClient,
  listClients,
  reactivateClient,
} from "@/services/client-service";
import type {
  ClientType,
  ClientWithDetails,
} from "@/types/client";
import { getClientDisplayName } from "@/types/client";
import { validateClientAddress, validateClientIdentity } from "@/utils/client-validation";

export default function ClientsScreen() {
  const { activeCompany } = useCompany();
  const { role, can } = usePermissions();
  const canEditClients = can("clients.edit");
  const canArchiveClients = can("clients.delete");
  const companyId = activeCompany?.id;
  const [showArchived, setShowArchived] = useState(false);
  const scope = companyId && role ? `${companyId}:${role}:${showArchived}` : null;

  const [modalVisible, setModalVisible] = useState(false);
  const [search, setSearch] = useState("");
  const query = useDeferredValue(search.trim().toLowerCase());
  const fetchClients = useCallback(async () => {
    const result = await listClients(companyId!, { archived: showArchived });
    return { data: result.error ? undefined : result.clients, error: result.error };
  }, [companyId, showArchived]);
  const { data: clients, error, loading, refreshing, reload, updateData } = useFocusedResource(scope, fetchClients, 0);

  const filteredClients = useMemo(() => {
    if (!clients || !query) return clients;
    return clients.filter((client) =>
      [getClientDisplayName(client), client.phone, client.email, client.document_number]
        .some((value) => value?.toLowerCase().includes(query))
    );
  }, [clients, query]);

  async function handleDeactivateClient(
    client: ClientWithDetails,
  ) {
    if (!activeCompany) return;

    Alert.alert(
      "Archivar cliente",
      `${getClientDisplayName(client)} saldrá de la lista y de los selectores. Sus obras, presupuestos y facturas se conservan, y puedes restaurarlo desde «Archivados».`,
      [
        {
          text: "Cancelar",
          style: "cancel",
        },
        {
          text: "Archivar",
          style: "destructive",
          onPress: async () => {
            const { error } =
              await deactivateClient(
                activeCompany.id,
                client.id,
              );

            if (error) {
              Alert.alert(
                "No fue posible archivar el cliente",
                error,
              );
              return;
            }

            updateData((current) => current.filter((entry) => entry.id !== client.id));
          },
        },
      ],
    );
  }

  async function handleRestoreClient(client: ClientWithDetails) {
    if (!activeCompany) return;

    const { error } = await reactivateClient(activeCompany.id, client.id);
    if (error) {
      Alert.alert("No fue posible restaurar el cliente", error);
      return;
    }

    updateData((current) => current.filter((entry) => entry.id !== client.id));
    Alert.alert("Cliente restaurado", `${getClientDisplayName(client)} vuelve a estar en tu lista de clientes.`);
  }

  if (!activeCompany) {
    return (
      <View style={styles.loading}>
        <LeuretEmptyState
          icon="business-outline"
          title="No hay empresa activa"
          description="Selecciona o crea una empresa para administrar tus clientes."
          compact
        />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={["left", "right", "bottom"]}>
      <FlatList
        data={filteredClients}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={refreshing && !loading}
            onRefresh={() => void reload()}
            tintColor={colors.primary}
          />
        }
        ListEmptyComponent={loading ? (
          <LeuretLoading message="Cargando clientes…" compact />
        ) : clients ? (
          <LeuretEmptyState
            icon={search.trim() ? "search-outline" : "people-outline"}
            title={search.trim() ? "Sin coincidencias" : showArchived ? "No hay clientes archivados" : "No hay clientes"}
            description={search.trim() ? "Prueba con otro nombre, teléfono, correo o documento." : showArchived ? "Los clientes que archives aparecerán aquí para restaurarlos." : "Crea tu primer cliente para iniciar proyectos, visitas y presupuestos."}
            actionLabel={search.trim() ? "Limpiar búsqueda" : canEditClients && !showArchived ? "Agregar cliente" : undefined}
            actionIcon={search.trim() ? "close-outline" : "add"}
            onAction={() => search.trim() ? setSearch("") : setModalVisible(true)}
            style={styles.emptySpacing}
          />
        ) : null}
        ListFooterComponent={
          <View style={{ height: 24 }} />
        }
        ListHeaderComponentStyle={{
          marginBottom: 16,
        }}
        renderItem={({ item }) => (
          <ClientCard
            client={item}
            onPress={() =>
              router.push({
                pathname: "/clientes/[id]",
                params: {
                  id: item.id,
                },
              } as Href)
            }
            archived={showArchived}
            onDeactivate={
              canArchiveClients && !showArchived
                ? () => void handleDeactivateClient(item)
                : undefined
            }
            onRestore={
              canArchiveClients && showArchived
                ? () => void handleRestoreClient(item)
                : undefined
            }
          />
        )}
        ListFooterComponentStyle={{
          marginBottom: 20,
        }}
        ListHeaderComponent={
          <View>
            <View style={styles.header}>
              <View>
                <Text style={styles.eyebrow}>LEURET CLIENTES</Text>

                <Text style={styles.title}>
                  Clientes
                </Text>

                <Text style={styles.subtitle}>
                  {activeCompany.name}
                </Text>
              </View>

              {canEditClients ? (
                <Pressable
                  onPress={() =>
                    setModalVisible(true)
                  }
                  style={({ pressed }) => [
                    styles.addButton,
                    pressed && styles.pressed,
                  ]}
                >
                  <Ionicons
                    name="add"
                    size={24}
                    color={colors.textLight}
                  />
                </Pressable>
              ) : null}
            </View>

            <LeuretButton label="Solicitudes de vinculación" icon="notifications-outline" variant="secondary"
              onPress={() => router.push("/solicitudes")} />

            {error ? (
              <LeuretFeedback
                tone="error"
                title="No pudimos cargar los clientes"
                message={error}
                actionLabel="Reintentar"
                onAction={() => void reload()}
                compact
              />
            ) : null}

            <View style={styles.searchBox}>
              <Ionicons
                name="search-outline"
                size={19}
                color={colors.textSecondary}
              />

              <TextInput
                value={search}
                onChangeText={setSearch}
                placeholder="Buscar por nombre, teléfono, correo o documento"
                placeholderTextColor={colors.textMuted}
                style={styles.searchInput}
              />
            </View>

            <View style={styles.segment} accessibilityRole="tablist">
              {([
                { value: false, label: "Activos" },
                { value: true, label: "Archivados" },
              ] as const).map((option) => {
                const selected = showArchived === option.value;
                return (
                  <Pressable
                    key={option.label}
                    onPress={() => setShowArchived(option.value)}
                    accessibilityRole="tab"
                    accessibilityState={{ selected }}
                    style={[styles.segmentOption, selected && styles.segmentOptionSelected]}
                  >
                    <Text style={[styles.segmentText, selected && styles.segmentTextSelected]}>
                      {option.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            {filteredClients ? (
              <Text style={styles.counter}>
                {filteredClients.length} {filteredClients.length === 1 ? "cliente" : "clientes"}
                {showArchived ? (filteredClients.length === 1 ? " archivado" : " archivados") : ""}
              </Text>
            ) : null}
          </View>
        }
      />

      <CreateClientModal
        visible={modalVisible}
        onClose={() => setModalVisible(false)}
        onCreated={() => void reload()}
        companyId={activeCompany.id}
      />
    </SafeAreaView>
  );
}

type ClientCardProps = {
  client: ClientWithDetails;
  archived: boolean;
  onPress: () => void;
  /** Solo propietario o administrador pueden archivar. */
  onDeactivate?: () => void;
  onRestore?: () => void;
};

function ClientCard({
  client,
  archived,
  onPress,
  onDeactivate,
  onRestore,
}: ClientCardProps) {
  const primaryAddress =
    client.addresses.find(
      (address) => address.is_primary,
    ) ?? client.addresses[0];

  return (
    <MotionPressable
      onPress={onPress}
      pressedScale={0.985}
      style={styles.clientCard}
    >
      <View style={styles.clientIcon}>
        <Ionicons
          name={
            client.client_type === "business"
              ? "business-outline"
              : "person-outline"
          }
          size={23}
          color={colors.textLight}
        />
      </View>

      <View style={styles.clientInfo}>
        <Text style={styles.clientName}>
          {getClientDisplayName(client)}
        </Text>

        <Text style={styles.clientMeta}>
          {client.phone ||
            client.email ||
            "Sin contacto"}
        </Text>

        {primaryAddress ? (
          <Text
            style={styles.clientAddress}
            numberOfLines={1}
          >
            {primaryAddress.address}
          </Text>
        ) : null}
      </View>

      {onDeactivate ? (
        <Pressable
          onPress={onDeactivate}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel={`Archivar a ${getClientDisplayName(client)}`}
        >
          <Ionicons
            name="archive-outline"
            size={20}
            color={colors.danger}
          />
        </Pressable>
      ) : null}
      {onRestore ? (
        <Pressable
          onPress={onRestore}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel={`Restaurar a ${getClientDisplayName(client)}`}
          style={styles.restoreButton}
        >
          <Ionicons name="arrow-undo-outline" size={16} color={colors.primary} />
          <Text style={styles.restoreText}>Restaurar</Text>
        </Pressable>
      ) : archived ? (
        <Ionicons name="archive-outline" size={18} color={colors.textMuted} />
      ) : null}
    </MotionPressable>
  );
}

type CreateClientModalProps = {
  visible: boolean;
  companyId: string;
  onClose: () => void;
  onCreated: () => void;
};

function CreateClientModal({
  visible,
  companyId,
  onClose,
  onCreated,
}: CreateClientModalProps) {
  const [clientType, setClientType] =
    useState<ClientType>("person");

  const [firstName, setFirstName] =
    useState("");
  const [lastName, setLastName] = useState("");
  const [businessName, setBusinessName] =
    useState("");
  const [documentNumber, setDocumentNumber] =
    useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [address, setAddress] = useState("");
  const [reference, setReference] =
    useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] =
    useState(false);

  function resetForm() {
    setClientType("person");
    setFirstName("");
    setLastName("");
    setBusinessName("");
    setDocumentNumber("");
    setPhone("");
    setEmail("");
    setAddress("");
    setReference("");
    setNotes("");
  }

  async function handleCreate() {
    const validation = validateClientIdentity(clientType, firstName, lastName, businessName, email);
    if (validation) { Alert.alert("Revisa los datos", validation); return; }
    if (address.trim()) { const addressValidation = validateClientAddress(address); if (addressValidation) { Alert.alert("Revisa la dirección", addressValidation); return; } }
    try {
      setSubmitting(true);

      const { error, connection } = await createClient({
        companyId,
        clientType,
        firstName,
        lastName,
        businessName,
        documentNumber,
        phone,
        email,
        address,
        reference,
        notes,
      });

      if (error) {
        Alert.alert(
          "No fue posible crear el cliente",
          error,
        );
        return;
      }

      resetForm();
      onClose();
      onCreated();
      if (connection === "sent") {
        Alert.alert("Cliente guardado", "Enviamos una solicitud para que el cliente acepte la vinculación en Leuret.");
      } else if (connection === "pending") {
        Alert.alert("Cliente guardado", "Ya hay una solicitud pendiente. Puedes revisarla en Solicitudes de vinculación.");
      } else if (connection === "not_found" || connection === "ambiguous") {
        Alert.alert("Cliente guardado", "Revisa el correo o celular registrado en Leuret y envía una solicitud desde su ficha.");
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <SafeAreaView style={styles.modalSafeArea}>
        <KeyboardAvoidingView
          style={styles.flex}
          behavior={
            Platform.OS === "ios"
              ? "padding"
              : undefined
          }
        >
          <View style={styles.modalHeader}>
            <Pressable
              onPress={onClose}
              hitSlop={12}
            >
              <Text style={styles.cancelText}>
                Cancelar
              </Text>
            </Pressable>

            <Text style={styles.modalTitle}>
              Nuevo cliente
            </Text>

            <Pressable
              onPress={() => void handleCreate()}
              disabled={submitting}
              hitSlop={12}
            >
              <Text style={styles.saveText}>
                Guardar
              </Text>
            </Pressable>
          </View>

          <ScrollView
            contentContainerStyle={
              styles.modalContent
            }
            keyboardShouldPersistTaps="handled"
          >
            <View style={styles.typeSelector}>
              <Pressable
                onPress={() =>
                  setClientType("person")
                }
                style={[
                  styles.typeButton,
                  clientType === "person" &&
                    styles.typeButtonActive,
                ]}
              >
                <Text
                  style={[
                    styles.typeButtonText,
                    clientType === "person" &&
                      styles.typeButtonTextActive,
                  ]}
                >
                  Persona
                </Text>
              </Pressable>

              <Pressable
                onPress={() =>
                  setClientType("business")
                }
                style={[
                  styles.typeButton,
                  clientType === "business" &&
                    styles.typeButtonActive,
                ]}
              >
                <Text
                  style={[
                    styles.typeButtonText,
                    clientType === "business" &&
                      styles.typeButtonTextActive,
                  ]}
                >
                  Empresa
                </Text>
              </Pressable>
            </View>

            {clientType === "person" ? (
              <>
                <FormField
                  label="Nombre"
                  value={firstName}
                  onChangeText={setFirstName}
                  placeholder="Ej. Juan"
                />

                <FormField
                  label="Apellido"
                  value={lastName}
                  onChangeText={setLastName}
                  placeholder="Ej. Pérez"
                />
              </>
            ) : (
              <FormField
                label="Nombre de empresa cliente"
                value={businessName}
                onChangeText={setBusinessName}
                placeholder="Ej. Constructora ABC"
              />
            )}

            <FormField
              label="Documento / RUC"
              value={documentNumber}
              onChangeText={setDocumentNumber}
              placeholder="Opcional"
            />

            <FormField
              label="Teléfono"
              value={phone}
              onChangeText={setPhone}
              placeholder="+507 6000-0000"
              keyboardType="phone-pad"
            />

            <FormField
              label="Correo"
              value={email}
              onChangeText={setEmail}
              placeholder="cliente@correo.com"
              keyboardType="email-address"
              autoCapitalize="none"
            />

            <FormField
              label="Dirección"
              value={address}
              onChangeText={setAddress}
              placeholder="Dirección principal"
              multiline
            />

            <FormField
              label="Referencia"
              value={reference}
              onChangeText={setReference}
              placeholder="Casa color blanco, portón negro..."
              multiline
            />

            <FormField
              label="Notas"
              value={notes}
              onChangeText={setNotes}
              placeholder="Observaciones internas"
              multiline
            />

            <Pressable
              onPress={() => void handleCreate()}
              disabled={submitting}
              style={({ pressed }) => [
                styles.fullSaveButton,
                submitting &&
                  styles.primaryButtonDisabled,
                pressed && styles.pressed,
              ]}
            >
              {submitting ? (
                <ActivityIndicator
                  color={colors.textLight}
                />
              ) : (
                <Text style={styles.fullSaveText}>
                  Guardar cliente
                </Text>
              )}
            </Pressable>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
}

type FormFieldProps = {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder: string;
  keyboardType?:
    | "default"
    | "email-address"
    | "phone-pad";
  autoCapitalize?:
    | "none"
    | "sentences"
    | "words"
    | "characters";
  multiline?: boolean;
};

function FormField({
  label,
  value,
  onChangeText,
  placeholder,
  keyboardType = "default",
  autoCapitalize = "sentences",
  multiline = false,
}: FormFieldProps) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>

      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.textMuted}
        keyboardType={keyboardType}
        autoCapitalize={autoCapitalize}
        autoCorrect={false}
        multiline={multiline}
        style={[
          styles.input,
          multiline && styles.inputMultiline,
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  segment: {
    flexDirection: "row",
    gap: 8,
    marginTop: 14,
  },
  segmentOption: {
    flex: 1,
    height: 38,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  segmentOptionSelected: {
    borderColor: colors.primary,
    backgroundColor: colors.primary,
  },
  segmentText: {
    color: colors.text,
    fontSize: 13,
    fontWeight: "800",
  },
  segmentTextSelected: {
    color: colors.textLight,
  },
  restoreButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.primary,
  },
  restoreText: {
    color: colors.primary,
    fontSize: 12,
    fontWeight: "800",
  },
  flex: {
    flex: 1,
  },

  safeArea: {
    flex: 1,
    backgroundColor: colors.background,
  },

  loading: {
    flex: 1,
    backgroundColor: colors.background,
    alignItems: "center",
    justifyContent: "center",
  },

  content: {
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 40,
  },

  header: {
    marginBottom: 16,
    padding: 18,
    borderRadius: radius.xl,
    backgroundColor: colors.surfaceDark,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    ...shadows.raised,
  },

  eyebrow: {
    color: colors.accent,
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 1.5,
  },

  title: {
    marginTop: 6,
    color: colors.textLight,
    ...typography.title,
  },

  subtitle: {
    marginTop: 4,
    color: colors.textLightMuted,
    fontSize: 12,
    fontWeight: "700",
  },

  addButton: {
    width: 48,
    height: 48,
    borderRadius: 16,
    backgroundColor: colors.accent,
    alignItems: "center",
    justifyContent: "center",
    ...shadows.glow,
  },

  searchBox: {
    minHeight: 50,
    paddingHorizontal: 15,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    ...shadows.soft,
  },

  searchInput: {
    flex: 1,
    color: colors.text,
    fontSize: 13,
  },

  counter: {
    marginTop: 14,
    marginBottom: 12,
    color: colors.accent,
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 0.8,
    textTransform: "uppercase",
  },

  emptySpacing: {
    marginTop: 24,
  },

  clientCard: {
    minHeight: 84,
    marginBottom: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.xl,
    backgroundColor: colors.surface,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    ...shadows.soft,
  },

  clientIcon: {
    width: 50,
    height: 50,
    borderRadius: 17,
    backgroundColor: colors.surfaceDark,
    alignItems: "center",
    justifyContent: "center",
  },

  clientInfo: {
    flex: 1,
  },

  clientName: {
    color: colors.text,
    fontSize: 15,
    fontWeight: "900",
  },

  clientMeta: {
    marginTop: 3,
    color: colors.textSecondary,
    fontSize: 12,
  },

  clientAddress: {
    marginTop: 3,
    color: colors.textSecondary,
    fontSize: 12,
  },

  modalSafeArea: {
    flex: 1,
    backgroundColor: colors.background,
  },

  modalHeader: {
    minHeight: 56,
    paddingHorizontal: 18,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.surface,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },

  modalTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: "900",
  },

  cancelText: {
    color: colors.textSecondary,
    fontSize: 14,
    fontWeight: "800",
  },

  saveText: {
    color: colors.accent,
    fontSize: 14,
    fontWeight: "900",
  },

  modalContent: {
    padding: 20,
    paddingBottom: 40,
  },

  typeSelector: {
    marginBottom: 18,
    padding: 4,
    borderRadius: radius.md,
    backgroundColor: colors.sandSoft,
    flexDirection: "row",
  },

  typeButton: {
    flex: 1,
    minHeight: 42,
    borderRadius: radius.sm,
    alignItems: "center",
    justifyContent: "center",
  },

  typeButtonActive: {
    backgroundColor: colors.surface,
  },

  typeButtonText: {
    color: colors.textSecondary,
    fontSize: 13,
    fontWeight: "800",
  },

  typeButtonTextActive: {
    color: colors.primary,
  },

  field: {
    marginBottom: 15,
  },

  label: {
    marginBottom: 7,
    color: colors.text,
    fontSize: 12,
    fontWeight: "800",
  },

  input: {
    minHeight: 52,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    color: colors.text,
    fontSize: 14,
  },

  inputMultiline: {
    minHeight: 86,
    paddingTop: 14,
    textAlignVertical: "top",
  },

  fullSaveButton: {
    minHeight: 56,
    marginTop: 8,
    borderRadius: radius.md,
    backgroundColor: colors.accent,
    alignItems: "center",
    justifyContent: "center",
    ...shadows.glow,
  },

  fullSaveText: {
    color: colors.textLight,
    fontSize: 15,
    fontWeight: "900",
  },

  primaryButtonDisabled: {
    opacity: 0.65,
  },

  pressed: {
    opacity: 0.78,
    transform: [{ scale: 0.99 }],
  },
});
