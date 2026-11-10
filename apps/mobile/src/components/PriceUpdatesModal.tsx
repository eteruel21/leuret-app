import { Ionicons } from "@expo/vector-icons";
import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { colors, radius } from "@/constants/theme";
import type { BudgetPriceUpdate } from "@/services/budget-service";
import { formatMoney } from "@/types/budget";

export function PriceUpdatesBanner({
  updates,
  currencyCode,
  onPress,
}: {
  updates: BudgetPriceUpdate[];
  currencyCode?: string;
  onPress: () => void;
}) {
  if (updates.length === 0) return null;

  const difference = updates.reduce(
    (sum, update) => sum + update.priceDifference,
    0,
  );

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.banner, pressed && styles.pressed]}
    >
      <Ionicons name="refresh-circle-outline" size={26} color={colors.warning} />
      <View style={styles.bannerCopy}>
        <Text style={styles.bannerTitle}>
          {updates.length === 1
            ? "1 partida tiene precio nuevo en el catálogo"
            : `${updates.length} partidas tienen precios nuevos en el catálogo`}
        </Text>
        <Text style={styles.bannerText}>
          Diferencia en el subtotal: {difference > 0 ? "+" : ""}
          {formatMoney(difference, currencyCode)}. Toca para revisar.
        </Text>
      </View>
      <Ionicons name="chevron-forward" size={20} color={colors.textSecondary} />
    </Pressable>
  );
}

export function PriceUpdatesModal({
  visible,
  updates,
  currencyCode,
  applying,
  onClose,
  onApply,
}: {
  visible: boolean;
  updates: BudgetPriceUpdate[];
  currencyCode?: string;
  applying: boolean;
  onClose: () => void;
  onApply: (itemIds: string[]) => void;
}) {
  const [selected, setSelected] = useState<string[]>([]);

  useEffect(() => {
    if (visible) setSelected(updates.map((update) => update.itemId));
  }, [visible, updates]);

  const money = (value: number) => formatMoney(value, currencyCode);
  const selectedDifference = useMemo(
    () =>
      updates
        .filter((update) => selected.includes(update.itemId))
        .reduce((sum, update) => sum + update.priceDifference, 0),
    [selected, updates],
  );

  function toggle(itemId: string) {
    setSelected((current) =>
      current.includes(itemId)
        ? current.filter((id) => id !== itemId)
        : [...current, itemId],
    );
  }

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.header}>
          <Pressable onPress={onClose} disabled={applying}>
            <Text style={styles.headerAction}>Cancelar</Text>
          </Pressable>
          <Text style={styles.headerTitle}>Precios nuevos</Text>
          <View style={styles.headerSpacer} />
        </View>

        <ScrollView contentContainerStyle={styles.content}>
          <Text style={styles.subtitle}>
            Estas partidas vienen del catálogo y su precio cambió desde que
            las agregaste. Elige cuáles actualizar; las demás se quedan como
            están.
          </Text>

          {updates.map((update) => {
            const checked = selected.includes(update.itemId);
            return (
              <Pressable
                key={update.itemId}
                onPress={() => toggle(update.itemId)}
                style={({ pressed }) => [
                  styles.row,
                  checked && styles.rowSelected,
                  pressed && styles.pressed,
                ]}
              >
                <Ionicons
                  name={checked ? "checkbox" : "square-outline"}
                  size={22}
                  color={checked ? colors.primary : colors.textSecondary}
                />
                <View style={styles.rowCopy}>
                  <Text style={styles.rowTitle}>{update.description}</Text>
                  <Text style={styles.rowMeta}>
                    {update.quantity} {update.unitName}
                  </Text>
                  <Text style={styles.rowPrices}>
                    Precio {money(update.unitPrice)} → {money(update.catalogUnitPrice)}
                  </Text>
                  <Text style={styles.rowMeta}>
                    Costo {money(update.unitCost)} → {money(update.catalogUnitCost)}
                  </Text>
                </View>
                <Text
                  style={[
                    styles.rowDifference,
                    update.priceDifference > 0 ? styles.up : styles.down,
                  ]}
                >
                  {update.priceDifference > 0 ? "+" : ""}
                  {money(update.priceDifference)}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>

        <View style={styles.footer}>
          <Text style={styles.footerText}>
            {selected.length} seleccionada{selected.length === 1 ? "" : "s"} ·
            subtotal {selectedDifference > 0 ? "+" : ""}
            {money(selectedDifference)}
          </Text>
          <Pressable
            disabled={applying || selected.length === 0}
            onPress={() => onApply(selected)}
            style={({ pressed }) => [
              styles.applyButton,
              (applying || selected.length === 0) && styles.disabled,
              pressed && styles.pressed,
            ]}
          >
            {applying ? (
              <ActivityIndicator color={colors.textLight} />
            ) : (
              <Text style={styles.applyText}>Actualizar precios</Text>
            )}
          </Pressable>
        </View>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginTop: 14,
    padding: 14,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.warning,
    backgroundColor: colors.surface,
  },
  bannerCopy: { flex: 1 },
  bannerTitle: { color: colors.text, fontWeight: "900" },
  bannerText: { color: colors.textSecondary, fontSize: 12, marginTop: 3 },
  pressed: { opacity: 0.75 },
  disabled: { opacity: 0.5 },
  safeArea: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.surface,
  },
  headerAction: { color: colors.primary, fontWeight: "800" },
  headerTitle: { color: colors.text, fontSize: 17, fontWeight: "900" },
  headerSpacer: { width: 62 },
  content: { padding: 20, paddingBottom: 32 },
  subtitle: { color: colors.textSecondary, lineHeight: 20, marginBottom: 16 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 12,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    marginBottom: 8,
  },
  rowSelected: { borderColor: colors.primary },
  rowCopy: { flex: 1 },
  rowTitle: { color: colors.text, fontWeight: "800" },
  rowMeta: { color: colors.textSecondary, fontSize: 12, marginTop: 2 },
  rowPrices: { color: colors.text, fontSize: 13, marginTop: 4 },
  rowDifference: { fontWeight: "900" },
  up: { color: colors.danger },
  down: { color: colors.success },
  footer: {
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.surface,
    gap: 10,
  },
  footerText: { color: colors.textSecondary, textAlign: "center" },
  applyButton: {
    minHeight: 50,
    borderRadius: radius.md,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  applyText: { color: colors.textLight, fontWeight: "900", fontSize: 15 },
});
