import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useMemo, useState, type ComponentProps, type ReactNode } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { usePriceContribution } from "@/components/AddPriceModal";
import { useCalculatorBudget } from "@/components/BudgetPickerModal";
import { CreateBudgetButton } from "@/components/CreateBudgetButton";
import { useSavedCalculation } from "@/components/SaveCalculation";
import type { CalculatorId } from "@/constants/calculators";
import { colors, radius } from "@/constants/theme";
import { useCompany } from "@/contexts/CompanyContext";
import { compactMaterials, material } from "@/services/budget-materials";
import { addBudgetItem, type BudgetLineDraft } from "@/services/budget-service";
import {
  budgetUnitCost,
  rankCalculatorCatalogItems,
  trackCatalogPrice,
  withCatalogCosts,
  type TrackedPrice,
} from "@/services/calculators/catalog-pricing";
import { listCatalogItems } from "@/services/catalog-service";
import { loadSyncedSetting, saveSyncedSetting } from "@/services/user-settings-service";
import type { CatalogItemWithDetails } from "@/types/catalog";
import { formatMoney } from "@/utils/format";

/**
 * Pantalla de calculadora guiada por configuración.
 *
 * Cada calculadora nueva solo declara sus secciones, precios, validación,
 * cálculo y partida del presupuesto (ver `calculators/configs`). Esta pantalla
 * pone todo lo demás: ajustes que se recuerdan, catálogo de precios con aporte
 * de precio, presupuesto, guardar cálculo y resultado.
 */

export { compactMaterials, material };

type IconName = ComponentProps<typeof Ionicons>["name"];

export type Values = {
  form: Record<string, string>;
  flags: Record<string, boolean>;
  /** Número de un campo; acepta coma decimal. Vacío o inválido = 0. */
  n: (key: string) => number;
};

export function parseNumber(value: string | undefined): number {
  const parsed = Number(String(value ?? "").replace(",", ".").trim());
  return Number.isFinite(parsed) ? parsed : 0;
}

export function makeValues(form: Record<string, string>, flags: Record<string, boolean>): Values {
  return { form, flags, n: (key) => parseNumber(form[key]) };
}

export type FieldDef = {
  key: string;
  label: string;
  unit?: string;
  /** Con opciones se muestra como botones en vez de un campo de texto. */
  options?: { value: string; label: string }[];
  /** Se recuerda entre cálculos (rendimientos, separaciones, desperdicio…). */
  persist?: boolean;
};

export type ToggleDef = { key: string; title: string; subtitle?: string };

export type SectionDef = {
  title: string;
  description?: string;
  fields: FieldDef[];
  toggles?: ToggleDef[];
  showWhen?: (values: Values) => boolean;
  /** Línea informativa bajo los campos (por ejemplo, el área calculada). */
  info?: (values: Values) => string | null;
};

export type PriceDef = {
  key: string;
  label: string;
  unit: string;
  kind: "material" | "labor";
  /** Palabras (sin tildes, en minúscula) que identifican el insumo en el catálogo. */
  keywords: RegExp;
  /** Solo se pide el precio cuando el trabajo lo necesita. */
  showWhen?: (values: Values) => boolean;
};

export type ResultRow = { label: string; value: string; strong?: boolean };

type BaseResult = { materialsCost: number; laborCost: number; totalCost: number };

export type CalculatorConfig<R extends BaseResult> = {
  id: CalculatorId;
  /** Clave de ajustes en el servidor: `calculator.<nombre>`. */
  settingsKey: string;
  title: string;
  subtitle: string;
  icon: IconName;
  calculateLabel: string;
  defaults: Record<string, string>;
  flagDefaults?: Record<string, boolean>;
  sections: SectionDef[];
  prices: PriceDef[];
  /** Devuelve el mensaje de error, o null si los datos alcanzan para calcular. */
  validate: (values: Values) => string | null;
  compute: (values: Values) => R;
  resultRows: (result: R, values: Values) => ResultRow[];
  /**
   * Partida del presupuesto. `costed` es el mismo cálculo con el costo real
   * de los insumos tomados del catálogo (para registrar costo y venta).
   */
  buildLine: (result: R, costed: R, values: Values) => BudgetLineDraft | null;
};

/** Arma una partida con precio de venta y costo real. */
export function makeLine(input: {
  description: string;
  unit: string;
  quantity: number;
  total: number;
  costTotal: number;
  materials?: ReturnType<typeof compactMaterials>;
  notes?: string;
}): BudgetLineDraft | null {
  if (!(input.quantity > 0)) return null;
  const unitPrice = input.total / input.quantity;
  return {
    itemType: "service",
    description: input.description,
    unitName: input.unit,
    quantity: input.quantity,
    unitCost: budgetUnitCost(input.costTotal, input.quantity, unitPrice),
    unitPrice,
    taxable: true,
    materials: input.materials ?? [],
    notes: input.notes,
  };
}

type Saved = { form?: Record<string, string>; flags?: Record<string, boolean> };
type Snapshot = {
  form: Record<string, string>;
  flags: Record<string, boolean>;
  selected: Record<string, string>;
  tracked: Partial<Record<string, TrackedPrice>>;
};

export function CalculatorScreen<R extends BaseResult>({ config }: { config: CalculatorConfig<R> }) {
  const params = useLocalSearchParams<{ budgetId?: string | string[] }>();
  const paramBudgetId = Array.isArray(params.budgetId) ? params.budgetId[0] : params.budgetId;
  const { budgetId, requestBudget, budgetPicker } = useCalculatorBudget(paramBudgetId);
  const { activeCompany } = useCompany();
  const currency = activeCompany?.currency_code ?? undefined;
  const { requestPrice, priceModal } = usePriceContribution();

  const [form, setForm] = useState<Record<string, string>>(config.defaults);
  const [flags, setFlags] = useState<Record<string, boolean>>(config.flagDefaults ?? {});
  const [result, setResult] = useState<R | null>(null);
  const [message, setMessage] = useState("");
  const [lastBudgetId, setLastBudgetId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [items, setItems] = useState<CatalogItemWithDetails[]>([]);
  const [loadingCatalog, setLoadingCatalog] = useState(false);
  const [target, setTarget] = useState<PriceDef | null>(null);
  const [selected, setSelected] = useState<Record<string, string>>({});
  const [tracked, setTracked] = useState<Partial<Record<string, TrackedPrice>>>({});

  const values = useMemo(() => makeValues(form, flags), [form, flags]);
  const persistKeys = useMemo(
    () => [
      ...config.sections.flatMap((section) => section.fields.filter((field) => field.persist).map((field) => field.key)),
      ...config.prices.map((price) => price.key),
    ],
    [config],
  );

  // Ajustes recordados (precios, rendimientos, desperdicio, opciones).
  useEffect(() => {
    async function restore() {
      const saved = await loadSyncedSetting<Saved>(config.settingsKey);
      if (saved?.form) {
        const next: Record<string, string> = {};
        for (const key of persistKeys) {
          if (typeof saved.form[key] === "string") next[key] = saved.form[key];
        }
        setForm((current) => ({ ...current, ...next }));
      }
      if (saved?.flags) setFlags((current) => ({ ...current, ...saved.flags }));
      setLoaded(true);
    }
    void restore();
  }, [config.settingsKey, persistKeys]);

  useEffect(() => {
    if (!loaded) return;
    const settings: Record<string, string> = {};
    for (const key of persistKeys) settings[key] = form[key] ?? "";
    void saveSyncedSetting<Saved>(config.settingsKey, { form: settings, flags });
  }, [form, flags, loaded, persistKeys, config.settingsKey]);

  useEffect(() => {
    const companyId = activeCompany?.id;
    if (!companyId) return;
    async function loadCatalog(id: string) {
      setLoadingCatalog(true);
      const response = await listCatalogItems(id);
      if (response.error) Alert.alert("No fue posible cargar el catálogo", response.error);
      else setItems(response.items);
      setLoadingCatalog(false);
    }
    void loadCatalog(companyId);
  }, [activeCompany]);

  function update(key: string, value: string) {
    setForm((current) => ({ ...current, [key]: value }));
    setError("");
    setMessage("");
  }

  function setFlag(key: string, value: boolean) {
    setFlags((current) => ({ ...current, [key]: value }));
    setError("");
    setMessage("");
  }

  function choose(item: CatalogItemWithDetails) {
    const price = target;
    if (!price) return;
    setTarget(null);

    const apply = (source: CatalogItemWithDetails) => {
      const priced = trackCatalogPrice(source);
      update(price.key, String(priced.price));
      setTracked((current) => ({ ...current, [price.key]: priced }));
      setSelected((current) => ({ ...current, [price.key]: source.name }));
    };

    // Sin precio: el usuario lo agrega y queda como aporte para el catálogo.
    if (trackCatalogPrice(item).price <= 0) {
      requestPrice(item, (priced) => {
        setItems((current) => current.map((entry) => (entry.id === priced.id ? priced : entry)));
        apply(priced);
      });
      return;
    }
    apply(item);
  }

  function calculate() {
    const problem = config.validate(values);
    if (problem) {
      setError(problem);
      setResult(null);
      return;
    }
    setResult(config.compute(values));
    setError("");
    setMessage("");
    setLastBudgetId(null);
  }

  /** Partida del resultado actual: sirve para agregar al presupuesto y para guardar el cálculo. */
  function buildBudgetLine(): BudgetLineDraft | null {
    if (!result) return null;
    const costedValues = makeValues(withCatalogCosts(form, tracked), flags);
    return config.buildLine(result, config.compute(costedValues), values);
  }

  const { saveButton, saveModal } = useSavedCalculation<Snapshot>({
    formulaCode: config.id,
    ready: loaded,
    snapshot: () => ({ form, flags, selected, tracked }),
    restore: (saved) => {
      if (saved.form) setForm((current) => ({ ...current, ...saved.form }));
      if (saved.flags) setFlags((current) => ({ ...current, ...saved.flags }));
      if (saved.selected) setSelected(saved.selected);
      if (saved.tracked) setTracked(saved.tracked);
    },
    onRestored: () => calculate(),
    buildLine: buildBudgetLine,
    totalCost: result?.totalCost,
  });

  async function addToBudget(chosenBudgetId?: unknown) {
    if (!result || !activeCompany) return;
    const targetBudgetId = typeof chosenBudgetId === "string" ? chosenBudgetId : budgetId;
    if (!targetBudgetId) {
      requestBudget((id) => void addToBudget(id));
      return;
    }
    const line = buildBudgetLine();
    if (!line) return;
    const response = await addBudgetItem({ companyId: activeCompany.id, budgetId: targetBudgetId, ...line });
    if (response.error) Alert.alert("No fue posible agregar la partida", response.error);
    else {
      setMessage("La partida fue guardada en el presupuesto.");
      setLastBudgetId(targetBudgetId);
    }
  }

  const visiblePrices = config.prices.filter((price) => !price.showWhen || price.showWhen(values));
  const missingPrices = visiblePrices.filter((price) => parseNumber(form[price.key]) <= 0).length;
  const money = (value: number) => formatMoney(value, currency);

  return (
    <SafeAreaView style={styles.safe} edges={["left", "right", "bottom"]}>
      {budgetPicker}
      {saveModal}
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.hero}>
          <Ionicons name={config.icon} size={30} color={colors.textLight} />
          <View style={styles.flex}>
            <Text style={styles.title}>{config.title}</Text>
            <Text style={styles.subtitle}>{config.subtitle}</Text>
          </View>
        </View>

        {config.sections
          .filter((section) => !section.showWhen || section.showWhen(values))
          .map((section) => {
            const info = section.info?.(values);
            return (
              <Section key={section.title} title={section.title} description={section.description}>
                <View style={styles.grid}>
                  {section.fields.map((field) =>
                    field.options ? (
                      <Choice
                        key={field.key}
                        label={field.label}
                        value={form[field.key] ?? ""}
                        options={field.options}
                        onChange={(value) => update(field.key, value)}
                      />
                    ) : (
                      <Input
                        key={field.key}
                        label={field.label}
                        unit={field.unit}
                        value={form[field.key] ?? ""}
                        onChangeText={(value) => update(field.key, value)}
                      />
                    ),
                  )}
                </View>
                {section.toggles?.map((toggle) => (
                  <View key={toggle.key} style={styles.switchRow}>
                    <View style={styles.flex}>
                      <Text style={styles.switchTitle}>{toggle.title}</Text>
                      {toggle.subtitle ? <Text style={styles.small}>{toggle.subtitle}</Text> : null}
                    </View>
                    <Switch
                      value={Boolean(flags[toggle.key])}
                      onValueChange={(value: boolean) => setFlag(toggle.key, value)}
                      trackColor={{ true: colors.accent }}
                    />
                  </View>
                ))}
                {info ? <Text style={styles.info}>{info}</Text> : null}
              </Section>
            );
          })}

        <Section
          title="Precios"
          description={
            missingPrices
              ? `Faltan ${missingPrices} precio${missingPrices === 1 ? "" : "s"}. Tómalos del catálogo o escríbelos.`
              : "Tomados del catálogo de tu empresa o escritos por ti."
          }
        >
          {visiblePrices.map((price) => (
            <View key={price.key} style={styles.priceRow}>
              <Pressable
                onPress={() => setTarget(price)}
                style={styles.catalog}
                accessibilityRole="button"
                accessibilityLabel={`Elegir ${price.label} del catálogo`}
              >
                <View style={styles.flex}>
                  <Text style={styles.label}>{price.label}</Text>
                  <Text style={styles.catalogValue}>{selected[price.key] || "Seleccionar del catálogo"}</Text>
                </View>
                <Ionicons name="chevron-forward" size={20} color={colors.primary} />
              </Pressable>
              <Input
                label={`Precio ${price.unit}`}
                unit="B/."
                value={form[price.key] ?? ""}
                onChangeText={(value) => update(price.key, value)}
              />
            </View>
          ))}
        </Section>

        {error ? <Text style={styles.error}>{error}</Text> : null}
        <Pressable onPress={calculate} style={styles.primary} accessibilityRole="button">
          <Text style={styles.primaryText}>{config.calculateLabel}</Text>
        </Pressable>

        {result ? (
          <View style={styles.results}>
            <Text style={styles.sectionTitle}>Resultado</Text>
            {config.resultRows(result, values).map((row) => (
              <View key={row.label} style={styles.resultRow}>
                <Text style={[styles.resultLabel, row.strong && styles.strong]}>{row.label}</Text>
                <Text style={[styles.resultValue, row.strong && styles.strong]}>{row.value}</Text>
              </View>
            ))}
            <View style={styles.divider} />
            <View style={styles.resultRow}>
              <Text style={styles.resultLabel}>Materiales</Text>
              <Text style={styles.resultValue}>{money(result.materialsCost)}</Text>
            </View>
            <View style={styles.resultRow}>
              <Text style={styles.resultLabel}>Mano de obra</Text>
              <Text style={styles.resultValue}>{money(result.laborCost)}</Text>
            </View>
            <Text style={styles.total}>Total: {money(result.totalCost)}</Text>
            <Pressable onPress={() => void addToBudget()} style={styles.primary} accessibilityRole="button">
              <Text style={styles.primaryText}>Agregar al presupuesto</Text>
            </Pressable>
            <CreateBudgetButton buildLine={buildBudgetLine} defaultTitle={config.title} />
          </View>
        ) : null}
        {result ? saveButton : null}
        {message ? <Text style={styles.success}>{message}</Text> : null}
        {message && lastBudgetId ? (
          <Pressable
            onPress={() => router.push({ pathname: "/presupuestos/[id]", params: { id: lastBudgetId } })}
            style={styles.linkButton}
            accessibilityRole="button"
          >
            <Text style={styles.linkButtonText}>Ver presupuesto</Text>
          </Pressable>
        ) : null}
      </ScrollView>

      <CatalogPicker
        target={target}
        items={items}
        loading={loadingCatalog}
        currency={currency}
        onClose={() => setTarget(null)}
        onSelect={choose}
      />
      {priceModal}
    </SafeAreaView>
  );
}

function Section({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {description ? <Text style={styles.small}>{description}</Text> : null}
      <View style={styles.body}>{children}</View>
    </View>
  );
}

function Input({
  label,
  value,
  onChangeText,
  unit,
}: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  unit?: string;
}) {
  return (
    <View style={styles.inputGroup}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.inputBox}>
        <TextInput
          value={value}
          onChangeText={onChangeText}
          keyboardType="decimal-pad"
          inputMode="decimal"
          placeholder="0.00"
          style={styles.input}
          accessibilityLabel={label}
        />
        {unit ? <Text style={styles.unit}>{unit}</Text> : null}
      </View>
    </View>
  );
}

function Choice({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
}) {
  return (
    <View style={styles.choiceGroup}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.chips}>
        {options.map((option) => {
          const active = option.value === value;
          return (
            <Pressable
              key={option.value}
              onPress={() => onChange(option.value)}
              style={[styles.chip, active && styles.chipActive]}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              accessibilityLabel={`${label}: ${option.label}`}
            >
              <Text style={[styles.chipText, active && styles.chipTextActive]}>{option.label}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

function CatalogPicker({
  target,
  items,
  loading,
  currency,
  onClose,
  onSelect,
}: {
  target: PriceDef | null;
  items: CatalogItemWithDetails[];
  loading: boolean;
  currency?: string;
  onClose: () => void;
  onSelect: (item: CatalogItemWithDetails) => void;
}) {
  const [search, setSearch] = useState("");
  const filtered = useMemo(
    () => (target ? rankCalculatorCatalogItems(items, target.kind, target.keywords, search) : []),
    [items, target, search],
  );

  return (
    <Modal visible={Boolean(target)} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={styles.modal}>
        <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel="Cerrar">
          <Text style={styles.close}>Cerrar</Text>
        </Pressable>
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder="Buscar en todo el catálogo"
          style={[styles.input, styles.search]}
        />
        {loading ? (
          <ActivityIndicator size="large" color={colors.primary} />
        ) : (
          <FlatList
            data={filtered}
            keyExtractor={(item: CatalogItemWithDetails) => item.id}
            ListEmptyComponent={
              <Text style={styles.small}>
                No hay conceptos para este campo en el catálogo. Búscalo por otro nombre o escribe el precio manualmente.
              </Text>
            }
            renderItem={({ item }: { item: CatalogItemWithDetails }) => {
              const price = item.sale_price || item.unit_cost;
              return (
                <Pressable onPress={() => onSelect(item)} style={styles.item}>
                  <Text style={styles.itemName}>{item.name}</Text>
                  <Text style={styles.price}>{price > 0 ? formatMoney(price, currency) : "Sin precio · agregar"}</Text>
                </Pressable>
              );
            }}
          />
        )}
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  content: { padding: 20, paddingBottom: 44 },
  flex: { flex: 1 },
  hero: {
    padding: 18, borderRadius: radius.lg, backgroundColor: colors.surfaceDark,
    flexDirection: "row", alignItems: "center", gap: 14, marginBottom: 18,
  },
  title: { color: colors.textLight, fontSize: 21, fontWeight: "900" },
  subtitle: { color: colors.textLightMuted, fontSize: 13 },
  section: {
    padding: 18, borderRadius: radius.lg, backgroundColor: colors.surface,
    borderWidth: 1, borderColor: colors.border, marginBottom: 16,
  },
  sectionTitle: { color: colors.text, fontSize: 17, fontWeight: "900" },
  small: { color: colors.textSecondary, fontSize: 12 },
  body: { marginTop: 14, gap: 12 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  inputGroup: { width: "48%", minWidth: 135, flexGrow: 1 },
  choiceGroup: { width: "100%" },
  label: { color: colors.text, fontSize: 12, fontWeight: "800", marginBottom: 6 },
  inputBox: {
    height: 50, paddingHorizontal: 12, borderRadius: radius.md, backgroundColor: colors.surfaceAlt,
    borderWidth: 1, borderColor: colors.border, flexDirection: "row", alignItems: "center",
  },
  input: { flex: 1, height: "100%", color: colors.text },
  unit: { color: colors.textSecondary, fontSize: 11 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: {
    minHeight: 42, paddingHorizontal: 14, borderRadius: radius.md, backgroundColor: colors.surfaceAlt,
    borderWidth: 1, borderColor: colors.border, alignItems: "center", justifyContent: "center",
  },
  chipActive: { backgroundColor: colors.accent, borderColor: colors.accent },
  chipText: { color: colors.text, fontWeight: "800", fontSize: 13 },
  chipTextActive: { color: colors.textLight },
  info: { padding: 12, backgroundColor: colors.steelSoft, color: colors.primary, borderRadius: radius.md },
  switchRow: {
    flexDirection: "row", alignItems: "center", padding: 12, backgroundColor: colors.surfaceAlt,
    borderRadius: radius.md,
  },
  switchTitle: { color: colors.text, fontWeight: "800" },
  priceRow: { gap: 8 },
  catalog: {
    minHeight: 58, padding: 14, backgroundColor: colors.steelSoft, borderRadius: radius.md,
    flexDirection: "row", alignItems: "center",
  },
  catalogValue: { color: colors.accent, fontSize: 12 },
  primary: {
    height: 52, borderRadius: radius.md, backgroundColor: colors.accent, alignItems: "center",
    justifyContent: "center", marginBottom: 16,
  },
  primaryText: { color: colors.textLight, fontWeight: "900" },
  linkButton: {
    minHeight: 52, borderRadius: radius.md, borderWidth: 1, borderColor: colors.primary,
    backgroundColor: colors.surface, alignItems: "center", justifyContent: "center",
  },
  linkButtonText: { color: colors.primary, fontWeight: "800", fontSize: 15 },
  error: { color: colors.danger, padding: 12 },
  success: { color: colors.success, padding: 12 },
  results: { padding: 18, backgroundColor: colors.surface, borderRadius: radius.lg, gap: 8, marginBottom: 16 },
  resultRow: { flexDirection: "row", justifyContent: "space-between", gap: 12 },
  resultLabel: { color: colors.textSecondary, flex: 1 },
  resultValue: { color: colors.text, fontWeight: "700", textAlign: "right" },
  strong: { color: colors.text, fontWeight: "900" },
  divider: { height: 1, backgroundColor: colors.border, marginVertical: 6 },
  total: { fontSize: 18, fontWeight: "900", marginVertical: 8, color: colors.text },
  modal: { flex: 1, padding: 20, backgroundColor: colors.background },
  close: { color: colors.primary, fontWeight: "900", marginBottom: 16 },
  item: {
    padding: 15, backgroundColor: colors.surface, borderRadius: radius.md, marginBottom: 10,
    flexDirection: "row", justifyContent: "space-between",
  },
  itemName: { color: colors.text, fontWeight: "800", flex: 1 },
  search: {
    flex: 0, height: 48, paddingHorizontal: 12, marginBottom: 12, borderRadius: radius.md,
    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border,
  },
  price: { color: colors.accent, fontWeight: "900" },
});
