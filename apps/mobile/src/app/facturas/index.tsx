import { Ionicons } from "@expo/vector-icons";
import { type Href, router, useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { FadeInUp } from "react-native-reanimated";
import { SafeAreaView } from "react-native-safe-area-context";

import { LeuretEmptyState } from "@/components/LeuretEmptyState";
import { LeuretLoading } from "@/components/LeuretLoading";
import { MotionPressable } from "@/components/MotionPressable";
import { colors, radius } from "@/constants/theme";
import { useCompany } from "@/contexts/CompanyContext";
import {
  createInvoiceFromBudget,
  listInvoiceRequests,
  listInvoices,
  type InvoiceRequest,
} from "@/services/invoice-service";
import { confirmAction } from "@/utils/alert";
import { invoiceRequestsLabel } from "@/utils/invoice-requests";
import type { InvoiceWithDetails } from "@/types/invoice";
import { getInvoiceStatusLabel } from "@/types/invoice";
import { formatMoney } from "@/types/budget";
import { formatShortDate } from "@/utils/format";
import { getClientDisplayName } from "@/types/client";
import { usePermissions } from "@/hooks/usePermissions";

export default function InvoicesListScreen() {
  const { activeCompany } = useCompany();
  const { can } = usePermissions();
  const canOpenBudgets = can("budgets.view");
  const [invoices, setInvoices] = useState<InvoiceWithDetails[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState("");
  const [requests, setRequests] = useState<InvoiceRequest[]>([]);
  const [generating, setGenerating] = useState<string | null>(null);
  const [requestError, setRequestError] = useState<string | null>(null);

  const loadInvoices = useCallback(
    async (showRefresh = false) => {
      if (!activeCompany) return;

      if (showRefresh) setRefreshing(true);
      else setLoading(true);

      const [{ invoices: loadedInvoices, error }, pending] = await Promise.all([
        listInvoices(activeCompany.id),
        can("invoices.create") ? listInvoiceRequests(activeCompany.id) : Promise.resolve({ requests: [], error: null }),
      ]);
      setRequests(pending.requests);

      if (error) {
        console.error("Error cargando facturas", error);
      } else {
        setInvoices(loadedInvoices);
      }

      setLoading(false);
      setRefreshing(false);
    },
    [activeCompany, can],
  );

  async function generateFromRequest(request: InvoiceRequest) {
    if (!activeCompany || generating) return;
    const confirmed = await confirmAction({
      title: "Generar factura",
      message: `Se emitirá la factura de ${request.budget_number} para ${request.client_name}.`,
      confirmText: "Generar",
    });
    if (!confirmed) return;

    setGenerating(request.id);
    setRequestError(null);
    const { invoice, error } = await createInvoiceFromBudget({
      companyId: activeCompany.id,
      budgetId: request.budget_id,
      clientId: request.client_id,
    });
    setGenerating(null);

    if (error || !invoice) {
      setRequestError(error || "No se pudo generar la factura.");
      return;
    }
    setRequests((current) => current.filter((item) => item.id !== request.id));
    router.push({ pathname: "/facturas/[id]", params: { id: invoice.id } } as Href);
  }

  const requestsHeader = requests.length ? (
    <View style={styles.requests}>
      <View style={styles.requestsHeader}>
        <Ionicons name="hand-left-outline" size={18} color={colors.accent} />
        <Text style={styles.requestsTitle}>{invoiceRequestsLabel(requests.length)}</Text>
      </View>
      {requestError ? <Text style={styles.requestError}>{requestError}</Text> : null}
      {requests.map((request) => (
        <View key={request.id} style={styles.requestCard}>
          <Pressable
            accessibilityRole="button"
            onPress={() => router.push({ pathname: "/presupuestos/[id]", params: { id: request.budget_id } } as Href)}
            style={styles.requestInfo}
          >
            <Text style={styles.requestClient} numberOfLines={1}>{request.client_name}</Text>
            <Text style={styles.requestMeta} numberOfLines={1}>
              {request.project_name} · {request.budget_number} · {formatMoney(request.budget_total, request.currency_code)}
            </Text>
            <Text style={styles.requestMeta}>
              Solicitada el {formatShortDate(request.created_at, activeCompany?.timezone)}
              {request.note ? ` · «${request.note}»` : ""}
            </Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Generar factura de ${request.budget_number}`}
            disabled={Boolean(generating)}
            onPress={() => void generateFromRequest(request)}
            style={({ pressed }) => [styles.requestButton, (pressed || generating === request.id) && styles.pressed]}
          >
            {generating === request.id ? (
              <ActivityIndicator color={colors.textLight} />
            ) : (
              <Text style={styles.requestButtonText}>Generar factura</Text>
            )}
          </Pressable>
        </View>
      ))}
    </View>
  ) : null;

  useFocusEffect(
    useCallback(() => {
      void loadInvoices();
    }, [loadInvoices]),
  );

  const filteredInvoices = invoices.filter((invoice) => {
    const snapshotClient = invoice.snapshot_data?.client;
    const clientName = snapshotClient
      ? snapshotClient.businessName?.trim() ||
        [snapshotClient.firstName, snapshotClient.lastName]
          .filter(Boolean)
          .join(" ")
          .trim()
      : invoice.client
        ? getClientDisplayName(invoice.client)
        : "";
    const term = search.toLowerCase().trim();
    return (
      (invoice.invoice_number ?? "borrador").toLowerCase().includes(term) ||
      clientName.toLowerCase().includes(term)
    );
  });

  const getStatusColor = (status: string) => {
    switch (status) {
      case "paid":
        return { text: colors.success, bg: colors.successSoft };
      case "cancelled":
        return { text: colors.danger, bg: colors.dangerSoft };
      case "overdue":
        return { text: colors.danger, bg: colors.dangerSoft };
      case "draft":
        return { text: colors.textSecondary, bg: colors.steelSoft };
      case "issued":
        return { text: colors.primary, bg: colors.steelSoft };
      default:
        return { text: colors.warning, bg: colors.sandSoft };
    }
  };

  if (loading) {
    return <LeuretLoading message="Cargando facturas…" fullScreen />;
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={["bottom"]}>
      <View style={styles.header}>
        <View style={styles.searchBox}>
          <Ionicons name="search-outline" size={20} color={colors.textSecondary} />
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Buscar por número o cliente..."
            placeholderTextColor={colors.textMuted}
            style={styles.searchInput}
          />
        </View>

        {can("company.manage") ? (
          <Pressable
            onPress={() => router.push("/facturas/settings" as Href)}
            style={({ pressed }) => [
              styles.settingsButton,
              pressed && styles.pressed,
            ]}
          >
            <Ionicons name="create-outline" size={20} color={colors.primary} />
            <Text style={styles.settingsButtonText}>Diseño</Text>
          </Pressable>
        ) : null}
      </View>

      <FlatList
        data={filteredInvoices}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        ListHeaderComponent={requestsHeader}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => void loadInvoices(true)}
            tintColor={colors.primary}
          />
        }
        ListEmptyComponent={
          <LeuretEmptyState
            icon={search.trim() ? "search-outline" : "receipt-outline"}
            title={search.trim() ? "Sin coincidencias" : "No hay facturas"}
            description={search.trim() ? "Prueba con otro número o nombre de cliente." : "Las facturas se generan desde presupuestos aprobados cuando seleccionas Generar factura."}
            actionLabel={search.trim() ? "Limpiar búsqueda" : canOpenBudgets ? "Ir a presupuestos" : undefined}
            actionIcon={search.trim() ? "close-outline" : "document-text-outline"}
            onAction={() => search.trim() ? setSearch("") : router.push("/presupuestos" as Href)}
            style={styles.emptySpacing}
          />
        }
        renderItem={({ item, index }) => {
          const snapshotClient = item.snapshot_data?.client;
          const clientName = snapshotClient
            ? snapshotClient.businessName?.trim() ||
              [snapshotClient.firstName, snapshotClient.lastName]
                .filter(Boolean)
                .join(" ")
                .trim() ||
              "Cliente no registrado"
            : item.client
              ? getClientDisplayName(item.client)
              : "Cliente no registrado";
          const statusColors = getStatusColor(item.status);
          const total = item.snapshot_data?.totals.total ?? item.budget?.total ?? 0;
          const currencyCode = item.snapshot_data?.currency ?? item.budget?.currency_code ?? activeCompany?.currency_code;

          return (
            <MotionPressable
              entering={FadeInUp.delay(index * 45).duration(320)}
              pressedScale={0.985}
              onPress={() =>
                router.push({
                  pathname: "/facturas/[id]",
                  params: { id: item.id },
                } as Href)
              }
              style={({ pressed }) => [
                styles.invoiceCard,
                pressed && styles.pressedCard,
              ]}
            >
              <View style={styles.cardHeader}>
                <View>
                  <Text style={styles.invoiceNumber}>
                    {item.invoice_number ?? "Borrador"}
                  </Text>
                  <Text style={styles.invoiceDate}>
                    {item.issue_date
                      ? formatShortDate(item.issue_date, activeCompany?.timezone)
                      : "Sin emitir"}
                  </Text>
                </View>

                <View
                  style={[
                    styles.statusBadge,
                    { backgroundColor: statusColors.bg },
                  ]}
                >
                  <Text style={[styles.statusText, { color: statusColors.text }]}>
                    {getInvoiceStatusLabel(item.status)}
                  </Text>
                </View>
              </View>

              <Text style={styles.clientName}>{clientName}</Text>

              <View style={styles.cardFooter}>
                <Text style={styles.totalLabel}>Monto total</Text>
                <Text style={styles.totalValue}>
                  {formatMoney(total, currencyCode)}
                </Text>
              </View>
            </MotionPressable>
          );
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  requests: {
    gap: 10,
    padding: 14,
    marginBottom: 16,
    borderRadius: radius.lg,
    borderWidth: 1.5,
    borderColor: colors.accent,
    backgroundColor: colors.accentSoft,
  },
  requestsHeader: { flexDirection: "row", alignItems: "center", gap: 8 },
  requestsTitle: { color: colors.text, fontSize: 15, fontWeight: "900" },
  requestError: { color: colors.danger, fontWeight: "700" },
  requestCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 12,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
  },
  requestInfo: { flex: 1, minWidth: 0, gap: 2 },
  requestClient: { color: colors.text, fontWeight: "900" },
  requestMeta: { color: colors.textSecondary, fontSize: 12 },
  requestButton: {
    minHeight: 40,
    paddingHorizontal: 12,
    borderRadius: radius.md,
    backgroundColor: colors.accent,
    alignItems: "center",
    justifyContent: "center",
  },
  requestButtonText: { color: colors.textLight, fontWeight: "900", fontSize: 13 },
  safeArea: {
    flex: 1,
    backgroundColor: colors.background,
  },

  loader: {
    flex: 1,
    backgroundColor: colors.background,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
  },

  loaderText: {
    color: colors.textSecondary,
    fontSize: 14,
    fontWeight: "700",
  },

  header: {
    paddingHorizontal: 20,
    paddingTop: 14,
    paddingBottom: 8,
    flexDirection: "row",
    gap: 10,
    alignItems: "center",
  },

  searchBox: {
    flex: 1,
    minHeight: 46,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },

  searchInput: {
    flex: 1,
    color: colors.text,
    fontSize: 13,
  },

  settingsButton: {
    minHeight: 46,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },

  settingsButtonText: {
    color: colors.text,
    fontSize: 13,
    fontWeight: "800",
  },

  listContent: {
    padding: 20,
    paddingBottom: 40,
  },

  invoiceCard: {
    marginBottom: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
  },

  pressedCard: {
    backgroundColor: colors.accentSoft,
    opacity: 0.92,
  },

  pressed: {
    opacity: 0.75,
  },

  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },

  invoiceNumber: {
    color: colors.text,
    fontSize: 16,
    fontWeight: "900",
  },

  invoiceDate: {
    marginTop: 3,
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: "600",
  },

  statusBadge: {
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: radius.full,
  },

  statusText: {
    fontSize: 11,
    fontWeight: "900",
    textTransform: "uppercase",
  },

  clientName: {
    marginTop: 10,
    color: colors.text,
    fontSize: 14,
    fontWeight: "bold",
  },

  cardFooter: {
    marginTop: 14,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },

  totalLabel: {
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: "700",
  },

  totalValue: {
    color: colors.accent,
    fontSize: 16,
    fontWeight: "900",
  },

  emptySpacing: {
    marginTop: 24,
  },
});
