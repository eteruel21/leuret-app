import { Ionicons } from "@expo/vector-icons";
import { type Href, router, useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from "react-native";

import { BudgetPickerModal } from "@/components/BudgetPickerModal";
import { CalculatorPickerModal } from "@/components/CalculatorPickerModal";
import { calculatorById } from "@/constants/calculators";
import { colors, radius } from "@/constants/theme";
import { useCompany } from "@/contexts/CompanyContext";
import { usePermissions } from "@/hooks/usePermissions";
import {
  convertCalculationToBudgetItems,
  deleteCalculation,
  fetchCompanyCalculations,
  type SavedCalculation,
} from "@/services/calculation-service";
import type { Budget } from "@/types/budget";
import { confirmAction } from "@/utils/alert";
import { formatMoney, formatShortDate } from "@/utils/format";

type SavedCalculationsSectionProps = {
  /** Solo los cálculos de esta obra (y los nuevos quedan ligados a ella). */
  projectId?: string;
  /** Solo los cálculos de este cliente (y los nuevos quedan ligados a él). */
  clientId?: string;
  /** Muestra solo los más recientes (p. ej. en la pestaña Cálculos). */
  limit?: number;
  title?: string;
  /** Oculta el botón «Nuevo cálculo» (p. ej. cuando ya hay calculadoras a la vista). */
  hideNewButton?: boolean;
};

/**
 * Cálculos guardados: reabrirlos en su calculadora, pasarlos a un presupuesto
 * en borrador o eliminarlos.
 */
export function SavedCalculationsSection({
  projectId,
  clientId,
  limit,
  title = "Cálculos guardados",
  hideNewButton = false,
}: SavedCalculationsSectionProps) {
  const { activeCompany } = useCompany();
  const { can } = usePermissions();
  const [calculations, setCalculations] = useState<SavedCalculation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [toBudget, setToBudget] = useState<SavedCalculation | null>(null);
  const [pickerVisible, setPickerVisible] = useState(false);

  const companyId = activeCompany?.id;
  const currency = activeCompany?.currency_code;
  const canDelete = can("calculations.delete");
  const canAddToBudget = can("budgets.edit");

  const load = useCallback(async () => {
    if (!companyId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      setCalculations(await fetchCompanyCalculations(companyId, projectId, clientId, limit));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "No se pudieron cargar los cálculos.");
    } finally {
      setLoading(false);
    }
  }, [clientId, companyId, limit, projectId]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const open = (calculation: SavedCalculation) => {
    const route = calculatorById(calculation.formula_code)?.route;
    if (!route) {
      Alert.alert("Calculadora no disponible", "Este cálculo pertenece a una calculadora que ya no existe.");
      return;
    }
    router.push({ pathname: route, params: { calculationId: calculation.id } } as Href);
  };

  const remove = async (calculation: SavedCalculation) => {
    if (!companyId) return;
    const confirmed = await confirmAction({
      title: "Eliminar cálculo",
      message: `¿Eliminar «${calculation.title}»? Las partidas que ya pasaste a presupuestos no cambian.`,
      confirmText: "Eliminar",
      destructive: true,
    });
    if (!confirmed) return;
    setBusyId(calculation.id);
    try {
      await deleteCalculation(calculation.id, companyId);
      setCalculations((current) => current.filter((item) => item.id !== calculation.id));
    } catch (removeError) {
      Alert.alert(
        "No se pudo eliminar",
        removeError instanceof Error ? removeError.message : "Inténtalo de nuevo.",
      );
    } finally {
      setBusyId(null);
    }
  };

  const addToBudget = async (budget: Budget) => {
    const calculation = toBudget;
    setToBudget(null);
    if (!calculation || !companyId) return;
    setBusyId(calculation.id);
    try {
      const items = await convertCalculationToBudgetItems(budget.id, companyId, calculation.id);
      Alert.alert(
        "Partida agregada",
        `«${calculation.title}» se agregó a ${budget.budget_number}${items.length > 1 ? ` (${items.length} partidas)` : ""}.`,
        [
          { text: "Seguir aquí", style: "cancel" },
          {
            text: "Ver presupuesto",
            onPress: () =>
              router.push({ pathname: "/presupuestos/[id]", params: { id: budget.id } } as Href),
          },
        ],
      );
    } catch (addError) {
      Alert.alert(
        "No se pudo agregar al presupuesto",
        addError instanceof Error ? addError.message : "Inténtalo de nuevo.",
      );
    } finally {
      setBusyId(null);
    }
  };

  return (
    <View style={styles.section}>
      <View style={styles.header}>
        <Text style={styles.title}>{title}</Text>
        {hideNewButton ? null : (
          <Pressable
            onPress={() => setPickerVisible(true)}
            style={({ pressed }) => [styles.newButton, pressed && styles.pressed]}
            accessibilityRole="button"
          >
            <Ionicons name="calculator-outline" size={16} color={colors.primary} />
            <Text style={styles.newButtonText}>Nuevo cálculo</Text>
          </Pressable>
        )}
      </View>

      {loading ? (
        <ActivityIndicator color={colors.primary} style={styles.loader} />
      ) : error ? (
        <Pressable onPress={() => void load()}>
          <Text style={styles.empty}>{error} Toca para reintentar.</Text>
        </Pressable>
      ) : calculations.length === 0 ? (
        <Text style={styles.empty}>
          {projectId || clientId
            ? "Aún no hay cálculos guardados aquí. Usa «Guardar cálculo» al terminar en cualquier calculadora."
            : "Aún no guardas cálculos. Al terminar en una calculadora, toca «Guardar cálculo»."}
        </Text>
      ) : (
        calculations.map((calculation) => {
          const calculator = calculatorById(calculation.formula_code);
          const expanded = expandedId === calculation.id;
          const busy = busyId === calculation.id;
          const context = calculation.project?.name ?? calculation.client?.name ?? null;
          return (
            <View key={calculation.id} style={styles.card}>
              <Pressable
                onPress={() => setExpandedId(expanded ? null : calculation.id)}
                style={styles.row}
                accessibilityRole="button"
                accessibilityState={{ expanded }}
              >
                <View style={styles.icon}>
                  <Ionicons name={calculator?.icon ?? "calculator-outline"} size={20} color={colors.primary} />
                </View>
                <View style={styles.rowCopy}>
                  <Text style={styles.rowTitle} numberOfLines={2}>{calculation.title}</Text>
                  <Text style={styles.rowMeta} numberOfLines={1}>
                    {[calculator?.title ?? "Cálculo", formatShortDate(calculation.created_at), !projectId ? context : null]
                      .filter(Boolean)
                      .join(" · ")}
                  </Text>
                </View>
                <Text style={styles.rowTotal}>{formatMoney(Number(calculation.total_cost) || 0, currency)}</Text>
                {busy ? (
                  <ActivityIndicator color={colors.primary} />
                ) : (
                  <Ionicons name={expanded ? "chevron-up" : "chevron-down"} size={18} color={colors.textSecondary} />
                )}
              </Pressable>

              {expanded ? (
                <View style={styles.actions}>
                  <ActionButton icon="open-outline" label="Abrir" onPress={() => open(calculation)} />
                  {canAddToBudget ? (
                    <ActionButton
                      icon="document-text-outline"
                      label="A presupuesto"
                      onPress={() => setToBudget(calculation)}
                      disabled={busy}
                    />
                  ) : null}
                  {canDelete ? (
                    <ActionButton
                      icon="trash-outline"
                      label="Eliminar"
                      danger
                      onPress={() => void remove(calculation)}
                      disabled={busy}
                    />
                  ) : null}
                </View>
              ) : null}
            </View>
          );
        })
      )}

      <BudgetPickerModal
        visible={Boolean(toBudget)}
        onClose={() => setToBudget(null)}
        onSelect={(budget) => void addToBudget(budget)}
      />

      <CalculatorPickerModal
        visible={pickerVisible}
        params={{ projectId, clientId }}
        title="Nuevo cálculo"
        subtitle={
          projectId || clientId
            ? "Al guardarlo quedará ligado a esta obra o cliente."
            : "Elige la calculadora."
        }
        onClose={() => setPickerVisible(false)}
      />
    </View>
  );
}

function ActionButton({
  icon,
  label,
  onPress,
  danger = false,
  disabled = false,
}: {
  icon: React.ComponentProps<typeof Ionicons>["name"];
  label: string;
  onPress: () => void;
  danger?: boolean;
  disabled?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [styles.action, (pressed || disabled) && styles.pressed]}
      accessibilityRole="button"
    >
      <Ionicons name={icon} size={16} color={danger ? colors.danger : colors.primary} />
      <Text style={[styles.actionText, danger && styles.actionDanger]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  section: { gap: 10 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },
  title: { fontSize: 18, fontWeight: "800", color: colors.text, flexShrink: 1 },
  newButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.full,
    paddingHorizontal: 12,
    paddingVertical: 7,
    backgroundColor: colors.surface,
  },
  newButtonText: { color: colors.primary, fontWeight: "700", fontSize: 13 },
  pressed: { opacity: 0.7 },
  loader: { marginVertical: 12 },
  empty: { fontSize: 14, lineHeight: 20, color: colors.textSecondary },
  card: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    overflow: "hidden",
  },
  row: { flexDirection: "row", alignItems: "center", gap: 10, padding: 12 },
  icon: {
    width: 36,
    height: 36,
    borderRadius: radius.sm,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.background,
  },
  rowCopy: { flex: 1, gap: 2 },
  rowTitle: { fontSize: 15, fontWeight: "700", color: colors.text },
  rowMeta: { fontSize: 12, color: colors.textSecondary },
  rowTotal: { fontSize: 14, fontWeight: "800", color: colors.text },
  actions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    paddingHorizontal: 12,
    paddingBottom: 12,
  },
  action: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.full,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  actionText: { color: colors.primary, fontWeight: "700", fontSize: 13 },
  actionDanger: { color: colors.danger },
});
