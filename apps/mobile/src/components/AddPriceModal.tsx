import { Ionicons } from "@expo/vector-icons";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { colors, radius } from "@/constants/theme";
import { useCompany } from "@/contexts/CompanyContext";
import { submitPriceContribution } from "@/services/catalog-service";
import type { CatalogItemWithDetails } from "@/types/catalog";
import {
  CATALOG_MARKUP,
  parseAmount,
  preparePriceContribution,
  round2,
} from "@/services/price-contribution";
import { formatMoney } from "@/utils/format";

type AddPriceModalProps = {
  item: CatalogItemWithDetails | null;
  onClose: () => void;
  onSaved: (item: CatalogItemWithDetails) => void;
};

/**
 * Ventana para agregar el precio de un insumo que no lo tiene (o corregirlo).
 * El precio queda como precio personal del usuario y como aporte pendiente
 * de revisión del superadministrador para el catálogo de todos.
 */
export function AddPriceModal({ item, onClose, onSaved }: AddPriceModalProps) {
  return (
    <Modal
      visible={Boolean(item)}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <SafeAreaView style={styles.safe}>
        {item ? <PriceForm key={item.id} item={item} onClose={onClose} onSaved={onSaved} /> : null}
      </SafeAreaView>
    </Modal>
  );
}

function PriceForm({
  item,
  onClose,
  onSaved,
}: {
  item: CatalogItemWithDetails;
  onClose: () => void;
  onSaved: (item: CatalogItemWithDetails) => void;
}) {
  const { activeCompany } = useCompany();
  const currency = activeCompany?.currency_code;
  const [unitCost, setUnitCost] = useState(item.unit_cost > 0 ? String(item.unit_cost) : "");
  const [salePrice, setSalePrice] = useState("");
  const [storeName, setStoreName] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const cost = parseAmount(unitCost);
  const suggestedSale = cost > 0 ? round2(cost * CATALOG_MARKUP) : 0;
  const unitLabel = item.unit?.symbol || "unidad";

  async function save() {
    if (saving) return;
    const companyId = activeCompany?.id;
    if (!companyId) {
      setError("Selecciona una empresa antes de agregar precios.");
      return;
    }

    const prepared = preparePriceContribution({ unitCost, salePrice });
    if ("error" in prepared) {
      setError(prepared.error);
      return;
    }

    setSaving(true);
    setError("");
    const response = await submitPriceContribution({
      companyId,
      itemId: item.id,
      unitCost: prepared.unitCost,
      salePrice: prepared.salePrice,
      storeName,
      notes,
    });
    setSaving(false);

    if (response.error || !response.item) {
      setError(response.error ?? "No fue posible guardar el precio.");
      return;
    }

    onSaved(response.item);
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      style={styles.flex}
    >
      <View style={styles.header}>
        <Pressable accessibilityRole="button" hitSlop={8} onPress={onClose}>
          <Text style={styles.close}>Cancelar</Text>
        </Pressable>
        <Text style={styles.title}>Agregar precio</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        <View style={styles.itemCard}>
          <Text style={styles.itemName}>{item.name}</Text>
          <Text style={styles.itemMeta}>
            {[item.category?.name, `por ${unitLabel}`].filter(Boolean).join(" · ")}
          </Text>
        </View>

        <View style={styles.notice}>
          <Ionicons color={colors.primary} name="people-outline" size={18} />
          <Text style={styles.noticeText}>
            Lo usarás de inmediato en tus cálculos y presupuestos. También ayuda a completar el
            catálogo: lo revisamos antes de publicarlo para todos.
          </Text>
        </View>

        <Text style={styles.label}>¿Cuánto te cuesta? (con ITBMS, por {unitLabel})</Text>
        <TextInput
          accessibilityLabel="Costo del insumo"
          autoFocus
          keyboardType="decimal-pad"
          onChangeText={(value) => {
            setUnitCost(value);
            setError("");
          }}
          placeholder="0.00"
          placeholderTextColor={colors.textMuted}
          style={styles.input}
          value={unitCost}
        />

        <Text style={styles.label}>Precio de venta al cliente (opcional)</Text>
        <TextInput
          accessibilityLabel="Precio de venta"
          keyboardType="decimal-pad"
          onChangeText={(value) => {
            setSalePrice(value);
            setError("");
          }}
          placeholder={suggestedSale > 0 ? String(suggestedSale) : "Costo + 35 %"}
          placeholderTextColor={colors.textMuted}
          style={styles.input}
          value={salePrice}
        />
        <Text style={styles.hint}>
          {suggestedSale > 0
            ? `Si lo dejas vacío usamos ${formatMoney(suggestedSale, currency)} (costo + 35 %).`
            : "Si lo dejas vacío usamos el costo + 35 %, el margen del catálogo."}
        </Text>

        <Text style={styles.label}>Tienda o proveedor (opcional)</Text>
        <TextInput
          accessibilityLabel="Tienda o proveedor"
          maxLength={120}
          onChangeText={setStoreName}
          placeholder="Ej.: Cochez, Novey, Do it Center"
          placeholderTextColor={colors.textMuted}
          style={styles.input}
          value={storeName}
        />

        <Text style={styles.label}>Nota (opcional)</Text>
        <TextInput
          accessibilityLabel="Nota"
          maxLength={500}
          multiline
          onChangeText={setNotes}
          placeholder="Marca, presentación, si era oferta…"
          placeholderTextColor={colors.textMuted}
          style={[styles.input, styles.multiline]}
          value={notes}
        />

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <Pressable
          accessibilityRole="button"
          disabled={saving}
          onPress={() => void save()}
          style={({ pressed }) => [styles.save, (pressed || saving) && styles.savePressed]}
        >
          {saving ? (
            <ActivityIndicator color={colors.textLight} />
          ) : (
            <Text style={styles.saveText}>Guardar precio</Text>
          )}
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

/**
 * Pide el precio de un insumo sin precio y avisa cuando se guardó.
 * Uso: `const { requestPrice, priceModal } = usePriceContribution();`
 * y renderiza `{priceModal}` en la pantalla.
 */
export function usePriceContribution(): {
  requestPrice: (item: CatalogItemWithDetails, onPriced: (item: CatalogItemWithDetails) => void) => void;
  priceModal: ReactNode;
} {
  const [item, setItem] = useState<CatalogItemWithDetails | null>(null);
  const callback = useRef<((item: CatalogItemWithDetails) => void) | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  const requestPrice = useCallback(
    (target: CatalogItemWithDetails, onPriced: (item: CatalogItemWithDetails) => void) => {
      callback.current = onPriced;
      if (timer.current) clearTimeout(timer.current);
      // En iOS no se puede abrir una ventana mientras se cierra el selector del catálogo.
      timer.current = setTimeout(() => setItem(target), Platform.OS === "ios" ? 450 : 0);
    },
    []
  );

  const priceModal = (
    <AddPriceModal
      item={item}
      onClose={() => {
        setItem(null);
        callback.current = null;
      }}
      onSaved={(saved) => {
        setItem(null);
        const done = callback.current;
        callback.current = null;
        done?.(saved);
      }}
    />
  );

  return { requestPrice, priceModal };
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
  close: { color: colors.primary, fontWeight: "800", fontSize: 15 },
  title: { color: colors.text, fontWeight: "900", fontSize: 17 },
  headerSpacer: { width: 60 },
  body: { padding: 20, paddingBottom: 48, gap: 8 },
  itemCard: {
    padding: 16,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 8,
  },
  itemName: { color: colors.text, fontSize: 16, fontWeight: "900" },
  itemMeta: { color: colors.textSecondary, fontSize: 12, marginTop: 4 },
  notice: {
    flexDirection: "row",
    gap: 10,
    padding: 12,
    borderRadius: radius.md,
    backgroundColor: colors.steelSoft,
    marginBottom: 8,
  },
  noticeText: { flex: 1, color: colors.primary, fontSize: 13, lineHeight: 18 },
  label: { color: colors.text, fontSize: 13, fontWeight: "800", marginTop: 8 },
  input: {
    minHeight: 50,
    paddingHorizontal: 14,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    color: colors.text,
    fontSize: 16,
  },
  multiline: { minHeight: 80, paddingTop: 12, textAlignVertical: "top" },
  hint: { color: colors.textSecondary, fontSize: 12 },
  error: { color: colors.danger, fontWeight: "700", marginTop: 8 },
  save: {
    height: 54,
    borderRadius: radius.md,
    backgroundColor: colors.accent,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 16,
  },
  savePressed: { opacity: 0.8 },
  saveText: { color: colors.textLight, fontWeight: "900", fontSize: 16 },
});
