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
import { usePriceContribution } from "../../components/AddPriceModal";
import { SafeAreaView } from "react-native-safe-area-context";

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
  calculateSpecialSystems,
  type SpecialSystemsResult,
  type SpecialSystemType,
} from "../../services/calculators/sistemas-especiales";
import { formatDecimal, formatMoney } from "../../utils/format";
import { loadLocalData, saveLocalData } from "../../utils/local-storage";
import { useCalculatorBudget } from "@/components/BudgetPickerModal";
import { useSavedCalculation } from "@/components/SaveCalculation";
import type { BudgetLineDraft } from "@/services/budget-service";

type DeviceTarget =
  | "deviceA"
  | "deviceB"
  | "deviceC"
  | "deviceD"
  | "deviceE";

type Target =
  | DeviceTarget
  | "cable"
  | "conduit"
  | "box"
  | "supplies"
  | "installationLabor"
  | "programmingLabor";

type Form = {
  deviceA: string;
  deviceB: string;
  deviceC: string;
  deviceD: string;
  deviceE: string;
  wiredPoints: string;
  averageRouteLength: string;
  cableRunsPerPoint: string;
  waste: string;
  cableRollLength: string;
  conduitPieceLength: string;
  deviceAPrice: string;
  deviceBPrice: string;
  deviceCPrice: string;
  deviceDPrice: string;
  deviceEPrice: string;
  cableRollPrice: string;
  conduitPiecePrice: string;
  boxUnitPrice: string;
  suppliesPrice: string;
  installationLaborPrice: string;
  programmingLaborPrice: string;
};

type Saved = Pick<
  Form,
  | "averageRouteLength"
  | "cableRunsPerPoint"
  | "waste"
  | "cableRollLength"
  | "conduitPieceLength"
  | "cableRollPrice"
  | "conduitPiecePrice"
  | "boxUnitPrice"
  | "suppliesPrice"
  | "installationLaborPrice"
  | "programmingLaborPrice"
> & {
  systemType: SpecialSystemType;
};

type SystemConfig = {
  title: string;
  shortTitle: string;
  description: string;
  icon: React.ComponentProps<typeof Ionicons>["name"];
  equipment: {
    field: DeviceTarget;
    label: string;
  }[];
};

const KEY = "@contractor-pro/special-systems-settings";

const SYSTEMS: Record<SpecialSystemType, SystemConfig> = {
  cctv: {
    title: "Videovigilancia",
    shortTitle: "Cámaras",
    description: "Cámaras, grabación, almacenamiento y alimentación.",
    icon: "videocam-outline",
    equipment: [
      { field: "deviceA", label: "Cámaras" },
      { field: "deviceB", label: "Balunes o conectores" },
      { field: "deviceC", label: "DVR o NVR" },
      { field: "deviceD", label: "Discos duros" },
      { field: "deviceE", label: "Switches PoE o fuentes" },
    ],
  },
  alarm: {
    title: "Alarma de intrusión",
    shortTitle: "Alarmas",
    description: "Sensores, contactos, paneles, sirenas y teclados.",
    icon: "shield-checkmark-outline",
    equipment: [
      { field: "deviceA", label: "Sensores de movimiento" },
      { field: "deviceB", label: "Contactos magnéticos" },
      { field: "deviceC", label: "Paneles de alarma" },
      { field: "deviceD", label: "Sirenas" },
      { field: "deviceE", label: "Teclados" },
    ],
  },
  fire: {
    title: "Detección de incendio",
    shortTitle: "Incendio",
    description: "Detectores, paneles, sirenas y estaciones manuales.",
    icon: "flame-outline",
    equipment: [
      { field: "deviceA", label: "Detectores de humo" },
      { field: "deviceB", label: "Detectores térmicos" },
      { field: "deviceC", label: "Paneles de incendio" },
      { field: "deviceD", label: "Sirenas o estrobos" },
      { field: "deviceE", label: "Estaciones manuales" },
    ],
  },
  access: {
    title: "Control de acceso",
    shortTitle: "Acceso",
    description: "Lectores, cerraduras, controladoras y salidas.",
    icon: "key-outline",
    equipment: [
      { field: "deviceA", label: "Lectores" },
      { field: "deviceB", label: "Cerraduras" },
      { field: "deviceC", label: "Controladoras" },
      { field: "deviceD", label: "Botones de salida" },
      { field: "deviceE", label: "Fuentes de poder" },
    ],
  },
};

const initial: Form = {
  deviceA: "0",
  deviceB: "0",
  deviceC: "0",
  deviceD: "0",
  deviceE: "0",
  wiredPoints: "0",
  averageRouteLength: "20",
  cableRunsPerPoint: "1",
  waste: "10",
  cableRollLength: "305",
  conduitPieceLength: "3",
  deviceAPrice: "",
  deviceBPrice: "",
  deviceCPrice: "",
  deviceDPrice: "",
  deviceEPrice: "",
  cableRollPrice: "",
  conduitPiecePrice: "",
  boxUnitPrice: "",
  suppliesPrice: "",
  installationLaborPrice: "",
  programmingLaborPrice: "",
};

function num(value: string) {
  const parsed = Number(value.replace(",", ".").trim());
  return Number.isFinite(parsed) ? parsed : 0;
}

export default function SpecialSystemsScreen() {
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

  const [systemType, setSystemType] =
    useState<SpecialSystemType>("cctv");
  const [form, setForm] = useState<Form>(initial);
  const [result, setResult] =
    useState<SpecialSystemsResult | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [items, setItems] =
    useState<CatalogItemWithDetails[]>([]);
  const [loading, setLoading] = useState(false);
  const [target, setTarget] = useState<Target | null>(null);
  const [selected, setSelected] =
    useState<Partial<Record<Target, string>>>({});
  const [tracked, setTracked] =
    useState<Partial<Record<keyof Form, TrackedPrice>>>({});

  const config = SYSTEMS[systemType];
  const totalEquipment =
    num(form.deviceA) +
    num(form.deviceB) +
    num(form.deviceC) +
    num(form.deviceD) +
    num(form.deviceE);

  useEffect(() => {
    async function restore() {
      const saved = await loadLocalData<Saved>(KEY);

      if (saved) {
        const { systemType: savedType, ...settings } = saved;
        setSystemType(savedType ?? "cctv");
        setForm((current) => ({
          ...current,
          ...settings,
        }));
      }

      setLoaded(true);
    }

    void restore();
  }, []);

  useEffect(() => {
    if (!loaded) return;

    const saved: Saved = {
      systemType,
      averageRouteLength: form.averageRouteLength,
      cableRunsPerPoint: form.cableRunsPerPoint,
      waste: form.waste,
      cableRollLength: form.cableRollLength,
      conduitPieceLength: form.conduitPieceLength,
      cableRollPrice: form.cableRollPrice,
      conduitPiecePrice: form.conduitPiecePrice,
      boxUnitPrice: form.boxUnitPrice,
      suppliesPrice: form.suppliesPrice,
      installationLaborPrice: form.installationLaborPrice,
      programmingLaborPrice: form.programmingLaborPrice,
    };

    void saveLocalData<Saved>(KEY, saved);
  }, [form, loaded, systemType]);

  useEffect(() => {
    const companyId = activeCompany?.id;
    if (!companyId) return;

    async function loadCatalog(id: string) {
      setLoading(true);
      const response = await listCatalogItems(id);

      if (response.error) {
        Alert.alert(
          "No fue posible cargar el catálogo",
          response.error,
        );
      } else {
        setItems(response.items);
      }

      setLoading(false);
    }

    void loadCatalog(companyId);
  }, [activeCompany]);

  function update(field: keyof Form, value: string) {
    setForm((current) => ({
      ...current,
      [field]: value,
    }));
    setError("");
    setMessage("");
  }

  function changeSystem(nextType: SpecialSystemType) {
    if (nextType === systemType) return;

    setSystemType(nextType);
    setForm((current) => ({
      ...current,
      deviceA: "0",
      deviceB: "0",
      deviceC: "0",
      deviceD: "0",
      deviceE: "0",
      wiredPoints: "0",
      deviceAPrice: "",
      deviceBPrice: "",
      deviceCPrice: "",
      deviceDPrice: "",
      deviceEPrice: "",
    }));
    setSelected({});
    setResult(null);
    setError("");
    setMessage("");
  }

  function choose(item: CatalogItemWithDetails) {
    if (!target) return;

    const fields: Record<Target, keyof Form> = {
      deviceA: "deviceAPrice",
      deviceB: "deviceBPrice",
      deviceC: "deviceCPrice",
      deviceD: "deviceDPrice",
      deviceE: "deviceEPrice",
      cable: "cableRollPrice",
      conduit: "conduitPiecePrice",
      box: "boxUnitPrice",
      supplies: "suppliesPrice",
      installationLabor: "installationLaborPrice",
      programmingLabor: "programmingLaborPrice",
    };

    const field = fields[target];
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

  function compute(source: Form): SpecialSystemsResult | null {
    if (!totalEquipment && !num(source.wiredPoints)) {
      setError("Introduce al menos un equipo o un punto cableado.");
      return null;
    }

    if (
      num(source.wiredPoints) > 0 &&
      (!num(source.averageRouteLength) ||
        !num(source.cableRunsPerPoint) ||
        !num(source.cableRollLength) ||
        !num(source.conduitPieceLength))
    ) {
      setError(
        "Revisa los puntos cableados y las longitudes de instalación.",
      );
      return null;
    }

    return calculateSpecialSystems(
        {
          systemType,
          deviceA: num(source.deviceA),
          deviceB: num(source.deviceB),
          deviceC: num(source.deviceC),
          deviceD: num(source.deviceD),
          deviceE: num(source.deviceE),
          wiredPoints: num(source.wiredPoints),
          averageRouteLength: num(source.averageRouteLength),
          cableRunsPerPoint: num(source.cableRunsPerPoint),
          wastePercentage: num(source.waste),
          cableRollLength: num(source.cableRollLength),
          conduitPieceLength: num(source.conduitPieceLength),
        },
        {
          deviceAUnit: num(source.deviceAPrice),
          deviceBUnit: num(source.deviceBPrice),
          deviceCUnit: num(source.deviceCPrice),
          deviceDUnit: num(source.deviceDPrice),
          deviceEUnit: num(source.deviceEPrice),
          cableRoll: num(source.cableRollPrice),
          conduitPiece: num(source.conduitPiecePrice),
          boxUnit: num(source.boxUnitPrice),
          supplies: num(source.suppliesPrice),
          laborWiredPoint: num(source.installationLaborPrice),
          programming: num(source.programmingLaborPrice),
        },
      );
  }

  function calculate() {
    const next = compute(form);
    if (!next) return;
    setResult(next);

    setError("");
    setMessage("");
  }

  /** Partida del resultado actual: se usa al agregar al presupuesto y al guardar el cálculo. */
  function buildBudgetLine(): BudgetLineDraft | null {
    if (!result) return null;
    const equipmentNotes = config.equipment
      .map(({ field, label }) => ({
        label,
        quantity: result[field],
      }))
      .filter(({ quantity }) => quantity > 0)
      .map(({ label, quantity }) => `${quantity} ${label.toLowerCase()}`)
      .join(" · ");

    const c = (compute(withCatalogCosts(form, tracked)) ?? result);

    // Sin equipos es un trabajo «solo cableado».
    const wiringOnly = result.totalEquipment === 0;

    return {
      itemType: "service",
      description: wiringOnly
        ? `Cableado de ${config.title.toLowerCase()} (${result.wiredPoints} puntos)`
        : `Instalación de ${config.title.toLowerCase()}`,
      unitName: "sistema",
      quantity: 1,
      unitCost: budgetUnitCost(
        c.totalCost,
        1,
        result.totalCost,
      ),
      unitPrice: result.totalCost,
      taxable: true,
      materials: compactMaterials([
        ...config.equipment.map(({ field, label }) =>
          material(
            label,
            c[field],
            "und.",
            Number((c as unknown as Record<string, unknown>)[`${field}Cost`] ?? 0),
          ),
        ),
        material("Cable", c.cableRollsToBuy, "rollo", c.cableCost),
        material("Tubo conduit", c.conduitPieces, "und.", c.conduitCost),
        material("Caja", c.boxes, "und.", c.boxCost),
      ]),
      notes: [
        equipmentNotes,
        result.wiredPoints
          ? `${result.wiredPoints} puntos cableados` +
            ` · ${result.cableRollsToBuy} rollos de cable` +
            ` · ${result.conduitPieces} tubos`
          : "",
      ]
        .filter(Boolean)
        .join(" · "),
    };
  }

  const { saveButton, saveModal } = useSavedCalculation({
    formulaCode: "special-systems",
    ready: loaded,
    snapshot: () => ({ systemType, form, selected, tracked }),
    restore: (saved) => {
      if (saved.systemType !== undefined) setSystemType(saved.systemType);
      if (saved.form) setForm((current) => ({ ...current, ...saved.form }));
      if (saved.selected !== undefined) setSelected(saved.selected);
      if (saved.tracked !== undefined) setTracked(saved.tracked);
    },
    onRestored: () => calculate(),
    buildLine: buildBudgetLine,
    totalCost: result?.totalCost,
  });

  async function addToBudget(chosenBudgetId?: unknown) {
    if (!result) return;

    if (!activeCompany) return;

    const targetBudgetId =
      typeof chosenBudgetId === "string" ? chosenBudgetId : budgetId;

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
      Alert.alert(
        "No fue posible agregar la partida",
        response.error,
      );
    } else {
      setMessage("La partida fue guardada en el presupuesto.");
    }
  }

  const equipmentFields: [keyof Form, string, string][] = config.equipment.map(({ field, label }) => [
    field,
    label,
    "und.",
  ]);

  const routeFields: [keyof Form, string, string][] = [
    ["wiredPoints", "Puntos cableados", "puntos"],
    ["averageRouteLength", "Recorrido promedio", "m/punto"],
    ["cableRunsPerPoint", "Cables por punto", "cables"],
    ["waste", "Desperdicio", "%"],
    ["cableRollLength", "Longitud del rollo", "m"],
    ["conduitPieceLength", "Longitud de tubería", "m/pza."],
  ];

  const priceFields: [keyof Form, string, string][] = config.equipment.map(({ field, label }) => {
    const priceField = `${field}Price` as keyof Form;
    return [priceField, label, "B/."];
  });

  return (
    <SafeAreaView
      style={styles.safe}
      edges={["left", "right", "bottom"]}
    >
      {budgetPicker}
      {saveModal}
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.hero}>
          <Ionicons
            name="hardware-chip-outline"
            size={30}
            color={colors.textLight}
          />

          <View style={styles.flex}>
            <Text style={styles.title}>Sistemas especiales</Text>
            <Text style={styles.subtitle}>
              Equipos, cableado, canalización y programación.
            </Text>
          </View>
        </View>

        <Section
          title="Tipo de sistema"
          description="Selecciona el trabajo que deseas calcular."
        >
          <View style={styles.systemGrid}>
            {(Object.keys(SYSTEMS) as SpecialSystemType[]).map(
              (type) => {
                const option = SYSTEMS[type];
                const active = type === systemType;

                return (
                  <Pressable
                    key={type}
                    onPress={() => changeSystem(type)}
                    style={({ pressed }: { pressed: boolean }) => [
                      styles.systemOption,
                      active && styles.systemOptionActive,
                      pressed && styles.pressed,
                    ]}
                  >
                    <Ionicons
                      name={option.icon}
                      size={21}
                      color={
                        active
                          ? colors.textLight
                          : colors.primary
                      }
                    />
                    <Text
                      style={[
                        styles.systemOptionText,
                        active && styles.systemOptionTextActive,
                      ]}
                    >
                      {option.shortTitle}
                    </Text>
                  </Pressable>
                );
              },
            )}
          </View>

          <Text style={styles.info}>{config.description}</Text>
        </Section>

        <Section
          title={`Equipos de ${config.title}`}
          description="Indica la cantidad de cada equipo o dispositivo."
        >
          <Grid
            fields={equipmentFields}
            form={form}
            update={update}
          />
          <Text style={styles.info}>
            Total de equipos: {formatDecimal(totalEquipment, 0, currency)}
          </Text>
        </Section>

        <Section
          title="Cableado y canalización"
          description="Los puntos cableados pueden ser distintos al total de equipos."
        >
          <Grid
            fields={routeFields}
            form={form}
            update={update}
          />
        </Section>

        <Section
          title="Precios"
          description="Puedes tomarlos del catálogo de tu empresa."
        >
          {config.equipment.map(({ field, label }) => (
            <CatalogButton
              key={field}
              label={label}
              value={selected[field]}
              onPress={() => setTarget(field)}
            />
          ))}

          <CatalogButton
            label="Cable por rollo"
            value={selected.cable}
            onPress={() => setTarget("cable")}
          />
          <CatalogButton
            label="Tubería por pieza"
            value={selected.conduit}
            onPress={() => setTarget("conduit")}
          />
          <CatalogButton
            label="Caja o registro"
            value={selected.box}
            onPress={() => setTarget("box")}
          />
          <CatalogButton
            label="Accesorios e insumos"
            value={selected.supplies}
            onPress={() => setTarget("supplies")}
          />
          <CatalogButton
            label="Instalación por punto"
            value={selected.installationLabor}
            onPress={() => setTarget("installationLabor")}
          />
          <CatalogButton
            label="Programación y puesta en marcha"
            value={selected.programmingLabor}
            onPress={() => setTarget("programmingLabor")}
          />

          <View style={styles.grid}>
            {priceFields.map(([field, label, unit]) => (
              <Input
                key={field}
                label={label}
                value={form[field]}
                onChangeText={(value) => update(field, value)}
                unit={unit}
              />
            ))}

            <Input
              label="Cable por rollo"
              value={form.cableRollPrice}
              onChangeText={(value) =>
                update("cableRollPrice", value)}
              unit="B/."
            />
            <Input
              label="Tubería por pieza"
              value={form.conduitPiecePrice}
              onChangeText={(value) =>
                update("conduitPiecePrice", value)}
              unit="B/."
            />
            <Input
              label="Caja o registro"
              value={form.boxUnitPrice}
              onChangeText={(value) =>
                update("boxUnitPrice", value)}
              unit="B/."
            />
            <Input
              label="Accesorios e insumos"
              value={form.suppliesPrice}
              onChangeText={(value) =>
                update("suppliesPrice", value)}
              unit="B/."
            />
            <Input
              label="Instalación por punto"
              value={form.installationLaborPrice}
              onChangeText={(value) =>
                update("installationLaborPrice", value)}
              unit="B/."
            />
            <Input
              label="Programación"
              value={form.programmingLaborPrice}
              onChangeText={(value) =>
                update("programmingLaborPrice", value)}
              unit="B/."
            />
          </View>
        </Section>

        <Text style={styles.notice}>
          La cantidad de puntos cableados debe representar las rutas reales,
          no necesariamente la suma de todos los equipos del sistema.
        </Text>

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <Pressable onPress={calculate} style={styles.primary}>
          <Text style={styles.primaryText}>
            Calcular {config.shortTitle.toLowerCase()}
          </Text>
        </Pressable>

        {result ? (
          <Results
            result={result}
            config={config}
            currency={currency}
            onAdd={addToBudget}
          />
        ) : null}
        {result ? saveButton : null}

        {message ? (
          <Text style={styles.success}>{message}</Text>
        ) : null}
      </ScrollView>

      <Picker
        visible={Boolean(target)}
        target={target}
        systemType={systemType}
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
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <Text style={styles.small}>{description}</Text>
      <View style={styles.body}>{children}</View>
    </View>
  );
}

function Grid({
  fields,
  form,
  update,
}: {
  fields: [keyof Form, string, string][];
  form: Form;
  update: (field: keyof Form, value: string) => void;
}) {
  return (
    <View style={styles.grid}>
      {fields.map(([field, label, unit]) => (
        <Input
          key={field}
          label={label}
          value={form[field]}
          onChangeText={(value) => update(field, value)}
          unit={unit}
        />
      ))}
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
          value={value}
          onChangeText={onChangeText}
          keyboardType="decimal-pad"
          inputMode="decimal"
          placeholder="0.00"
          style={styles.input}
        />
        <Text style={styles.unit}>{unit}</Text>
      </View>
    </View>
  );
}

function CatalogButton({
  label,
  value,
  onPress,
}: {
  label: string;
  value?: string;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={styles.catalog}>
      <View style={styles.flex}>
        <Text style={styles.label}>{label}</Text>
        <Text style={styles.catalogValue}>
          {value || "Seleccionar del catálogo"}
        </Text>
      </View>
      <Ionicons
        name="chevron-forward"
        size={20}
        color={colors.primary}
      />
    </Pressable>
  );
}


/**
 * Palabras clave de cada equipo según el sistema. El selector solo muestra los
 * conceptos que coinciden; así las cámaras no se mezclan con cemento o arena.
 * Escribir en el buscador sigue recorriendo todo el catálogo.
 */
const DEVICE_KEYWORDS: Record<SpecialSystemType, Record<DeviceTarget, RegExp>> = {
  cctv: {
    deviceA: /^camara|camara (ip|analogica|domo|bala|bullet|ptz|wifi|turret)/,
    deviceB: /balun|transceptor|conector (bnc|rj45)/,
    deviceC: /\bdvr\b|\bnvr\b|grabador/,
    deviceD: /disco duro|\bhdd\b/,
    deviceE: /switch|fuente|adaptador de corriente|inyector poe/,
  },
  alarm: {
    deviceA: /detector de movimiento|\bpir\b/,
    deviceB: /contacto magnetico/,
    deviceC: /panel de alarma|kit de alarma/,
    deviceD: /sirena(?!.*incendio)/,
    deviceE: /teclado/,
  },
  fire: {
    deviceA: /detector de humo/,
    deviceB: /detector termico|detector de calor|detector de temperatura/,
    deviceC: /panel de incendio|central de incendio/,
    deviceD: /estrobo|sirena.*incendio/,
    deviceE: /estacion manual/,
  },
  access: {
    deviceA: /lector|terminal de (control de )?acceso|biometric/,
    deviceB: /cerradura|electroiman|chapa magnetica/,
    deviceC: /controladora|controlador de acceso/,
    deviceD: /boton de salida/,
    deviceE: /fuente/,
  },
};

const ACCESSORY_KEYWORDS: Record<Exclude<Target, DeviceTarget>, RegExp> = {
  cable: /cable (utp|coaxial|siames|de alarma|thhn)|\butp\b/,
  conduit: /conduit|\bemt\b|tubo electrico|canaleta/,
  box: /caja (cuadrada|octagonal|rectangular|de registro|de paso)|registro/,
  supplies: /conector|rj45|cinta aislante|grapa|soporte|amarra/,
  installationLabor: /electric|tecnico|instalador/,
  programmingLabor: /program|tecnico|configur/,
};

function pickerKeywords(systemType: SpecialSystemType, target: Target): RegExp {
  return target in DEVICE_KEYWORDS[systemType]
    ? DEVICE_KEYWORDS[systemType][target as DeviceTarget]
    : ACCESSORY_KEYWORDS[target as Exclude<Target, DeviceTarget>];
}

function Picker({
  visible,
  target,
  systemType,
  items,
  loading,
  currency,
  onClose,
  onSelect,
}: {
  visible: boolean;
  target: Target | null;
  systemType: SpecialSystemType;
  items: CatalogItemWithDetails[];
  loading: boolean;
  currency?: string;
  onClose: () => void;
  onSelect: (item: CatalogItemWithDetails) => void;
}) {
  const laborTarget =
    target === "installationLabor" ||
    target === "programmingLabor";

  const [search, setSearch] = useState("");
  const filtered = useMemo(
    () =>
      target
        ? rankCalculatorCatalogItems(
            items,
            laborTarget ? "labor" : "material",
            pickerKeywords(systemType, target),
            search,
          )
        : [],
    [items, target, search, systemType, laborTarget],
  );

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
    >
      <SafeAreaView style={styles.modal}>
        <Pressable onPress={onClose}>
          <Text style={styles.close}>Cerrar</Text>
        </Pressable>
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder="Buscar en todo el catálogo"
          style={styles.search}
        />
        {!search ? (
          <Text style={styles.searchHint}>
            Solo se muestran conceptos de este campo. Escribe para buscar en todo el catálogo.
          </Text>
        ) : null}

        {loading ? (
          <ActivityIndicator
            size="large"
            color={colors.primary}
          />
        ) : (
          <FlatList
            data={filtered}
            ListEmptyComponent={
              <Text style={styles.searchEmpty}>
                {search
                  ? "No hay conceptos que coincidan con la búsqueda."
                  : "Tu catálogo aún no tiene conceptos para este campo. Búscalo por otro nombre o escribe el precio manualmente."}
              </Text>
            }
            keyExtractor={(item: CatalogItemWithDetails) => item.id}
            renderItem={({
              item,
            }: {
              item: CatalogItemWithDetails;
            }) => (
              <Pressable
                onPress={() => onSelect(item)}
                style={styles.item}
              >
                <View style={styles.flex}>
                  <Text style={styles.itemName}>{item.name}</Text>
                  {item.category?.name ? (
                    <Text style={styles.itemMeta}>{item.category.name}</Text>
                  ) : null}
                </View>
                <Text style={styles.price}>
                  {((item.sale_price || item.unit_cost) > 0 ? formatMoney(item.sale_price || item.unit_cost, currency) : "Sin precio · agregar")}
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
  config,
  currency,
  onAdd,
}: {
  result: SpecialSystemsResult;
  config: SystemConfig;
  currency?: string;
  onAdd: () => void;
}) {
  const money = (value: number) => formatMoney(value, currency);

  return (
    <View style={styles.results}>
      <Text style={styles.sectionTitle}>Resultado</Text>

      {config.equipment.map(({ field, label }) => (
        result[field] > 0 ? (
          <Text key={field}>
            {label}: {result[field]}
          </Text>
        ) : null
      ))}

      <Text>Equipos totales: {result.totalEquipment}</Text>
      {result.totalEquipment === 0 ? (
        <Text>
          Trabajo solo de cableado: no incluye equipos ni programación.
        </Text>
      ) : null}
      <Text>Puntos cableados: {result.wiredPoints}</Text>
      <Text>
        Cable: {formatDecimal(result.cableMeters, 2, currency)} m ·
        Comprar {result.cableRollsToBuy} rollos
      </Text>
      <Text>
        Tubería: {formatDecimal(result.conduitMeters, 2, currency)} m ·
        Comprar {result.conduitPieces} piezas
      </Text>
      <Text>Cajas o registros: {result.boxes}</Text>
      <Text>Materiales: {money(result.materialsCost)}</Text>
      <Text>Mano de obra: {money(result.laborCost)}</Text>
      <Text style={styles.total}>
        Total: {money(result.totalCost)}
      </Text>

      <Pressable onPress={onAdd} style={styles.primary}>
        <Text style={styles.primaryText}>
          Agregar al presupuesto
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    padding: 20,
    paddingBottom: 44,
  },
  flex: {
    flex: 1,
  },
  hero: {
    padding: 18,
    borderRadius: radius.lg,
    backgroundColor: colors.surfaceDark,
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    marginBottom: 18,
  },
  title: {
    color: colors.textLight,
    fontSize: 21,
    fontWeight: "900",
  },
  subtitle: {
    color: colors.textLightMuted,
    fontSize: 13,
  },
  section: {
    padding: 18,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 16,
  },
  sectionTitle: {
    color: colors.text,
    fontSize: 17,
    fontWeight: "900",
  },
  small: {
    color: colors.textSecondary,
    fontSize: 12,
  },
  body: {
    marginTop: 14,
    gap: 12,
  },
  systemGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  systemOption: {
    width: "48%",
    minWidth: 130,
    flexGrow: 1,
    minHeight: 54,
    paddingHorizontal: 12,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceAlt,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  systemOptionActive: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  systemOptionText: {
    color: colors.text,
    fontSize: 12,
    fontWeight: "800",
  },
  systemOptionTextActive: {
    color: colors.textLight,
  },
  pressed: {
    opacity: 0.78,
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
  },
  inputGroup: {
    width: "48%",
    minWidth: 135,
    flexGrow: 1,
  },
  label: {
    color: colors.text,
    fontSize: 12,
    fontWeight: "800",
    marginBottom: 6,
  },
  inputBox: {
    height: 50,
    paddingHorizontal: 12,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.border,
    flexDirection: "row",
    alignItems: "center",
  },
  input: {
    flex: 1,
    height: "100%",
    color: colors.text,
  },
  unit: {
    color: colors.textSecondary,
    fontSize: 11,
  },
  info: {
    padding: 12,
    backgroundColor: colors.steelSoft,
    color: colors.primary,
    borderRadius: radius.md,
  },
  notice: {
    padding: 12,
    marginBottom: 16,
    borderRadius: radius.md,
    backgroundColor: colors.sandSoft,
    color: colors.primary,
    fontSize: 12,
    lineHeight: 18,
  },
  catalog: {
    minHeight: 58,
    padding: 14,
    backgroundColor: colors.steelSoft,
    borderRadius: radius.md,
    flexDirection: "row",
    alignItems: "center",
  },
  catalogValue: {
    color: colors.accent,
    fontSize: 12,
  },
  primary: {
    height: 52,
    borderRadius: radius.md,
    backgroundColor: colors.accent,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  primaryText: {
    color: colors.textLight,
    fontWeight: "900",
  },
  error: {
    color: colors.danger,
    padding: 12,
  },
  success: {
    color: colors.success,
    padding: 12,
  },
  results: {
    padding: 18,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    gap: 8,
    marginBottom: 16,
  },
  total: {
    color: colors.accent,
    fontSize: 18,
    fontWeight: "900",
    marginVertical: 8,
  },
  modal: {
    flex: 1,
    padding: 20,
    backgroundColor: colors.background,
  },
  close: {
    color: colors.primary,
    fontWeight: "900",
    marginBottom: 16,
  },
  item: {
    padding: 15,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    marginBottom: 10,
    flexDirection: "row",
    justifyContent: "space-between",
  },
  itemName: {
    color: colors.text,
    fontWeight: "800",
  },
  itemMeta: {
    color: colors.textSecondary,
    fontSize: 12,
    marginTop: 3,
  },
  searchHint: {
    color: colors.textSecondary,
    fontSize: 12,
    marginBottom: 10,
  },
  price: {
    color: colors.accent,
    fontWeight: "900",
    marginLeft: 12,
  },
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
  searchEmpty: {
    color: colors.textSecondary,
    fontSize: 13,
    padding: 12,
  },
});
