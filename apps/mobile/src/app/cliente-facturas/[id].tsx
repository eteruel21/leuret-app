import { Ionicons } from "@expo/vector-icons";
import { Stack, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { ContactActions } from "@/components/client/ContactActions";
import { StatusPill } from "@/components/client/StatusPill";
import { LeuretButton } from "@/components/LeuretButton";
import { LeuretFeedback } from "@/components/LeuretFeedback";
import { LeuretLoading } from "@/components/LeuretLoading";
import { colors, radius } from "@/constants/theme";
import {
  getClientInvoice,
  type ClientInvoiceDetail,
  type ClientInvoicePayment,
} from "@/services/client-portal-service";
import { getInvoicePaymentMethodLabel, type InvoicePayment, type InvoiceWithDetails } from "@/types/invoice";
import { showAlert } from "@/utils/alert";
import { clientInvoiceState, daysUntil, relativeDayLabel, todayKey } from "@/utils/client-portal";
import { formatMoney, formatShortDate } from "@/utils/format";
import { shareInvoicePdf } from "@/utils/invoice-pdf";
import { shareReceiptPdf } from "@/utils/receipt-pdf";

export default function ClientInvoiceDetailScreen() {
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const invoiceId = Array.isArray(params.id) ? params.id[0] : params.id;
  const [invoice, setInvoice] = useState<ClientInvoiceDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sharing, setSharing] = useState<string | null>(null);

  const load = useCallback(
    async (showRefresh = false) => {
      if (!invoiceId) {
        setLoading(false);
        return;
      }
      if (showRefresh) setRefreshing(true);
      const result = await getClientInvoice(invoiceId);
      if (result.invoice) setInvoice(result.invoice);
      setError(result.error);
      setLoading(false);
      setRefreshing(false);
    },
    [invoiceId],
  );

  useEffect(() => {
    void load();
  }, [load]);

  async function shareInvoice() {
    if (!invoice) return;
    setSharing("invoice");
    const { error: pdfError } = await shareInvoicePdf({
      // El PDF solo usa el estado y el snapshot inmutable de la factura emitida.
      invoice: invoice as unknown as InvoiceWithDetails,
      paymentInstructions: invoice.company.payment_instructions ?? null,
    });
    setSharing(null);
    if (pdfError) showAlert("No se pudo generar el PDF", pdfError);
  }

  async function shareReceipt(payment: ClientInvoicePayment) {
    setSharing(payment.id);
    const { error: pdfError } = await shareReceiptPdf(payment as unknown as InvoicePayment);
    setSharing(null);
    if (pdfError) showAlert("No se pudo generar el recibo", pdfError);
  }

  if (loading) return <LeuretLoading message="Cargando factura…" fullScreen />;

  if (!invoiceId || !invoice) {
    return (
      <SafeAreaView style={styles.centered}>
        <LeuretFeedback
          tone="error"
          title="Factura no disponible"
          message={error || "No encontramos esta factura."}
          actionLabel="Reintentar"
          onAction={() => void load(true)}
        />
      </SafeAreaView>
    );
  }

  const state = clientInvoiceState(invoice);
  const currency = invoice.currency_code;
  const snapshot = invoice.snapshot_data;
  const today = todayKey(invoice.company.timezone || undefined);
  const paidRatio =
    invoice.adjusted_total_amount > 0
      ? Math.min(1, Math.max(0, invoice.total_paid / invoice.adjusted_total_amount))
      : state.key === "paid"
        ? 1
        : 0;
  const isOpen = state.key === "open" || state.key === "overdue";
  const dueKey = invoice.due_date?.slice(0, 10) ?? null;
  const confirmedPayments = invoice.payments.filter((payment) => payment.status === "confirmed");

  return (
    <SafeAreaView style={styles.safeArea} edges={["bottom"]}>
      <Stack.Screen options={{ title: invoice.invoice_number || "Factura" }} />
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void load(true)} />}
      >
        <View style={styles.hero}>
          <View style={styles.heroTop}>
            <View style={styles.heroInfo}>
              <Text style={styles.number}>{invoice.invoice_number}</Text>
              <Text style={styles.company}>{invoice.company.name}</Text>
              {snapshot?.source.title ? <Text style={styles.meta}>{snapshot.source.title}</Text> : null}
            </View>
            <StatusPill label={state.label} tone={state.tone} />
          </View>

          <Text style={styles.heroLabel}>{isOpen ? "Saldo por pagar" : "Total"}</Text>
          <Text style={styles.heroAmount}>
            {formatMoney(isOpen ? invoice.balance_due : invoice.adjusted_total_amount, currency)}
          </Text>

          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: `${Math.round(paidRatio * 100)}%` }]} />
          </View>
          <Text style={styles.progressText}>
            Pagado {formatMoney(invoice.total_paid, currency)} de {formatMoney(invoice.adjusted_total_amount, currency)}
          </Text>

          {dueKey && isOpen ? (
            <View style={[styles.duePill, daysUntil(dueKey, today) < 0 && styles.duePillLate]}>
              <Ionicons name="time-outline" size={14} color={colors.textLight} />
              <Text style={styles.dueText}>
                {daysUntil(dueKey, today) < 0 ? "Venció" : "Vence"} {formatShortDate(dueKey)} · {relativeDayLabel(dueKey, today)}
              </Text>
            </View>
          ) : null}
        </View>

        {error ? <LeuretFeedback tone="error" title="No se pudo actualizar" message={error} /> : null}

        {isOpen && invoice.company.payment_instructions ? (
          <View style={[styles.card, styles.payCard]}>
            <View style={styles.cardTitleRow}>
              <Ionicons name="wallet-outline" size={20} color={colors.primary} />
              <Text style={styles.sectionTitle}>Cómo pagar</Text>
            </View>
            <Text selectable style={styles.instructions}>
              {invoice.company.payment_instructions}
            </Text>
            <Text style={styles.helper}>
              Cuando pagues, avísale al contratista con tu comprobante para que registre el abono.
            </Text>
            <View style={styles.contact}>
              <ContactActions
                phone={invoice.company.phone}
                email={invoice.company.email}
                whatsappMessage={`Hola, realicé un pago de la factura ${invoice.invoice_number ?? ""} por ${formatMoney(invoice.balance_due, currency)}. Te envío el comprobante.`}
                emailSubject={`Pago de la factura ${invoice.invoice_number ?? ""}`}
              />
            </View>
          </View>
        ) : null}

        {state.key === "paid" ? (
          <LeuretFeedback tone="success" title="Factura pagada" message="Gracias. No tienes saldo pendiente en esta factura." />
        ) : null}

        {snapshot ? (
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Detalle</Text>
            <View style={styles.datesRow}>
              <DateField label="Emitida" value={snapshot.invoice.issueDate} />
              <DateField label="Vence" value={snapshot.invoice.dueDate} />
            </View>
            {snapshot.items.map((item) => (
              <View key={item.id} style={styles.item}>
                <View style={styles.itemInfo}>
                  <Text style={styles.itemTitle}>{item.description}</Text>
                  <Text style={styles.itemMeta}>
                    {item.quantity} {item.unitName} × {formatMoney(item.unitPrice, currency)}
                  </Text>
                </View>
                <Text style={styles.itemTotal}>{formatMoney(item.subtotal, currency)}</Text>
              </View>
            ))}
            <View style={styles.totals}>
              <Row label="Subtotal" value={formatMoney(snapshot.totals.subtotal, currency)} />
              {snapshot.totals.discount > 0 ? (
                <Row label="Descuento" value={`− ${formatMoney(snapshot.totals.discount, currency)}`} />
              ) : null}
              <Row label="ITBMS" value={formatMoney(snapshot.totals.tax, currency)} />
              {invoice.total_credit > 0 ? (
                <Row label="Notas de crédito" value={`− ${formatMoney(invoice.total_credit, currency)}`} />
              ) : null}
              <View style={styles.divider} />
              <Row label="Total" value={formatMoney(invoice.adjusted_total_amount, currency)} strong />
            </View>
            {snapshot.invoice.notes ? <Text style={styles.notes}>{snapshot.invoice.notes}</Text> : null}
          </View>
        ) : null}

        <View style={styles.card}>
          <View style={styles.cardTitleRow}>
            <Text style={styles.sectionTitle}>Pagos registrados</Text>
            <Text style={styles.sectionMeta}>{confirmedPayments.length}</Text>
          </View>
          {invoice.payments.length === 0 ? (
            <Text style={styles.empty}>Aún no hay pagos registrados.</Text>
          ) : (
            invoice.payments.map((payment) => {
              const reversed = payment.status === "reversed";
              return (
                <View key={payment.id} style={styles.payment}>
                  <View style={[styles.paymentIcon, reversed && styles.paymentIconReversed]}>
                    <Ionicons
                      name={reversed ? "arrow-undo-outline" : "checkmark"}
                      size={16}
                      color={reversed ? colors.textSecondary : colors.success}
                    />
                  </View>
                  <View style={styles.itemInfo}>
                    <Text style={[styles.itemTitle, reversed && styles.strike]}>
                      {formatMoney(payment.amount, payment.currency_code)}
                    </Text>
                    <Text style={styles.itemMeta}>
                      {formatShortDate(payment.paid_at)} · {getInvoicePaymentMethodLabel(payment.method)}
                      {reversed ? " · Revertido" : ""}
                    </Text>
                  </View>
                  {!reversed ? (
                    <Pressable
                      onPress={() => void shareReceipt(payment)}
                      disabled={sharing !== null}
                      accessibilityRole="button"
                      accessibilityLabel={`Recibo ${payment.receipt_number}`}
                      style={({ pressed }) => [styles.receiptButton, pressed && styles.pressed]}
                    >
                      <Ionicons name="download-outline" size={16} color={colors.primary} />
                      <Text style={styles.receiptText}>{sharing === payment.id ? "…" : "Recibo"}</Text>
                    </Pressable>
                  ) : null}
                </View>
              );
            })
          )}
        </View>

        {invoice.credit_notes.length > 0 ? (
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Notas de crédito</Text>
            {invoice.credit_notes.map((note) => (
              <View key={note.id} style={styles.item}>
                <View style={styles.itemInfo}>
                  <Text style={styles.itemTitle}>{note.credit_note_number}</Text>
                  <Text style={styles.itemMeta}>{note.reason}</Text>
                </View>
                <Text style={styles.itemTotal}>− {formatMoney(note.amount, note.currency_code)}</Text>
              </View>
            ))}
          </View>
        ) : null}

        <LeuretButton
          label="Descargar o compartir factura"
          icon="document-outline"
          variant="secondary"
          loading={sharing === "invoice"}
          disabled={sharing !== null && sharing !== "invoice"}
          onPress={() => void shareInvoice()}
        />

        {!isOpen || !invoice.company.payment_instructions ? (
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Contacto de {invoice.company.name}</Text>
            <View style={styles.contact}>
              <ContactActions
                phone={invoice.company.phone}
                email={invoice.company.email}
                whatsappMessage={`Hola, tengo una consulta sobre la factura ${invoice.invoice_number ?? ""}.`}
                emailSubject={`Factura ${invoice.invoice_number ?? ""}`}
              />
            </View>
          </View>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

function DateField({ label, value }: { label: string; value: string | null }) {
  return (
    <View style={styles.dateField}>
      <Text style={styles.dateLabel}>{label}</Text>
      <Text style={styles.dateValue}>{value ? formatShortDate(value) : "—"}</Text>
    </View>
  );
}

function Row({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return (
    <View style={styles.row}>
      <Text style={[styles.rowLabel, strong && styles.rowLabelStrong]}>{label}</Text>
      <Text style={[styles.rowValue, strong && styles.strong]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.background },
  centered: { flex: 1, padding: 20, justifyContent: "center", backgroundColor: colors.background },
  content: { padding: 20, paddingBottom: 48, gap: 16 },
  hero: { padding: 18, borderRadius: radius.lg, backgroundColor: colors.surfaceDark },
  heroTop: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  heroInfo: { flex: 1 },
  number: { color: colors.textLightMuted, fontSize: 12, fontWeight: "900" },
  company: { marginTop: 4, color: colors.textLight, fontSize: 18, fontWeight: "900" },
  meta: { marginTop: 4, color: colors.textLightMuted, fontSize: 12, fontWeight: "700" },
  heroLabel: { marginTop: 16, color: colors.textLightMuted, fontSize: 12, fontWeight: "800", textTransform: "uppercase" },
  heroAmount: { marginTop: 4, color: colors.textLight, fontSize: 30, fontWeight: "900" },
  progressTrack: { marginTop: 14, height: 8, borderRadius: 4, backgroundColor: colors.surfaceDarkRaised, overflow: "hidden" },
  progressFill: { height: "100%", borderRadius: 4, backgroundColor: colors.success },
  progressText: { marginTop: 8, color: colors.textLightMuted, fontSize: 12, fontWeight: "700" },
  duePill: {
    marginTop: 12,
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: radius.full,
    backgroundColor: colors.surfaceDarkRaised,
  },
  duePillLate: { backgroundColor: colors.danger },
  dueText: { color: colors.textLight, fontSize: 12, fontWeight: "800" },
  card: { padding: 16, borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, backgroundColor: colors.surface },
  payCard: { borderColor: colors.primary, borderWidth: 1.5 },
  cardTitleRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  sectionTitle: { flex: 1, color: colors.text, fontSize: 16, fontWeight: "900" },
  sectionMeta: { color: colors.textSecondary, fontSize: 12, fontWeight: "800" },
  instructions: {
    marginTop: 12,
    padding: 12,
    borderRadius: radius.md,
    backgroundColor: colors.primaryWash,
    color: colors.text,
    fontSize: 14,
    lineHeight: 21,
    fontWeight: "600",
  },
  helper: { marginTop: 10, color: colors.textSecondary, fontSize: 12, lineHeight: 18 },
  contact: { marginTop: 12 },
  datesRow: { marginTop: 12, flexDirection: "row", gap: 12 },
  dateField: { flex: 1, padding: 10, borderRadius: radius.md, backgroundColor: colors.surfaceAlt },
  dateLabel: { color: colors.textSecondary, fontSize: 11, fontWeight: "800" },
  dateValue: { marginTop: 2, color: colors.text, fontSize: 13, fontWeight: "900" },
  item: { paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.divider, flexDirection: "row", gap: 12, alignItems: "center" },
  itemInfo: { flex: 1 },
  itemTitle: { color: colors.text, fontSize: 13, fontWeight: "800" },
  itemMeta: { marginTop: 4, color: colors.textSecondary, fontSize: 11, fontWeight: "700" },
  itemTotal: { color: colors.text, fontSize: 13, fontWeight: "900" },
  totals: { marginTop: 12 },
  row: { paddingVertical: 6, flexDirection: "row", justifyContent: "space-between", gap: 12 },
  rowLabel: { color: colors.textSecondary, fontSize: 13, fontWeight: "700" },
  rowLabelStrong: { color: colors.text, fontWeight: "900" },
  rowValue: { color: colors.text, fontSize: 14, fontWeight: "900" },
  strong: { color: colors.accent, fontSize: 18 },
  divider: { height: 1, marginVertical: 5, backgroundColor: colors.divider },
  notes: { marginTop: 12, color: colors.textSecondary, fontSize: 12, lineHeight: 18 },
  empty: { marginTop: 10, color: colors.textSecondary, fontSize: 13 },
  payment: { paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.divider, flexDirection: "row", alignItems: "center", gap: 12 },
  paymentIcon: { width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center", backgroundColor: colors.successSoft },
  paymentIconReversed: { backgroundColor: colors.steelSoft },
  strike: { textDecorationLine: "line-through", color: colors.textSecondary },
  receiptButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    height: 32,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  receiptText: { color: colors.primary, fontSize: 12, fontWeight: "800" },
  pressed: { opacity: 0.75 },
});
