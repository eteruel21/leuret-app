import { Ionicons } from "@expo/vector-icons";
import { useMemo } from "react";
import {
  Alert,
  Modal,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { colors, radius } from "@/constants/theme";
import {
  buildShoppingList,
  formatQuantity,
  shoppingListText,
} from "@/services/budget-materials";
import type { BudgetItem } from "@/types/budget";
import { formatMoney } from "@/types/budget";

export function ShoppingListModal({
  visible,
  title,
  items,
  currencyCode,
  onClose,
}: {
  visible: boolean;
  title: string;
  items: BudgetItem[];
  currencyCode?: string;
  onClose: () => void;
}) {
  const list = useMemo(() => buildShoppingList(items), [items]);
  const money = (value: number) => formatMoney(value, currencyCode);

  async function handleShare() {
    try {
      await Share.share({
        title: `Lista de compras · ${title}`,
        message: shoppingListText(list, { title, formatMoney: money }),
      });
    } catch (error) {
      Alert.alert(
        "No fue posible compartir la lista",
        error instanceof Error ? error.message : "Inténtalo de nuevo.",
      );
    }
  }

  const empty = list.lines.length === 0 && list.unbrokenItems.length === 0;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.header}>
          <Pressable onPress={onClose}>
            <Text style={styles.headerAction}>Cerrar</Text>
          </Pressable>
          <Text style={styles.headerTitle}>Lista de compras</Text>
          <Pressable onPress={() => void handleShare()} disabled={empty}>
            <Text style={[styles.headerAction, empty && styles.disabled]}>
              Compartir
            </Text>
          </Pressable>
        </View>

        <ScrollView contentContainerStyle={styles.content}>
          <Text style={styles.subtitle}>
            Materiales de {title}. Se suman los iguales de todas las partidas;
            la mano de obra no se incluye.
          </Text>

          {empty && (
            <View style={styles.emptyBox}>
              <Ionicons name="cart-outline" size={40} color={colors.textMuted} />
              <Text style={styles.emptyText}>
                Este presupuesto todavía no tiene materiales.
              </Text>
            </View>
          )}

          {list.lines.map((line) => (
            <View key={line.key} style={styles.line}>
              <View style={styles.quantityBox}>
                <Text style={styles.quantity}>{formatQuantity(line.quantity)}</Text>
                <Text style={styles.unit}>{line.unit}</Text>
              </View>
              <View style={styles.lineCopy}>
                <Text style={styles.lineName}>{line.name}</Text>
                <Text style={styles.lineSources} numberOfLines={2}>
                  {line.sources.join(" · ")}
                </Text>
              </View>
              <Text style={styles.lineCost}>
                {line.cost !== null ? money(line.cost) : "—"}
              </Text>
            </View>
          ))}

          {list.lines.length > 0 && (
            <View style={styles.totalBox}>
              <Text style={styles.totalLabel}>Costo estimado</Text>
              <Text style={styles.totalValue}>{money(list.knownCost)}</Text>
              {list.linesWithoutCost > 0 && (
                <Text style={styles.totalHint}>
                  {list.linesWithoutCost} material
                  {list.linesWithoutCost === 1 ? "" : "es"} sin precio.
                </Text>
              )}
            </View>
          )}

          {list.unbrokenItems.length > 0 && (
            <View style={styles.unbroken}>
              <Text style={styles.unbrokenTitle}>Partidas sin desglose</Text>
              <Text style={styles.unbrokenHint}>
                Se agregaron sin lista de materiales (a mano o antes de esta
                versión). Revísalas antes de comprar.
              </Text>
              {list.unbrokenItems.map((item) => (
                <View key={item.id} style={styles.unbrokenItem}>
                  <Text style={styles.lineName}>
                    {item.description} ({formatQuantity(item.quantity)}{" "}
                    {item.unit_name})
                  </Text>
                  {item.notes ? (
                    <Text style={styles.lineSources}>{item.notes}</Text>
                  ) : null}
                </View>
              ))}
            </View>
          )}
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
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
  disabled: { opacity: 0.4 },
  content: { padding: 20, paddingBottom: 48 },
  subtitle: { color: colors.textSecondary, lineHeight: 20, marginBottom: 16 },
  emptyBox: { alignItems: "center", paddingVertical: 32, gap: 10 },
  emptyText: { color: colors.textSecondary, textAlign: "center" },
  line: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 12,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 8,
  },
  quantityBox: { minWidth: 58, alignItems: "center" },
  quantity: { color: colors.text, fontSize: 18, fontWeight: "900" },
  unit: { color: colors.textSecondary, fontSize: 12 },
  lineCopy: { flex: 1 },
  lineName: { color: colors.text, fontWeight: "800" },
  lineSources: { color: colors.textSecondary, fontSize: 12, marginTop: 2 },
  lineCost: { color: colors.text, fontWeight: "800" },
  totalBox: {
    marginTop: 8,
    padding: 14,
    borderRadius: radius.md,
    backgroundColor: colors.steelSoft,
  },
  totalLabel: { color: colors.textSecondary, fontWeight: "700" },
  totalValue: { color: colors.text, fontSize: 22, fontWeight: "900", marginTop: 2 },
  totalHint: { color: colors.textSecondary, fontSize: 12, marginTop: 4 },
  unbroken: { marginTop: 24 },
  unbrokenTitle: { color: colors.text, fontSize: 16, fontWeight: "900" },
  unbrokenHint: { color: colors.textSecondary, marginTop: 4, marginBottom: 10 },
  unbrokenItem: {
    padding: 12,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 8,
  },
});
