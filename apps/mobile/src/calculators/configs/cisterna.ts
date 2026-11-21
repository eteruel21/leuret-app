import {
  compactMaterials,
  makeLine,
  material,
  type CalculatorConfig,
  type ResultRow,
  type Values,
} from "@/components/calculators/CalculatorScreen";
import {
  calculateTank,
  type TankInput,
  type TankPrices,
  type TankResult,
} from "@/utils/reinforced-works-calculations";

import {
  reinforcedDefaults,
  reinforcedFlagDefaults,
  reinforcedMaterialLines,
  reinforcedParamsFrom,
  reinforcedPriceDefs,
  reinforcedPricesFrom,
  reinforcedRows,
  reinforcedSections,
  reinforcedValidate,
} from "./reinforced-shared";

const hasTank = (v: Values) => v.n("innerLength") > 0 && v.n("innerWidth") > 0 && v.n("innerDepth") > 0;

function inputFrom(v: Values): TankInput {
  return {
    ...reinforcedParamsFrom(v),
    innerLength: v.n("innerLength"),
    innerWidth: v.n("innerWidth"),
    innerDepth: v.n("innerDepth"),
    freeboard: v.n("freeboard"),
    wallThickness: v.n("wallThickness"),
    floorThickness: v.n("floorThickness"),
    includeLid: Boolean(v.flags.includeLid),
    lidThickness: v.n("lidThickness"),
    additiveKgPerCubicMeter: v.flags.includeAdditive ? v.n("additiveKgPerCubicMeter") : 0,
  };
}

function pricesFrom(v: Values): TankPrices {
  return {
    ...reinforcedPricesFrom(v),
    additiveKg: v.n("additivePrice"),
    laborWaterproofSquareMeter: v.n("laborWaterproofPrice"),
  };
}

export const cisternaConfig: CalculatorConfig<TankResult> = {
  id: "tank",
  settingsKey: "calculator.cisterna",
  title: "Cisterna",
  subtitle: "Capacidad, concreto, acero, encofrado e impermeabilización de un tanque enterrado.",
  icon: "water-outline",
  calculateLabel: "Calcular cisterna",
  defaults: {
    innerLength: "", innerWidth: "", innerDepth: "", freeboard: "0.30", wallThickness: "0.15",
    floorThickness: "0.15", lidThickness: "0.12", additiveKgPerCubicMeter: "2",
    additivePrice: "", laborWaterproofPrice: "",
    ...reinforcedDefaults("100"),
  },
  flagDefaults: { ...reinforcedFlagDefaults, includeLid: true, includeAdditive: true },
  sections: [
    {
      title: "Medidas interiores",
      description: "Medidas por dentro: la capacidad se cuenta hasta el nivel del agua.",
      fields: [
        { key: "innerLength", label: "Largo interior", unit: "m" },
        { key: "innerWidth", label: "Ancho interior", unit: "m" },
        { key: "innerDepth", label: "Profundidad interior", unit: "m" },
        { key: "freeboard", label: "Altura sin agua bajo la tapa", unit: "m", persist: true },
        { key: "wallThickness", label: "Espesor de paredes", unit: "m", persist: true },
        { key: "floorThickness", label: "Espesor del fondo", unit: "m", persist: true },
        { key: "lidThickness", label: "Espesor de la tapa", unit: "m", persist: true },
      ],
      toggles: [{ key: "includeLid", title: "Incluir tapa de concreto" }],
      info: (v) => {
        if (!hasTank(v)) return null;
        const r = calculateTank(inputFrom(v), pricesFrom(v));
        return r ? `Capacidad: ${Math.round(r.capacityLiters).toLocaleString("es-PA")} litros.` : null;
      },
    },
    {
      title: "Impermeabilización",
      fields: [
        { key: "additiveKgPerCubicMeter", label: "Aditivo por m³ de concreto", unit: "kg", persist: true },
      ],
      toggles: [{ key: "includeAdditive", title: "Aditivo impermeabilizante en el concreto" }],
    },
    ...reinforcedSections(),
  ],
  prices: [
    ...reinforcedPriceDefs(hasTank),
    { key: "additivePrice", label: "Aditivo impermeabilizante", unit: "por kg", kind: "material", keywords: /aditivo/, showWhen: (v) => Boolean(v.flags.includeAdditive) },
    { key: "laborWaterproofPrice", label: "Impermeabilización interior", unit: "por m²", kind: "labor", keywords: /impermeabil/ },
  ],
  validate: (v) => {
    if (!hasTank(v)) return "Escribe el largo, el ancho y la profundidad interiores.";
    if (v.n("wallThickness") <= 0 || v.n("floorThickness") <= 0) return "Escribe el espesor de las paredes y del fondo.";
    if (v.n("freeboard") >= v.n("innerDepth")) return "La altura sin agua debe ser menor que la profundidad.";
    return reinforcedValidate(v);
  },
  compute: (v) => {
    const result = calculateTank(inputFrom(v), pricesFrom(v));
    if (!result) throw new Error("Cisterna sin medidas");
    return result;
  },
  resultRows: (r) => {
    const rows: ResultRow[] = [
      { label: "Capacidad", value: `${Math.round(r.capacityLiters).toLocaleString("es-PA")} litros`, strong: true },
      ...reinforcedRows(r),
      { label: "Área a impermeabilizar", value: `${r.innerArea.toFixed(2)} m²` },
    ];
    if (r.additiveKg) rows.push({ label: "Aditivo impermeabilizante", value: `${r.additiveKg.toFixed(1)} kg` });
    rows.push({ label: "Excavación de referencia", value: `${r.excavationVolume.toFixed(1)} m³` });
    return rows;
  },
  buildLine: (r, c) =>
    makeLine({
      description: `Cisterna de concreto armado de ${Math.round(r.capacityLiters).toLocaleString("es-PA")} litros`,
      unit: "und.",
      quantity: 1,
      total: r.totalCost,
      costTotal: c.totalCost,
      materials: compactMaterials([
        ...reinforcedMaterialLines(r, c),
        material("Aditivo impermeabilizante", Number(r.additiveKg.toFixed(1)), "kg", c.additiveCost),
      ]),
      notes: `${r.volume.toFixed(2)} m³ de concreto · ${r.steelKg.toFixed(0)} kg de acero`,
    }),
};
