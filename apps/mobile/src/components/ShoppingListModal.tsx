import { Ionicons } from "@expo/vector-icons";
import { useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { usePriceContribution } from "@/components/AddPriceModal";
import { colors, radius } from "@/constants/theme";
import { useCompany } from "@/contexts/CompanyContext";
import {
  buildShoppingList,
  formatQuantity,
  rankCatalogMatches,
  shoppingListText,
  withAddedUnitCosts,
  type ShoppingListLine,
} from "@/services/budget-materials";
import { listCatalogItems } from "@/services/catalog-service";
import type { CatalogItemWithDetails } from "@/types/catalog";
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
  const { activeCompany } = useCompany();
  const { requestPrice, priceModal } = usePriceContribution();
  const [addedUnitCosts, setAddedUnitCosts] = useState<Record<string, number>>({});
  const [pricingLine, setPricingLine] = useState<ShoppingListLine | null>(null);
  const [catalog, setCatalog] = useState<CatalogItemWithDetails[] | null>(null);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [search, setSearch] = useState("");
  const baseList = useMemo(() => buildShoppingList(items), [items]);
  const list = useMemo(
    () => withAddedUnitCosts(baseList, addedUnitCosts),
    [baseList, addedUnitCosts],
  );
  const money = (value: number) => formatMoney(value, currencyCode);

  const matches = useMemo(
    () => (pricingLine && catalog ? rankCatalogMatches(pricingLine.name, catalog, search) : []),
    [pricingLine, catalog, search],
  );

  async function openPricing(line: ShoppingListLine) {
    setSearch("");
    setPricingLine(line);
    if (catalog || catalogLoading || !activeCompany?.id) return;
    setCatalogLoading(true);
    const response = await listCatalogItems(activeCompany.id);
    setCatalogLoading(false);
    if (response.error) {
      Alert.alert("No fue posible cargar el catálogo", response.error);
      return;
    }
    setCatalog(response.items);
  }

  function chooseCatalogItem(line: ShoppingListLine, item: CatalogItemWithDetails) {
    const setCost = (source: CatalogItemWithDetails) => {
      const unitCost = source.unit_cost > 0 ? source.unit_cost : source.sale_price;
      if (unitCost > 0) setAddedUnitCosts((current) => ({ ...current, [line.key]: unitCost }));
    };

    if (item.unit_cost > 0 || item.sale_price > 0) {
      setCost(item);
      setPricingLine(null);
      return;
    }

    // Sin precio: el usuario lo agrega y queda como aporte para el catálogo.
    requestPrice(item, (priced) => {
      setCatalog((current) =>
        current ? current.map((entry) => (entry.id === priced.id ? priced : entry)) : current,
      );
      setCost(priced);
      setPricingLine(null);
    });
  }

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
              {line.cost !== null ? (
                <Text style={styles.lineCost}>{money(line.cost)}</Text>
              ) : (
                <Pressable
                  accessibilityRole="button"
                  onPress={() => void openPricing(line)}
                  style={({ pressed }) => [styles.addPrice, pressed && styles.disabled]}
                >
                  <Ionicons name="add-circle-outline" size={16} color={colors.textLight} />
                  <Text style={styles.addPriceText}>Precio</Text>
                </Pressable>
              )}
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

        <Modal
          visible={Boolean(pricingLine)}
          animationType="slide"
          presentationStyle="pageSheet"
          onRequestClose={() => setPricingLine(null)}
        >
          <SafeAreaView style={styles.safeArea}>
            <View style={styles.header}>
              <Pressable onPress={() => setPricingLine(null)}>
                <Text style={styles.headerAction}>Cerrar</Text>
              </Pressable>
              <Text style={styles.headerTitle}>Elegir insumo</Text>
              <View style={styles.headerSpacer} />
            </View>
            <View style={styles.pickerBody}>
              <Text style={styles.subtitle}>
                ¿A qué insumo del catálogo corresponde «{pricingLine?.name}»? Si no tiene precio,
                podrás agregarlo.
              </Text>
              <TextInput
                onChangeText={setSearch}
                placeholder="Buscar en todo el catálogo"
                placeholderTextColor={colors.textMuted}
                style={styles.search}
                value={search}
              />
              {catalogLoading ? (
                <ActivityIndicator color={colors.primary} size="large" />
              ) : (
                <FlatList
                  data={matches}
                  keyExtractor={(entry) => entry.id}
                  keyboardShouldPersistTaps="handled"
                  ListEmptyComponent={
                    <Text style={styles.emptyText}>
                      No encontramos insumos parecidos. Búscalo por otro nombre.
                    </Text>
                  }
                  renderItem={({ item: entry }) => {
                    const price = entry.unit_cost > 0 ? entry.unit_cost : entry.sale_price;
                    return (
                      <Pressable
                        onPress={() => pricingLine && chooseCatalogItem(pricingLine, entry)}
                        style={({ pressed }) => [styles.match, pressed && styles.disabled]}
                      >
                        <View style={styles.lineCopy}>
                          <Text style={styles.lineName}>{entry.name}</Text>
                          <Text style={styles.lineSources}>
                            {[entry.category?.name, entry.unit?.symbol].filter(Boolean).join(" · ")}
                          </Text>
                        </View>
                        <Text style={price > 0 ? styles.lineCost : styles.matchMissing}>
                          {price > 0 ? money(price) : "Sin precio · agregar"}
                        </Text>
                      </Pressable>
                    );
                  }}
                />
              )}
            </View>
          </SafeAreaView>
          {priceModal}
        </Modal>
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
  addPrice: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: radius.full,
    backgroundColor: colors.accent,
  },
  addPriceText: { color: colors.textLight, fontWeight: "900", fontSize: 12 },
  headerSpacer: { width: 48 },
  pickerBody: { flex: 1, padding: 20 },
  search: {
    height: 48,
    paddingHorizontal: 12,
    marginBottom: 12,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    color: colors.text,
  },
  match: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 14,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 8,
  },
  matchMissing: { color: colors.accent, fontWeight: "800", fontSize: 12 },
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
