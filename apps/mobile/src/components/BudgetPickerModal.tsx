import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { colors, radius } from "@/constants/theme";
import { useCompany } from "@/contexts/CompanyContext";
import { listBudgetsByCompany } from "@/services/budget-service";
import { formatMoney, getBudgetStatusLabel, type Budget } from "@/types/budget";
import { editableBudgets } from "@/utils/budget-picker";

type BudgetPickerModalProps = {
  visible: boolean;
  onClose: () => void;
  onSelect: (budget: Budget) => void;
};

/**
 * Lista los presupuestos de la empresa activa que aceptan partidas (todos
 * menos aprobados y cancelados) para elegir dónde guardar una calculadora.
 */
export function BudgetPickerModal({ visible, onClose, onSelect }: BudgetPickerModalProps) {
  const { activeCompany } = useCompany();
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const load = useCallback(async () => {
    if (!activeCompany) return;
    setLoading(true);
    setError(null);
    const response = await listBudgetsByCompany(activeCompany.id);
    setLoading(false);
    if (response.error) {
      setError(response.error);
      return;
    }
    setBudgets(response.budgets);
  }, [activeCompany]);

  useEffect(() => {
    if (visible) {
      setSearch("");
      void load();
    }
  }, [visible, load]);

  const options = useMemo(() => editableBudgets(budgets, search), [budgets, search]);

  const goTo = (path: "/presupuestos" | "/proyectos") => {
    onClose();
    router.push(path);
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.header}>
          <View style={styles.headerCopy}>
            <Text style={styles.title}>Elige un presupuesto</Text>
            <Text style={styles.subtitle}>
              La partida se agregará al presupuesto que elijas. Los aprobados y cancelados no aceptan partidas nuevas.
            </Text>
          </View>
          <Pressable onPress={onClose} hitSlop={12} accessibilityRole="button" accessibilityLabel="Cerrar">
            <Ionicons name="close" size={26} color={colors.text} />
          </Pressable>
        </View>

        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder="Buscar por número o nombre"
          placeholderTextColor={colors.textMuted}
          style={styles.search}
          autoCorrect={false}
        />

        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator color={colors.primary} />
          </View>
        ) : error ? (
          <View style={styles.center}>
            <Text style={styles.message}>{error}</Text>
            <Pressable onPress={() => void load()} style={styles.secondaryButton}>
              <Text style={styles.secondaryText}>Reintentar</Text>
            </Pressable>
          </View>
        ) : (
          <FlatList
            data={options}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.list}
            keyboardShouldPersistTaps="handled"
            ListEmptyComponent={
              <View style={styles.center}>
                <Ionicons name="document-text-outline" size={34} color={colors.textMuted} />
                <Text style={styles.emptyTitle}>
                  {search.trim() ? "Ningún presupuesto coincide" : "No tienes presupuestos abiertos"}
                </Text>
                <Text style={styles.message}>
                  Crea un presupuesto desde una obra y vuelve a la calculadora para agregar la partida.
                </Text>
                <View style={styles.emptyActions}>
                  <Pressable onPress={() => goTo("/proyectos")} style={styles.primaryButton}>
                    <Text style={styles.primaryText}>Ir a obras</Text>
                  </Pressable>
                  <Pressable onPress={() => goTo("/presupuestos")} style={styles.secondaryButton}>
                    <Text style={styles.secondaryText}>Ver presupuestos</Text>
                  </Pressable>
                </View>
              </View>
            }
            renderItem={({ item }) => (
              <Pressable
                onPress={() => onSelect(item)}
                style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
                accessibilityRole="button"
              >
                <View style={styles.rowCopy}>
                  <Text style={styles.rowNumber}>
                    {item.budget_number}
                    {item.status === "draft" ? "" : ` · ${getBudgetStatusLabel(item.status)}`}
                  </Text>
                  <Text style={styles.rowTitle} numberOfLines={2}>{item.title}</Text>
                </View>
                <View style={styles.rowAside}>
                  <Text style={styles.rowTotal}>{formatMoney(item.total, item.currency_code)}</Text>
                  <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} />
                </View>
              </Pressable>
            )}
          />
        )}
      </SafeAreaView>
    </Modal>
  );
}

/**
 * Presupuesto de destino de una calculadora: el que llegó por parámetro (si se
 * abrió desde un presupuesto) o el que el usuario elija en el selector.
 */
export function useCalculatorBudget(paramBudgetId?: string) {
  const [selectedBudgetId, setSelectedBudgetId] = useState<string | null>(null);
  const [visible, setVisible] = useState(false);
  const pending = useRef<((budgetId: string) => void) | null>(null);

  const budgetId = paramBudgetId || selectedBudgetId || undefined;

  const requestBudget = useCallback((onSelected: (budgetId: string) => void) => {
    pending.current = onSelected;
    setVisible(true);
  }, []);

  const close = useCallback(() => {
    pending.current = null;
    setVisible(false);
  }, []);

  const select = useCallback((budget: Budget) => {
    setSelectedBudgetId(budget.id);
    setVisible(false);
    const callback = pending.current;
    pending.current = null;
    callback?.(budget.id);
  }, []);

  const budgetPicker = <BudgetPickerModal visible={visible} onClose={close} onSelect={select} />;

  return { budgetId, requestBudget, budgetPicker };
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 12,
  },
  headerCopy: { flex: 1, gap: 4 },
  title: { fontSize: 20, fontWeight: "800", color: colors.text },
  subtitle: { fontSize: 13, lineHeight: 18, color: colors.textSecondary },
  search: {
    marginHorizontal: 20,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    paddingHorizontal: 14,
    paddingVertical: 11,
    fontSize: 15,
    color: colors.text,
  },
  list: { paddingHorizontal: 20, paddingBottom: 32, gap: 10, flexGrow: 1 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 14,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  rowPressed: { opacity: 0.75 },
  rowCopy: { flex: 1, gap: 2 },
  rowNumber: { fontSize: 12, fontWeight: "700", color: colors.textSecondary },
  rowTitle: { fontSize: 15, fontWeight: "700", color: colors.text },
  rowAside: { flexDirection: "row", alignItems: "center", gap: 6 },
  rowTotal: { fontSize: 14, fontWeight: "700", color: colors.text },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 10, padding: 24 },
  emptyTitle: { fontSize: 16, fontWeight: "800", color: colors.text, textAlign: "center" },
  message: { fontSize: 14, lineHeight: 20, color: colors.textSecondary, textAlign: "center" },
  emptyActions: { flexDirection: "row", gap: 10, marginTop: 6 },
  primaryButton: {
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingHorizontal: 16,
    paddingVertical: 11,
  },
  primaryText: { color: colors.surface, fontWeight: "800" },
  secondaryButton: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: 16,
    paddingVertical: 11,
    backgroundColor: colors.surface,
  },
  secondaryText: { color: colors.text, fontWeight: "700" },
});
