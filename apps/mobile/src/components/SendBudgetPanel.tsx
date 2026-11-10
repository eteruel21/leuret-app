import { Ionicons } from "@expo/vector-icons";
import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { LeuretButton } from "@/components/LeuretButton";
import { colors, radius } from "@/constants/theme";
import { sendBudget } from "@/services/budget-service";
import type { Budget } from "@/types/budget";
import { showAlert } from "@/utils/alert";
import { addDaysKey, todayKey } from "@/utils/client-portal";
import { formatShortDate } from "@/utils/format";

type SendBudgetPanelProps = {
  companyId: string;
  budget: Budget;
  itemCount: number;
  /** El cliente tiene cuenta Leuret vinculada (verá el presupuesto en su portal). */
  clientHasAccount: boolean;
  timezone?: string;
  onSent: (budget: Budget) => void;
};

const VALIDITY_OPTIONS = [15, 30, 60] as const;

/** Envío de un borrador al cliente, con vigencia. */
export function SendBudgetPanel({
  companyId,
  budget,
  itemCount,
  clientHasAccount,
  timezone,
  onSent,
}: SendBudgetPanelProps) {
  const [open, setOpen] = useState(false);
  const [days, setDays] = useState<number>(15);
  const [sending, setSending] = useState(false);
  const today = todayKey(timezone);
  const validUntil = addDaysKey(days, today);

  async function handleSend() {
    setSending(true);
    const result = await sendBudget(companyId, budget.id, validUntil);
    setSending(false);
    if (result.error || !result.budget) {
      showAlert("No se pudo enviar", result.error || "Inténtalo nuevamente.");
      return;
    }
    setOpen(false);
    onSent(result.budget);
    showAlert(
      "Presupuesto enviado",
      clientHasAccount
        ? "Tu cliente lo verá en su portal y recibirá un aviso para aprobarlo."
        : "Quedó como enviado. Tu cliente no tiene cuenta en Leuret: compártele el PDF.",
    );
  }

  if (!open) {
    return (
      <LeuretButton
        label="Enviar al cliente"
        icon="send-outline"
        disabled={itemCount === 0}
        onPress={() => setOpen(true)}
      />
    );
  }

  return (
    <View style={styles.panel}>
      <Text style={styles.title}>Enviar al cliente</Text>
      <Text style={styles.helper}>
        {clientHasAccount
          ? "El cliente podrá revisarlo, aprobarlo o pedir cambios desde su portal."
          : "Este cliente aún no tiene cuenta en Leuret. Quedará como enviado y podrás compartirle el PDF."}
      </Text>

      <Text style={styles.label}>Vigencia</Text>
      <View style={styles.options}>
        {VALIDITY_OPTIONS.map((option) => {
          const selected = option === days;
          return (
            <Pressable
              key={option}
              onPress={() => setDays(option)}
              accessibilityRole="radio"
              accessibilityState={{ selected }}
              style={[styles.option, selected && styles.optionSelected]}
            >
              <Text style={[styles.optionText, selected && styles.optionTextSelected]}>{option} días</Text>
            </Pressable>
          );
        })}
      </View>
      <View style={styles.validRow}>
        <Ionicons name="calendar-outline" size={15} color={colors.textSecondary} />
        <Text style={styles.validText}>Válido hasta el {formatShortDate(validUntil)}</Text>
      </View>

      <View style={styles.actions}>
        <LeuretButton label="Cancelar" variant="secondary" disabled={sending} onPress={() => setOpen(false)} style={styles.action} />
        <LeuretButton label="Enviar" icon="send-outline" loading={sending} onPress={() => void handleSend()} style={styles.action} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  panel: { padding: 16, borderRadius: radius.lg, borderWidth: 1.5, borderColor: colors.primary, backgroundColor: colors.surface },
  title: { color: colors.text, fontSize: 16, fontWeight: "900" },
  helper: { marginTop: 6, color: colors.textSecondary, fontSize: 13, lineHeight: 19 },
  label: { marginTop: 14, color: colors.text, fontSize: 13, fontWeight: "800" },
  options: { marginTop: 8, flexDirection: "row", gap: 8 },
  option: {
    flex: 1,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceRaised,
  },
  optionSelected: { borderColor: colors.primary, backgroundColor: colors.primary },
  optionText: { color: colors.text, fontSize: 13, fontWeight: "800" },
  optionTextSelected: { color: colors.textLight },
  validRow: { marginTop: 10, flexDirection: "row", alignItems: "center", gap: 6 },
  validText: { color: colors.textSecondary, fontSize: 12, fontWeight: "700" },
  actions: { marginTop: 16, flexDirection: "row", gap: 10 },
  action: { flex: 1 },
});
