import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { usePriceContribution } from "../../components/AddPriceModal";
import { colors, radius } from "../../constants/theme";
import { useCompany } from "../../contexts/CompanyContext";
import { addBudgetItem } from "../../services/budget-service";
import { compactMaterials, material } from "../../services/budget-materials";
import { listCatalogItems } from "../../services/catalog-service";
import type { CatalogItemWithDetails } from "../../types/catalog";
import {
  budgetUnitCost, rankCalculatorCatalogItems, trackCatalogPrice, withCatalogCosts,
  type TrackedPrice,
} from "../../services/calculators/catalog-pricing";
import {
  calculateElectrical,
  type ElectricalResult,
} from "../../services/calculators/electricidad";
import { formatDecimal, formatMoney } from "../../utils/format";
import { loadLocalData, saveLocalData } from "../../utils/local-storage";
import {
  DEVICES_ONLY_SCOPE,
  FULL_INSTALL_SCOPE,
  electricalBudgetLine,
  electricalCountsLabel,
  normalizeScope,
  relevantPriceTargets,
  scopePreset,
  type ElectricalPriceTarget,
  type ElectricalScope,
} from "../../utils/electrical-scope";
import { useCalculatorBudget } from "@/components/BudgetPickerModal";
import { useSavedCalculation } from "@/components/SaveCalculation";
import type { BudgetLineDraft } from "@/services/budget-service";

type Target = ElectricalPriceTarget;

type Form = {
  lightPoints: string;
  switchPoints: string;
  outletPoints: string;
  dedicatedPoints: string;
  averageRouteLength: string;
  lightingConductors: string;
  powerConductors: string;
  waste: string;
  cableRollLength: string;
  conduitPieceLength: string;
  lightingPointsPerCircuit: string;
  outletPointsPerCircuit: string;
  lightingCableRollPrice: string;
  powerCableRollPrice: string;
  conduitPiecePrice: string;
  boxUnitPrice: string;
  outletUnitPrice: string;
  dedicatedOutletUnitPrice: string;
  switchUnitPrice: string;
  breakerUnitPrice: string;
  suppliesPrice: string;
  standardLaborPrice: string;
  dedicatedLaborPrice: string;
};

type CountField = "lightPoints" | "switchPoints" | "outletPoints" | "dedicatedPoints";
type TechnicalField =
  | "averageRouteLength"
  | "lightingConductors"
  | "powerConductors"
  | "waste"
  | "cableRollLength"
  | "conduitPieceLength"
  | "lightingPointsPerCircuit"
  | "outletPointsPerCircuit";

type Saved = Partial<Omit<Form, CountField>> & { scope?: ElectricalScope };

const KEY = "@contractor-pro/electrical-settings";

const initial: Form = {
  lightPoints: "0",
  switchPoints: "0",
  outletPoints: "0",
  dedicatedPoints: "0",
  averageRouteLength: "8",
  lightingConductors: "3",
  powerConductors: "3",
  waste: "10",
  cableRollLength: "100",
  conduitPieceLength: "3",
  lightingPointsPerCircuit: "8",
  outletPointsPerCircuit: "6",
  lightingCableRollPrice: "",
  powerCableRollPrice: "",
  conduitPiecePrice: "",
  boxUnitPrice: "",
  outletUnitPrice: "",
  dedicatedOutletUnitPrice: "",
  switchUnitPrice: "",
  breakerUnitPrice: "",
  suppliesPrice: "",
  standardLaborPrice: "",
  dedicatedLaborPrice: "",
};

const TECHNICAL_FIELDS: TechnicalField[] = [
  "averageRouteLength",
  "lightingConductors",
  "powerConductors",
  "waste",
  "cableRollLength",
  "conduitPieceLength",
  "lightingPointsPerCircuit",
  "outletPointsPerCircuit",
];

/** Precio de cada fila: campo, nombre, unidad de compra y texto de ayuda. */
const PRICE_ROWS: Record<Target, { field: keyof Form; label: string; unit: string; hint: string }> = {
  outlet: { field: "outletUnitPrice", label: "Tomacorriente", unit: "und.", hint: "Pieza con su placa." },
  dedicatedOutlet: { field: "dedicatedOutletUnitPrice", label: "Tomacorriente 240 V", unit: "und.", hint: "Si lo dejas vacío se usa el precio del tomacorriente." },
  switch: { field: "switchUnitPrice", label: "Interruptor", unit: "und.", hint: "Pieza con su placa." },
  standardLabor: { field: "standardLaborPrice", label: "Mano de obra por punto", unit: "punto", hint: "Instalación o cambio de cada pieza." },
  dedicatedLabor: { field: "dedicatedLaborPrice", label: "Mano de obra punto 240 V", unit: "punto", hint: "Instalación de cada punto dedicado." },
  lightingCable: { field: "lightingCableRollPrice", label: "Cable de iluminación", unit: "rollo", hint: "Precio del rollo completo." },
  powerCable: { field: "powerCableRollPrice", label: "Cable de tomacorrientes", unit: "rollo", hint: "Precio del rollo completo." },
  conduit: { field: "conduitPiecePrice", label: "Tubería", unit: "pieza", hint: "Precio por tubo." },
  box: { field: "boxUnitPrice", label: "Caja eléctrica", unit: "und.", hint: "Una por punto." },
  breaker: { field: "breakerUnitPrice", label: "Breaker", unit: "und.", hint: "Uno por circuito nuevo." },
  supplies: { field: "suppliesPrice", label: "Accesorios e insumos", unit: "global", hint: "Cinta, conectores, grapas… monto total." },
};

const COUNT_FIELDS: { field: CountField; label: string; icon: React.ComponentProps<typeof Ionicons>["name"] }[] = [
  { field: "outletPoints", label: "Tomacorrientes", icon: "power-outline" },
  { field: "switchPoints", label: "Interruptores", icon: "toggle-outline" },
  { field: "lightPoints", label: "Puntos de luz", icon: "bulb-outline" },
  { field: "dedicatedPoints", label: "Puntos 240 V", icon: "flash-outline" },
];

const INCLUDE_OPTIONS: { key: keyof ElectricalScope; label: string }[] = [
  { key: "includeLabor", label: "Mano de obra" },
  { key: "includeWiring", label: "Cableado y tubería" },
  { key: "includeBoxes", label: "Cajas" },
  { key: "includeBreakers", label: "Breakers" },
  { key: "includeSupplies", label: "Accesorios" },
];

function num(value: string | undefined) {
  const parsed = Number(String(value ?? "").replace(",", ".").trim());
  return Number.isFinite(parsed) ? parsed : 0;
}

export default function ElectricalScreen() {
  const params = useLocalSearchParams<{
    budgetId?: string | string[];
  }>();
  const paramBudgetId = Array.isArray(params.budgetId)
    ? params.budgetId[0]
    : params.budgetId;
  const { budgetId, requestBudget, budgetPicker } =
    useCalculatorBudget(paramBudgetId);

  const { activeCompany } = useCompany();
  const currency = activeCompany?.currency_code;
  const { requestPrice, priceModal } = usePriceContribution();

  const [form, setForm] = useState<Form>(initial);
  const [scope, setScope] = useState<ElectricalScope>(DEVICES_ONLY_SCOPE);
  const [result, setResult] = useState<ElectricalResult | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [items, setItems] = useState<CatalogItemWithDetails[]>([]);
  const [loading, setLoading] = useState(false);
  const [target, setTarget] = useState<Target | null>(null);
  const [selected, setSelected] = useState<Partial<Record<Target, string>>>({});
  const [tracked, setTracked] = useState<Partial<Record<keyof Form, TrackedPrice>>>({});
  const [openRow, setOpenRow] = useState<Target | null>(null);
  const [technicalOpen, setTechnicalOpen] = useState(false);

  const counts = {
    lightPoints: num(form.lightPoints),
    switchPoints: num(form.switchPoints),
    outletPoints: num(form.outletPoints),
    dedicatedPoints: num(form.dedicatedPoints),
  };
  const totalPoints = counts.lightPoints + counts.switchPoints + counts.outletPoints + counts.dedicatedPoints;
  const priceTargets = relevantPriceTargets(counts, scope);
  const missingPrices = priceTargets.filter(
    (key) => key !== "dedicatedOutlet" && num(form[PRICE_ROWS[key].field]) <= 0,
  ).length;
  const preset = scopePreset(scope);
  const needsTechnical = scope.includeWiring || scope.includeBreakers;

  useEffect(() => {
    async function restore() {
      const saved = await loadLocalData<Saved>(KEY);
      if (saved) {
        const { scope: savedScope, ...settings } = saved;
        setForm((current) => {
          const next = { ...current };
          for (const [key, value] of Object.entries(settings) as [keyof Form, string | undefined][]) {
            if (typeof value !== "string" || !(key in next)) continue;
            // Un ajuste técnico vacío o en cero vuelve a su valor de referencia.
            if ((TECHNICAL_FIELDS as string[]).includes(key) && num(value) <= 0 && key !== "waste") continue;
            next[key] = value;
          }
          return next;
        });
        if (savedScope) setScope(normalizeScope(savedScope, DEVICES_ONLY_SCOPE));
      }
      setLoaded(true);
    }

    void restore();
  }, []);

  useEffect(() => {
    if (!loaded) return;

    const {
      lightPoints: _lightPoints,
      switchPoints: _switchPoints,
      outletPoints: _outletPoints,
      dedicatedPoints: _dedicatedPoints,
      ...settings
    } = form;

    void saveLocalData<Saved>(KEY, { ...settings, scope });
  }, [form, scope, loaded]);

  useEffect(() => {
    const companyId = activeCompany?.id;
    if (!companyId) return;

    async function loadCatalog(id: string) {
      setLoading(true);
      const response = await listCatalogItems(id);

      if (response.error) {
        Alert.alert("No fue posible cargar el catálogo", response.error);
      } else {
        setItems(response.items);
      }

      setLoading(false);
    }

    void loadCatalog(companyId);
  }, [activeCompany]);

  function update(field: keyof Form, value: string) {
    setForm((current) => ({ ...current, [field]: value }));
    setResult(null);
    setError("");
    setMessage("");
  }

  function changeScope(next: ElectricalScope) {
    setScope(next);
    setResult(null);
    setError("");
    setMessage("");
  }

  function toggleInclude(key: keyof ElectricalScope) {
    changeScope({ ...scope, [key]: !scope[key] });
  }

  function choose(item: CatalogItemWithDetails) {
    if (!target) return;

    const field = PRICE_ROWS[target].field;
    const pickerTarget = target;
    setTarget(null);

    const apply = (source: CatalogItemWithDetails) => {
      const priced = trackCatalogPrice(source);
      update(field, String(priced.price));
      setTracked((current) => ({ ...current, [field]: priced }));
      setSelected((current) => ({ ...current, [pickerTarget]: source.name }));
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

  function compute(source: Form, sourceScope: ElectricalScope): ElectricalResult | null {
    const points =
      num(source.lightPoints) + num(source.switchPoints) + num(source.outletPoints) + num(source.dedicatedPoints);
    if (!points) {
      setError("Indica cuántas piezas vas a cotizar (por ejemplo, 6 tomacorrientes).");
      return null;
    }

    if (
      sourceScope.includeWiring &&
      (!num(source.averageRouteLength) || !num(source.cableRollLength) || !num(source.conduitPieceLength))
    ) {
      setTechnicalOpen(true);
      setError("Revisa en «Ajustes técnicos» las longitudes de recorrido, rollo y tubería.");
      return null;
    }

    if (
      (sourceScope.includeWiring && (!num(source.lightingConductors) || !num(source.powerConductors))) ||
      (sourceScope.includeBreakers && (!num(source.lightingPointsPerCircuit) || !num(source.outletPointsPerCircuit)))
    ) {
      setTechnicalOpen(true);
      setError("Revisa en «Ajustes técnicos» los conductores y los puntos por circuito.");
      return null;
    }

    return calculateElectrical(
      {
        lightPoints: num(source.lightPoints),
        switchPoints: num(source.switchPoints),
        outletPoints: num(source.outletPoints),
        dedicatedPoints: num(source.dedicatedPoints),
        averageRouteLength: num(source.averageRouteLength),
        lightingConductors: num(source.lightingConductors),
        powerConductors: num(source.powerConductors),
        wastePercentage: num(source.waste),
        cableRollLength: num(source.cableRollLength),
        conduitPieceLength: num(source.conduitPieceLength),
        lightingPointsPerCircuit: num(source.lightingPointsPerCircuit),
        outletPointsPerCircuit: num(source.outletPointsPerCircuit),
        ...sourceScope,
      },
      {
        lightingCableRoll: num(source.lightingCableRollPrice),
        powerCableRoll: num(source.powerCableRollPrice),
        conduitPiece: num(source.conduitPiecePrice),
        boxUnit: num(source.boxUnitPrice),
        outletUnit: num(source.outletUnitPrice),
        dedicatedOutletUnit: num(source.dedicatedOutletUnitPrice),
        switchUnit: num(source.switchUnitPrice),
        breakerUnit: num(source.breakerUnitPrice),
        supplies: num(source.suppliesPrice),
        laborStandardPoint: num(source.standardLaborPrice),
        laborDedicatedPoint: num(source.dedicatedLaborPrice),
      },
    );
  }

  function calculate() {
    const next = compute(form, scope);
    if (!next) return;
    setResult(next);
    setOpenRow(null);
    setError("");
    setMessage("");
  }

  /** Partida del resultado actual: se usa al agregar al presupuesto y al guardar el cálculo. */
  function buildBudgetLine(): BudgetLineDraft | null {
    if (!result || result.totalPoints <= 0) return null;
    const line = electricalBudgetLine(result, scope, result);
    const unitPrice = Math.round((result.totalCost / line.quantity) * 100) / 100;
    const c = compute(withCatalogCosts(form, tracked), scope) ?? result;
    const unitCost = budgetUnitCost(c.totalCost, line.quantity, unitPrice);
    const notes = [
      result.lightingCableRollsToBuy ? `${result.lightingCableRollsToBuy} rollos de cable de iluminación` : "",
      result.powerCableRollsToBuy ? `${result.powerCableRollsToBuy} rollos de cable de tomacorrientes` : "",
      result.conduitPieces ? `${result.conduitPieces} tubos` : "",
      result.boxes ? `${result.boxes} cajas` : "",
      result.totalBreakers ? `${result.totalBreakers} breakers` : "",
    ].filter(Boolean).join(" · ");

    return {
      itemType: "service",
      description: line.description,
      unitName: line.unitName,
      quantity: line.quantity,
      unitCost,
      unitPrice,
      taxable: true,
      materials: compactMaterials([
        material("Cable de iluminación", c.lightingCableRollsToBuy, "rollo", c.lightingCableCost),
        material("Cable de tomacorrientes", c.powerCableRollsToBuy, "rollo", c.powerCableCost),
        material("Tubo conduit", c.conduitPieces, "und.", c.conduitCost),
        material("Caja eléctrica", c.boxes, "und.", c.boxCost),
        material("Tomacorriente", c.outletPoints, "und.", c.outletCost - c.dedicatedOutletCost),
        material("Tomacorriente 240 V", c.dedicatedPoints, "und.", c.dedicatedOutletCost),
        material("Interruptor", c.switchPoints, "und.", c.switchCost),
        material("Breaker", c.totalBreakers, "und.", c.breakerCost),
      ]),
      notes: notes || undefined,
    };
  }

  const { saveButton, saveModal } = useSavedCalculation({
    formulaCode: "electricity",
    ready: loaded,
    snapshot: () => ({ form, scope, selected, tracked }),
    restore: (saved) => {
      if (saved.form) setForm((current) => ({ ...current, ...saved.form }));
      // Los cálculos guardados antes de esta versión incluían todo.
      setScope(normalizeScope(saved.scope, FULL_INSTALL_SCOPE));
      if (saved.selected !== undefined) setSelected(saved.selected);
      if (saved.tracked !== undefined) setTracked(saved.tracked);
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

    const response = await addBudgetItem({
      companyId: activeCompany.id,
      budgetId: targetBudgetId,
      ...line,
    });

    if (response.error) {
      Alert.alert("No fue posible agregar la partida", response.error);
    } else {
      setMessage("La partida fue guardada en el presupuesto.");
    }
  }

  const technicalSummary = [
    scope.includeWiring
      ? `${formatDecimal(num(form.averageRouteLength), 1, currency)} m por punto · ${form.lightingConductors || "0"}/${form.powerConductors || "0"} hilos · ${form.waste || "0"} % desperdicio`
      : "",
    scope.includeBreakers
      ? `${form.lightingPointsPerCircuit || "0"} luces y ${form.outletPointsPerCircuit || "0"} tomas por circuito`
      : "",
  ].filter(Boolean).join(" · ");

  return (
    <SafeAreaView style={styles.safe} edges={["left", "right", "bottom"]}>
      {budgetPicker}
      {saveModal}
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.hero}>
          <Ionicons name="flash-outline" size={30} color={colors.textLight} />
          <View style={styles.flex}>
            <Text style={styles.title}>Electricidad</Text>
            <Text style={styles.subtitle}>Cotiza solo lo que vas a hacer: piezas, instalación o la obra completa.</Text>
          </View>
        </View>

        <Section step={1} title="¿Qué vas a cotizar?" description="Elige el tipo de trabajo y ajusta lo que incluye.">
          <View style={styles.presets}>
            <PresetCard
              active={preset === "devices"}
              icon="swap-horizontal-outline"
              title="Cambio o reposición"
              text="Solo las piezas y su instalación."
              onPress={() => changeScope(DEVICES_ONLY_SCOPE)}
            />
            <PresetCard
              active={preset === "full"}
              icon="construct-outline"
              title="Instalación nueva"
              text="Con cableado, tubería, cajas y breakers."
              onPress={() => changeScope(FULL_INSTALL_SCOPE)}
            />
          </View>
          <Text style={styles.label}>Incluye</Text>
          <View style={styles.chips}>
            {INCLUDE_OPTIONS.map((option) => {
              const active = scope[option.key];
              return (
                <Pressable
                  key={option.key}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: active }}
                  onPress={() => toggleInclude(option.key)}
                  style={[styles.chip, active && styles.chipActive]}
                >
                  <Ionicons
                    name={active ? "checkmark-circle" : "ellipse-outline"}
                    size={16}
                    color={active ? colors.textLight : colors.textSecondary}
                  />
                  <Text style={[styles.chipText, active && styles.chipTextActive]}>{option.label}</Text>
                </Pressable>
              );
            })}
          </View>
        </Section>

        <Section step={2} title="Cantidades" description="Escribe solo lo que vas a cotizar; deja en 0 lo demás.">
          <View style={styles.grid}>
            {COUNT_FIELDS.map((entry) => (
              <CountInput
                key={entry.field}
                icon={entry.icon}
                label={entry.label}
                value={form[entry.field]}
                onChange={(value) => update(entry.field, value)}
              />
            ))}
          </View>
          {totalPoints > 0 ? (
            <Text style={styles.info}>Vas a cotizar {electricalCountsLabel(counts)}.</Text>
          ) : null}
        </Section>

        {needsTechnical ? (
          <View style={styles.section}>
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ expanded: technicalOpen }}
              onPress={() => setTechnicalOpen((value) => !value)}
              style={styles.collapseHeader}
            >
              <View style={styles.flex}>
                <Text style={styles.sectionTitle}>Ajustes técnicos</Text>
                <Text style={styles.small} numberOfLines={technicalOpen ? undefined : 2}>{technicalSummary}</Text>
              </View>
              <Ionicons name={technicalOpen ? "chevron-up" : "chevron-down"} size={20} color={colors.primary} />
            </Pressable>
            {technicalOpen ? (
              <View style={styles.body}>
                {scope.includeWiring ? (
                  <View style={styles.grid}>
                    <Input label="Recorrido por punto" value={form.averageRouteLength} onChangeText={(v) => update("averageRouteLength", v)} unit="m" />
                    <Input label="Hilos iluminación" value={form.lightingConductors} onChangeText={(v) => update("lightingConductors", v)} unit="hilos" />
                    <Input label="Hilos tomacorrientes" value={form.powerConductors} onChangeText={(v) => update("powerConductors", v)} unit="hilos" />
                    <Input label="Desperdicio" value={form.waste} onChangeText={(v) => update("waste", v)} unit="%" />
                    <Input label="Largo del rollo" value={form.cableRollLength} onChangeText={(v) => update("cableRollLength", v)} unit="m" />
                    <Input label="Largo del tubo" value={form.conduitPieceLength} onChangeText={(v) => update("conduitPieceLength", v)} unit="m" />
                  </View>
                ) : null}
                {scope.includeBreakers ? (
                  <View style={styles.grid}>
                    <Input label="Luces por circuito" value={form.lightingPointsPerCircuit} onChangeText={(v) => update("lightingPointsPerCircuit", v)} unit="puntos" />
                    <Input label="Tomas por circuito" value={form.outletPointsPerCircuit} onChangeText={(v) => update("outletPointsPerCircuit", v)} unit="puntos" />
                  </View>
                ) : null}
                {scope.includeBreakers ? <Text style={styles.small}>Cada punto de 240 V lleva su propio circuito.</Text> : null}
              </View>
            ) : null}
          </View>
        ) : null}

        <Section
          step={3}
          title="Precios"
          description={priceTargets.length
            ? "Toca cada renglón para elegirlo del catálogo o escribir el precio."
            : "Indica las cantidades para ver los precios que necesitas."}
        >
          {priceTargets.map((key) => (
            <PriceRow
              key={key}
              label={PRICE_ROWS[key].label}
              unit={PRICE_ROWS[key].unit}
              hint={PRICE_ROWS[key].hint}
              optional={key === "dedicatedOutlet"}
              selectedName={selected[key]}
              value={form[PRICE_ROWS[key].field]}
              currency={currency}
              open={openRow === key}
              onToggle={() => setOpenRow((current) => (current === key ? null : key))}
              onPick={() => setTarget(key)}
              onChange={(value) => update(PRICE_ROWS[key].field, value)}
            />
          ))}
          {missingPrices > 0 ? (
            <Text style={styles.warning}>
              {missingPrices === 1 ? "Falta 1 precio" : `Faltan ${missingPrices} precios`}: se calculará en cero.
            </Text>
          ) : null}
        </Section>

        {!scope.includeWiring ? null : (
          <Text style={styles.notice}>
            La estimación no incluye luminarias, paneles ni equipos finales. Agrégalos como insumos cuando correspondan.
          </Text>
        )}

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <Pressable onPress={calculate} style={({ pressed }) => [styles.primary, pressed && styles.pressed]}>
          <Text style={styles.primaryText}>Calcular</Text>
        </Pressable>

        {result ? (
          <Results result={result} scope={scope} currency={currency} onAdd={() => void addToBudget()} />
        ) : null}
        {result ? saveButton : null}

        {message ? <Text style={styles.success}>{message}</Text> : null}
      </ScrollView>

      <Picker
        visible={Boolean(target)}
        target={target}
        items={items}
        loading={loading}
        currency={currency}
        onClose={() => setTarget(null)}
        onSelect={choose}
      />
      {priceModal}
    </SafeAreaView>
  );
}

function Section({
  step,
  title,
  description,
  children,
}: {
  step?: number;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        {step ? <View style={styles.step}><Text style={styles.stepText}>{step}</Text></View> : null}
        <View style={styles.flex}>
          <Text style={styles.sectionTitle}>{title}</Text>
          <Text style={styles.small}>{description}</Text>
        </View>
      </View>
      <View style={styles.body}>{children}</View>
    </View>
  );
}

function PresetCard({
  active,
  icon,
  title,
  text,
  onPress,
}: {
  active: boolean;
  icon: React.ComponentProps<typeof Ionicons>["name"];
  title: string;
  text: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected: active }}
      onPress={onPress}
      style={[styles.preset, active && styles.presetActive]}
    >
      <Ionicons name={icon} size={22} color={active ? colors.accent : colors.primary} />
      <Text style={styles.presetTitle}>{title}</Text>
      <Text style={styles.small}>{text}</Text>
    </Pressable>
  );
}

function CountInput({
  icon,
  label,
  value,
  onChange,
}: {
  icon: React.ComponentProps<typeof Ionicons>["name"];
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const current = Math.max(0, Math.round(num(value)));
  return (
    <View style={styles.countBox}>
      <View style={styles.countLabel}>
        <Ionicons name={icon} size={16} color={colors.primary} />
        <Text style={styles.label} numberOfLines={1}>{label}</Text>
      </View>
      <View style={styles.stepper}>
        <Pressable
          accessibilityLabel={`Quitar uno de ${label}`}
          onPress={() => onChange(String(Math.max(0, current - 1)))}
          style={styles.stepButton}
        >
          <Ionicons name="remove" size={18} color={colors.primary} />
        </Pressable>
        <TextInput
          accessibilityLabel={label}
          value={value}
          onChangeText={onChange}
          keyboardType="number-pad"
          inputMode="numeric"
          selectTextOnFocus
          style={styles.countInput}
        />
        <Pressable
          accessibilityLabel={`Agregar uno de ${label}`}
          onPress={() => onChange(String(current + 1))}
          style={styles.stepButton}
        >
          <Ionicons name="add" size={18} color={colors.primary} />
        </Pressable>
      </View>
    </View>
  );
}

function PriceRow({
  label,
  unit,
  hint,
  optional,
  selectedName,
  value,
  currency,
  open,
  onToggle,
  onPick,
  onChange,
}: {
  label: string;
  unit: string;
  hint: string;
  optional?: boolean;
  selectedName?: string;
  value: string;
  currency?: string;
  open: boolean;
  onToggle: () => void;
  onPick: () => void;
  onChange: (value: string) => void;
}) {
  const price = num(value);
  return (
    <View style={[styles.priceRow, open && styles.priceRowOpen]}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={`${label}, ${price > 0 ? formatMoney(price, currency) : "sin precio"}`}
        onPress={onToggle}
        style={styles.priceHeader}
      >
        <View style={styles.flex}>
          <Text style={styles.priceLabel}>{label}</Text>
          <Text style={styles.small} numberOfLines={1}>{selectedName || hint}</Text>
        </View>
        <Text style={[styles.priceValue, price <= 0 && !optional && styles.priceMissing]}>
          {price > 0 ? `${formatMoney(price, currency)} / ${unit}` : optional ? "Opcional" : "Sin precio"}
        </Text>
        <Ionicons name={open ? "chevron-up" : "chevron-down"} size={18} color={colors.textSecondary} />
      </Pressable>
      {open ? (
        <View style={styles.priceBody}>
          <Pressable onPress={onPick} style={styles.catalog}>
            <Ionicons name="pricetags-outline" size={18} color={colors.primary} />
            <Text style={[styles.catalogValue, styles.flex]} numberOfLines={1}>
              {selectedName ? `Del catálogo: ${selectedName}` : "Elegir del catálogo"}
            </Text>
            <Ionicons name="chevron-forward" size={18} color={colors.primary} />
          </Pressable>
          <Input label={`Precio por ${unit}`} value={value} onChangeText={onChange} unit="B/." />
        </View>
      ) : null}
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
  unit: string;
}) {
  return (
    <View style={styles.inputGroup}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.inputBox}>
        <TextInput
          accessibilityLabel={label}
          value={value}
          onChangeText={onChangeText}
          keyboardType="decimal-pad"
          inputMode="decimal"
          placeholder="0.00"
          placeholderTextColor={colors.textMuted}
          style={styles.input}
        />
        <Text style={styles.unit}>{unit}</Text>
      </View>
    </View>
  );
}

const PICKER_KEYWORDS: Record<Target, RegExp> = {
  lightingCable: /thhn|thw|alambre|conductor|cable (electrico|de cobre|#|calibre)/,
  powerCable: /thhn|thw|alambre|conductor|cable (electrico|de cobre|#|calibre)/,
  conduit: /conduit|\bemt\b|tubo electrico|tuberia electrica/,
  box: /caja|octogonal|cuadrada/,
  outlet: /tomacorriente|receptaculo|toma/,
  dedicatedOutlet: /240|tomacorriente|receptaculo/,
  switch: /interruptor|apagador|switch/,
  breaker: /breaker|interruptor termomagnetico|disyuntor/,
  supplies: /cinta aislante|conector (electrico|pvc|emt|de resorte)|grapa|abrazadera|tornillo|wirenut/,
  standardLabor: /electric/,
  dedicatedLabor: /electric/,
};

function Picker({
  visible,
  target,
  items,
  loading,
  currency,
  onClose,
  onSelect,
}: {
  visible: boolean;
  target: Target | null;
  items: CatalogItemWithDetails[];
  loading: boolean;
  currency?: string;
  onClose: () => void;
  onSelect: (item: CatalogItemWithDetails) => void;
}) {
  const laborTarget = target === "standardLabor" || target === "dedicatedLabor";

  const [search, setSearch] = useState("");
  const filtered = useMemo(
    () =>
      target
        ? rankCalculatorCatalogItems(items, laborTarget ? "labor" : "material", PICKER_KEYWORDS[target], search)
        : [],
    [items, target, search, laborTarget],
  );

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet">
      <SafeAreaView style={styles.modal}>
        <View style={styles.modalHeader}>
          <Text style={styles.sectionTitle}>{target ? PRICE_ROWS[target].label : ""}</Text>
          <Pressable onPress={onClose}>
            <Text style={styles.close}>Cerrar</Text>
          </Pressable>
        </View>
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder="Buscar en todo el catálogo"
          placeholderTextColor={colors.textMuted}
          style={styles.search}
        />

        {loading ? (
          <ActivityIndicator size="large" color={colors.primary} />
        ) : (
          <FlatList
            data={filtered}
            ListEmptyComponent={
              <Text style={styles.searchEmpty}>
                No hay conceptos para este campo en el catálogo. Búscalo por otro nombre o escribe el precio manualmente.
              </Text>
            }
            keyExtractor={(item: CatalogItemWithDetails) => item.id}
            renderItem={({ item }: { item: CatalogItemWithDetails }) => (
              <Pressable onPress={() => onSelect(item)} style={styles.item}>
                <Text style={[styles.itemName, styles.flex]}>{item.name}</Text>
                <Text style={styles.price}>
                  {(item.sale_price || item.unit_cost) > 0
                    ? formatMoney(item.sale_price || item.unit_cost, currency)
                    : "Sin precio · agregar"}
                </Text>
              </Pressable>
            )}
          />
        )}
      </SafeAreaView>
    </Modal>
  );
}

function Results({
  result,
  scope,
  currency,
  onAdd,
}: {
  result: ElectricalResult;
  scope: ElectricalScope;
  currency?: string;
  onAdd: () => void;
}) {
  const money = (value: number) => formatMoney(value, currency);
  const line = electricalBudgetLine(result, scope, result);
  const rows: { label: string; detail: string; amount: number; show: boolean }[] = [
    { label: "Tomacorrientes", detail: `${result.outletPoints} und.`, amount: result.outletCost - result.dedicatedOutletCost, show: result.outletPoints > 0 },
    { label: "Tomacorrientes 240 V", detail: `${result.dedicatedPoints} und.`, amount: result.dedicatedOutletCost, show: result.dedicatedPoints > 0 },
    { label: "Interruptores", detail: `${result.switchPoints} und.`, amount: result.switchCost, show: result.switchPoints > 0 },
    { label: "Cable de iluminación", detail: `${formatDecimal(result.lightingCableMeters, 1, currency)} m · ${result.lightingCableRollsToBuy} rollos`, amount: result.lightingCableCost, show: result.lightingCableRollsToBuy > 0 },
    { label: "Cable de tomacorrientes", detail: `${formatDecimal(result.powerCableMeters, 1, currency)} m · ${result.powerCableRollsToBuy} rollos`, amount: result.powerCableCost, show: result.powerCableRollsToBuy > 0 },
    { label: "Tubería", detail: `${formatDecimal(result.conduitMeters, 1, currency)} m · ${result.conduitPieces} tubos`, amount: result.conduitCost, show: result.conduitPieces > 0 },
    { label: "Cajas eléctricas", detail: `${result.boxes} und.`, amount: result.boxCost, show: result.boxes > 0 },
    { label: "Breakers", detail: `${result.totalBreakers} circuitos`, amount: result.breakerCost, show: result.totalBreakers > 0 },
    { label: "Accesorios e insumos", detail: "global", amount: result.suppliesCost, show: scope.includeSupplies },
    { label: "Mano de obra", detail: `${result.standardPoints} puntos`, amount: result.standardLaborCost, show: scope.includeLabor && result.standardPoints > 0 },
    { label: "Mano de obra 240 V", detail: `${result.dedicatedPoints} puntos`, amount: result.dedicatedLaborCost, show: scope.includeLabor && result.dedicatedPoints > 0 },
  ].filter((row) => row.show);

  return (
    <View style={styles.results}>
      <Text style={styles.sectionTitle}>Resultado</Text>
      <Text style={styles.resultLine}>{line.description}</Text>

      <View style={styles.resultTable}>
        {rows.map((row) => (
          <View key={row.label} style={styles.resultRow}>
            <View style={styles.flex}>
              <Text style={styles.resultLabel}>{row.label}</Text>
              <Text style={styles.small}>{row.detail}</Text>
            </View>
            <Text style={styles.resultAmount}>{money(row.amount)}</Text>
          </View>
        ))}
      </View>

      <View style={styles.resultRow}>
        <Text style={[styles.small, styles.flex]}>Materiales</Text>
        <Text style={styles.resultAmount}>{money(result.materialsCost)}</Text>
      </View>
      <View style={styles.resultRow}>
        <Text style={[styles.small, styles.flex]}>Mano de obra</Text>
        <Text style={styles.resultAmount}>{money(result.laborCost)}</Text>
      </View>
      <View style={[styles.resultRow, styles.totalRow]}>
        <Text style={[styles.total, styles.flex]}>Total</Text>
        <Text style={styles.total}>{money(result.totalCost)}</Text>
      </View>
      {line.quantity > 0 ? (
        <Text style={styles.small}>
          En el presupuesto: {line.quantity} {line.unitName} × {money(result.totalCost / line.quantity)}
        </Text>
      ) : null}

      <Pressable onPress={onAdd} style={({ pressed }) => [styles.primary, pressed && styles.pressed]}>
        <Text style={styles.primaryText}>Agregar al presupuesto</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  content: { padding: 20, paddingBottom: 44 },
  flex: { flex: 1, minWidth: 0 },
  pressed: { opacity: 0.8 },
  hero: {
    padding: 18,
    borderRadius: radius.lg,
    backgroundColor: colors.surfaceDark,
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    marginBottom: 18,
  },
  title: { color: colors.textLight, fontSize: 21, fontWeight: "900" },
  subtitle: { color: colors.textLightMuted, fontSize: 13 },
  section: {
    padding: 18,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 16,
  },
  sectionHeader: { flexDirection: "row", alignItems: "center", gap: 12 },
  step: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  stepText: { color: colors.textLight, fontWeight: "900" },
  sectionTitle: { color: colors.text, fontSize: 17, fontWeight: "900" },
  small: { color: colors.textSecondary, fontSize: 12, lineHeight: 17 },
  body: { marginTop: 14, gap: 12 },
  collapseHeader: { flexDirection: "row", alignItems: "center", gap: 12 },
  presets: { flexDirection: "row", gap: 10, flexWrap: "wrap" },
  preset: {
    flex: 1,
    minWidth: 140,
    padding: 14,
    gap: 4,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.surfaceRaised,
  },
  presetActive: { borderColor: colors.accent, backgroundColor: colors.accentSoft },
  presetTitle: { color: colors.text, fontSize: 14, fontWeight: "900", marginTop: 4 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceAlt,
  },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { color: colors.textSecondary, fontSize: 13, fontWeight: "700" },
  chipTextActive: { color: colors.textLight },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  countBox: {
    width: "47%",
    minWidth: 140,
    flexGrow: 1,
    padding: 10,
    gap: 6,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceAlt,
  },
  countLabel: { flexDirection: "row", alignItems: "center", gap: 6 },
  stepper: { flexDirection: "row", alignItems: "center", gap: 6 },
  stepButton: {
    width: 36,
    height: 36,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  countInput: {
    flex: 1,
    minWidth: 0,
    height: 40,
    textAlign: "center",
    fontSize: 18,
    fontWeight: "900",
    color: colors.text,
  },
  inputGroup: { width: "48%", minWidth: 135, flexGrow: 1 },
  label: { color: colors.text, fontSize: 12, fontWeight: "800", marginBottom: 2 },
  inputBox: {
    height: 50,
    paddingHorizontal: 12,
    marginTop: 4,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.border,
    flexDirection: "row",
    alignItems: "center",
  },
  input: { flex: 1, minWidth: 0, height: "100%", color: colors.text },
  unit: { color: colors.textSecondary, fontSize: 11 },
  info: {
    padding: 12,
    backgroundColor: colors.steelSoft,
    color: colors.primary,
    borderRadius: radius.md,
    fontWeight: "700",
  },
  warning: { color: colors.textSecondary, fontSize: 12 },
  notice: {
    padding: 12,
    marginBottom: 16,
    borderRadius: radius.md,
    backgroundColor: colors.warningSoft,
    color: colors.primary,
    fontSize: 12,
    lineHeight: 18,
  },
  priceRow: {
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceRaised,
  },
  priceRowOpen: { borderColor: colors.primary },
  priceHeader: { flexDirection: "row", alignItems: "center", gap: 10, padding: 14 },
  priceLabel: { color: colors.text, fontSize: 14, fontWeight: "800" },
  priceValue: { color: colors.text, fontSize: 13, fontWeight: "900" },
  priceMissing: { color: colors.accent },
  priceBody: { paddingHorizontal: 14, paddingBottom: 14, gap: 10 },
  catalog: {
    minHeight: 48,
    paddingHorizontal: 12,
    gap: 8,
    backgroundColor: colors.steelSoft,
    borderRadius: radius.md,
    flexDirection: "row",
    alignItems: "center",
  },
  catalogValue: { color: colors.primary, fontSize: 13, fontWeight: "700" },
  primary: {
    height: 52,
    borderRadius: radius.md,
    backgroundColor: colors.accent,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  primaryText: { color: colors.textLight, fontWeight: "900", fontSize: 16 },
  error: { color: colors.danger, padding: 12 },
  success: { color: colors.success, padding: 12 },
  results: {
    padding: 18,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 8,
    marginBottom: 16,
  },
  resultLine: { color: colors.text, fontSize: 14, fontWeight: "700", lineHeight: 20 },
  resultTable: { borderTopWidth: 1, borderBottomWidth: 1, borderColor: colors.divider, paddingVertical: 4 },
  resultRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 6 },
  resultLabel: { color: colors.text, fontWeight: "800" },
  resultAmount: { color: colors.text, fontWeight: "800" },
  totalRow: { borderTopWidth: 1, borderColor: colors.divider, marginTop: 4 },
  total: { color: colors.accent, fontSize: 18, fontWeight: "900" },
  modal: { flex: 1, padding: 20, backgroundColor: colors.background },
  modalHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 16 },
  close: { color: colors.primary, fontWeight: "900" },
  item: {
    padding: 15,
    gap: 10,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    marginBottom: 10,
    flexDirection: "row",
    justifyContent: "space-between",
  },
  itemName: { color: colors.text, fontWeight: "800" },
  price: { color: colors.accent, fontWeight: "900" },
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
  searchEmpty: { color: colors.textSecondary, fontSize: 13, padding: 12 },
});
