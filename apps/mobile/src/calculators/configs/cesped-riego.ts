import {
  compactMaterials,
  makeLine,
  material,
  type CalculatorConfig,
  type ResultRow,
  type Values,
} from "@/components/calculators/CalculatorScreen";
import {
  calculateLawn,
  type LawnInput,
  type LawnPrices,
  type LawnResult,
} from "@/utils/site-works-calculations";

const hasLawn = (v: Values) => v.n("area") > 0;
const isSod = (v: Values) => v.form.grassMode !== "seed";

function inputFrom(v: Values): LawnInput {
  return {
    area: v.n("area"),
    soilThickness: v.n("soilThickness"),
    soilWastePercentage: v.n("soilWastePercentage"),
    grassMode: isSod(v) ? "sod" : "seed",
    grassWastePercentage: v.n("grassWastePercentage"),
    seedKgPerSquareMeter: v.n("seedKgPerSquareMeter"),
    fertilizerKgPerSquareMeter: v.flags.includeFertilizer ? v.n("fertilizerKgPerSquareMeter") : 0,
    fertilizerBagKg: v.n("fertilizerBagKg"),
    includeIrrigation: Boolean(v.flags.includeIrrigation),
    sprinklerRadius: v.n("sprinklerRadius"),
    sprinklerCoverageFactor: v.n("sprinklerCoverageFactor"),
    sprinklersPerZone: v.n("sprinklersPerZone"),
    mainPipeLength: v.n("mainPipeLength"),
    pipePieceLength: v.n("pipePieceLength"),
    pipeFittingsPercentage: v.n("pipeFittingsPercentage"),
  };
}

function pricesFrom(v: Values): LawnPrices {
  return {
    sodSquareMeter: v.n("sodPrice"),
    seedKg: v.n("seedPrice"),
    soilCubicMeter: v.n("soilPrice"),
    fertilizerBag: v.n("fertilizerPrice"),
    sprinkler: v.n("sprinklerPrice"),
    valve: v.n("valvePrice"),
    timer: v.n("timerPrice"),
    pipePiece: v.n("pipePrice"),
    laborSquareMeter: v.n("laborPrice"),
    laborSprinkler: v.n("laborSprinklerPrice"),
  };
}

const irrigationOn = (v: Values) => Boolean(v.flags.includeIrrigation);

export const cespedRiegoConfig: CalculatorConfig<LawnResult> = {
  id: "lawn",
  settingsKey: "calculator.cesped-riego",
  title: "Césped y riego",
  subtitle: "Tierra, grama o semilla, abono y sistema de riego con aspersores por zonas.",
  icon: "leaf-outline",
  calculateLabel: "Calcular césped",
  defaults: {
    area: "", soilThickness: "0.10", soilWastePercentage: "10", grassMode: "sod", grassWastePercentage: "5",
    seedKgPerSquareMeter: "0.03", fertilizerKgPerSquareMeter: "0.05", fertilizerBagKg: "25",
    sprinklerRadius: "4", sprinklerCoverageFactor: "0.6", sprinklersPerZone: "6", mainPipeLength: "0",
    pipePieceLength: "6", pipeFittingsPercentage: "25",
    sodPrice: "", seedPrice: "", soilPrice: "", fertilizerPrice: "", sprinklerPrice: "", valvePrice: "",
    timerPrice: "", pipePrice: "", laborPrice: "", laborSprinklerPrice: "",
  },
  flagDefaults: { includeFertilizer: true, includeIrrigation: false },
  sections: [
    {
      title: "Jardín",
      fields: [
        { key: "area", label: "Área del césped", unit: "m²" },
        { key: "soilThickness", label: "Capa de tierra", unit: "m", persist: true },
        { key: "soilWastePercentage", label: "Desperdicio de tierra", unit: "%", persist: true },
        {
          key: "grassMode", label: "Siembra con", persist: true,
          options: [{ value: "sod", label: "Grama en rollos" }, { value: "seed", label: "Semilla" }],
        },
        { key: "grassWastePercentage", label: "Desperdicio de grama o semilla", unit: "%", persist: true },
        { key: "seedKgPerSquareMeter", label: "Semilla por m²", unit: "kg", persist: true },
      ],
      info: (v) => {
        if (!hasLawn(v)) return null;
        const r = calculateLawn(inputFrom(v), pricesFrom(v));
        return `${r.soilVolume.toFixed(2)} m³ de tierra.`;
      },
    },
    {
      title: "Abono",
      fields: [
        { key: "fertilizerKgPerSquareMeter", label: "Abono por m²", unit: "kg", persist: true },
        { key: "fertilizerBagKg", label: "Peso del saco", unit: "kg", persist: true },
      ],
      toggles: [{ key: "includeFertilizer", title: "Incluir abono" }],
    },
    {
      title: "Riego",
      description: "Cada aspersor cubre un círculo; el factor de cobertura descuenta el traslape entre aspersores.",
      fields: [
        { key: "sprinklerRadius", label: "Alcance del aspersor", unit: "m", persist: true },
        { key: "sprinklerCoverageFactor", label: "Factor de cobertura", persist: true },
        { key: "sprinklersPerZone", label: "Aspersores por zona", unit: "und.", persist: true },
        { key: "mainPipeLength", label: "Tubería principal", unit: "m" },
        { key: "pipePieceLength", label: "Largo de cada tubo", unit: "m", persist: true },
        { key: "pipeFittingsPercentage", label: "Accesorios (% del tubo)", unit: "%", persist: true },
      ],
      toggles: [{ key: "includeIrrigation", title: "Incluir sistema de riego" }],
    },
  ],
  prices: [
    { key: "sodPrice", label: "Grama en rollos", unit: "por m²", kind: "material", keywords: /grama|cesped|tepe/, showWhen: (v) => hasLawn(v) && isSod(v) },
    { key: "seedPrice", label: "Semilla de grama", unit: "por kg", kind: "material", keywords: /semilla/, showWhen: (v) => hasLawn(v) && !isSod(v) },
    { key: "soilPrice", label: "Tierra negra", unit: "por m³", kind: "material", keywords: /tierra negra|tierra/, showWhen: hasLawn },
    { key: "fertilizerPrice", label: "Abono o fertilizante", unit: "por saco", kind: "material", keywords: /abono|fertilizante/, showWhen: (v) => Boolean(v.flags.includeFertilizer) },
    { key: "sprinklerPrice", label: "Aspersor", unit: "por unidad", kind: "material", keywords: /aspersor/, showWhen: irrigationOn },
    { key: "valvePrice", label: "Electroválvula", unit: "por unidad", kind: "material", keywords: /electrovalvula|valvula.*riego/, showWhen: irrigationOn },
    { key: "timerPrice", label: "Temporizador de riego", unit: "por unidad", kind: "material", keywords: /temporizador|programador.*riego/, showWhen: irrigationOn },
    { key: "pipePrice", label: "Tubo PVC de riego", unit: "por tubo", kind: "material", keywords: /tubo pvc presion 1\/2|pvc.*presion/, showWhen: irrigationOn },
    { key: "laborPrice", label: "Siembra de césped", unit: "por m²", kind: "labor", keywords: /cesped|siembra|grama/ },
    { key: "laborSprinklerPrice", label: "Instalación de riego", unit: "por aspersor", kind: "labor", keywords: /instalacion.*(riego|aspersor)|riego/, showWhen: irrigationOn },
  ],
  validate: (v) => {
    if (!hasLawn(v)) return "Escribe el área del césped.";
    if (v.n("soilThickness") <= 0) return "Escribe el espesor de la capa de tierra.";
    if (v.flags.includeFertilizer && v.n("fertilizerBagKg") <= 0) return "Escribe el peso del saco de abono.";
    if (irrigationOn(v) && (v.n("sprinklerRadius") <= 0 || v.n("sprinklersPerZone") <= 0 || v.n("pipePieceLength") <= 0)) {
      return "Revisa el alcance del aspersor, los aspersores por zona y el largo de tubo.";
    }
    return null;
  },
  compute: (v) => {
    const result = calculateLawn(inputFrom(v), pricesFrom(v));
    if (!result.soilVolume) throw new Error("Césped sin tierra");
    return result;
  },
  resultRows: (r) => {
    const rows: ResultRow[] = [{ label: "Tierra", value: `${r.soilVolume.toFixed(2)} m³`, strong: true }];
    if (r.grassArea) rows.push({ label: "Grama en rollos", value: `${r.grassArea.toFixed(1)} m²` });
    if (r.seedKg) rows.push({ label: "Semilla", value: `${r.seedKg.toFixed(1)} kg` });
    if (r.fertilizerBags) rows.push({ label: "Abono", value: `${r.fertilizerBags} sacos` });
    if (r.sprinklers) {
      rows.push({ label: "Aspersores", value: `${r.sprinklers} en ${r.zones} zonas` });
      rows.push({ label: "Tubería de riego", value: `${r.pipeMeters.toFixed(0)} m · ${r.pipePieces} tubos` });
    }
    return rows;
  },
  buildLine: (r, c, v) =>
    makeLine({
      description: r.sprinklers ? "Césped con sistema de riego" : "Siembra de césped",
      unit: "m²",
      quantity: Number(v.n("area").toFixed(2)),
      total: r.totalCost,
      costTotal: c.totalCost,
      materials: compactMaterials([
        material("Tierra negra", Number(r.soilVolume.toFixed(2)), "m³", c.soilCost),
        material("Grama en rollos", Number(r.grassArea.toFixed(1)), "m²", r.grassArea ? c.grassCost : 0),
        material("Semilla de grama", Number(r.seedKg.toFixed(1)), "kg", r.seedKg ? c.grassCost : 0),
        material("Abono", r.fertilizerBags, "saco", c.fertilizerCost),
        material("Aspersor", r.sprinklers, "und.", c.sprinklerCost),
        material("Electroválvula", r.zones, "und.", c.valveCost),
        material("Temporizador de riego", r.zones ? 1 : 0, "und.", c.timerCost),
        material("Tubo PVC de riego", r.pipePieces, "tubo", c.pipeCost + c.pipeFittingsCost),
      ]),
      notes: r.sprinklers ? `${r.sprinklers} aspersores en ${r.zones} zonas` : undefined,
    }),
};
