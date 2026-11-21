import {
  compactMaterials,
  makeLine,
  material,
  type CalculatorConfig,
  type Values,
} from "@/components/calculators/CalculatorScreen";
import {
  calculateEarthwork,
  type EarthworkInput,
  type EarthworkPrices,
  type EarthworkResult,
} from "@/utils/structure-calculations";

const hasDig = (v: Values) => v.n("length") > 0 && v.n("width") > 0 && v.n("depth") > 0;

function inputFrom(v: Values): EarthworkInput {
  const n = v.n;
  return {
    length: n("length"),
    width: n("width"),
    depth: n("depth"),
    structureVolume: n("structureVolume"),
    swellPercentage: n("swellPercentage"),
    compactionPercentage: n("compactionPercentage"),
    reusePercentage: n("reusePercentage"),
    truckCapacity: n("truckCapacity"),
    includeBackfill: Boolean(v.flags.includeBackfill),
  };
}

function pricesFrom(v: Values): EarthworkPrices {
  const n = v.n;
  return {
    excavationCubicMeter: n("excavationPrice"),
    backfillCubicMeter: n("backfillPrice"),
    haulTrip: n("haulPrice"),
    importedFillCubicMeter: n("importedPrice"),
  };
}

export const excavacionConfig: CalculatorConfig<EarthworkResult> = {
  id: "earthwork",
  settingsKey: "calculator.excavacion",
  title: "Excavación y relleno",
  subtitle: "Volumen, material suelto, viajes de volquete y relleno compactado.",
  icon: "layers-outline",
  calculateLabel: "Calcular excavación",
  defaults: {
    length: "", width: "", depth: "", structureVolume: "0", swellPercentage: "25",
    compactionPercentage: "20", reusePercentage: "100", truckCapacity: "8",
    excavationPrice: "", backfillPrice: "", haulPrice: "", importedPrice: "",
  },
  flagDefaults: { includeBackfill: true },
  sections: [
    {
      title: "Medidas de la excavación",
      fields: [
        { key: "length", label: "Largo", unit: "m" },
        { key: "width", label: "Ancho", unit: "m" },
        { key: "depth", label: "Profundidad", unit: "m" },
      ],
      info: (v) =>
        hasDig(v) ? `Volumen en el terreno: ${(v.n("length") * v.n("width") * v.n("depth")).toFixed(2)} m³.` : null,
    },
    {
      title: "Relleno y material",
      description: "El material suelto ocupa más que en el terreno. Ajusta los porcentajes a tu suelo.",
      fields: [
        { key: "structureVolume", label: "Volumen de estructura enterrada (no se rellena)", unit: "m³", persist: true },
        { key: "swellPercentage", label: "Esponjamiento del material excavado", unit: "%", persist: true },
        { key: "compactionPercentage", label: "Material extra para compactar", unit: "%", persist: true },
        { key: "reusePercentage", label: "Material excavado que sirve para rellenar", unit: "%", persist: true },
        { key: "truckCapacity", label: "Capacidad del volquete", unit: "m³", persist: true },
      ],
      toggles: [{ key: "includeBackfill", title: "Incluir relleno compactado" }],
    },
  ],
  prices: [
    { key: "excavationPrice", label: "Excavación", unit: "por m³", kind: "labor", keywords: /excavacion/, showWhen: hasDig },
    { key: "backfillPrice", label: "Relleno y compactación", unit: "por m³", kind: "labor", keywords: /relleno|compactacion/, showWhen: (v) => Boolean(v.flags.includeBackfill) },
    { key: "haulPrice", label: "Viaje de volquete", unit: "por viaje", kind: "labor", keywords: /acarreo|volquete|viaje/ },
    { key: "importedPrice", label: "Material selecto de relleno", unit: "por m³", kind: "material", keywords: /selecto|relleno|tosca|base/ },
  ],
  validate: (v) => {
    if (!hasDig(v)) return "Escribe el largo, el ancho y la profundidad de la excavación.";
    if (v.n("truckCapacity") <= 0) return "Escribe la capacidad del volquete.";
    if (v.n("structureVolume") > v.n("length") * v.n("width") * v.n("depth")) {
      return "La estructura enterrada no puede ser mayor que la excavación.";
    }
    return null;
  },
  compute: (v) => calculateEarthwork(inputFrom(v), pricesFrom(v)),
  resultRows: (r) => {
    const rows = [
      { label: "Volumen en el terreno", value: `${r.bankVolume.toFixed(2)} m³`, strong: true },
      { label: "Material suelto a mover", value: `${r.looseVolume.toFixed(2)} m³` },
      { label: "Viajes para sacar material", value: `${r.tripsOut} viajes` },
    ];
    if (r.backfillCompacted) {
      rows.push({ label: "Relleno compactado", value: `${r.backfillCompacted.toFixed(2)} m³` });
      rows.push({ label: "Material del sitio reutilizado", value: `${r.reusedLoose.toFixed(2)} m³` });
    }
    if (r.importedLoose) {
      rows.push({ label: "Material a traer", value: `${r.importedLoose.toFixed(2)} m³ · ${r.tripsIn} viajes` });
    }
    return rows;
  },
  buildLine: (r, c) =>
    makeLine({
      description: "Excavación y relleno",
      unit: "m³",
      quantity: r.bankVolume,
      total: r.totalCost,
      costTotal: c.totalCost,
      materials: compactMaterials([material("Material selecto de relleno", Number(r.importedLoose.toFixed(2)), "m³", c.importedCost)]),
      notes: `${r.tripsOut} viajes de salida · ${r.tripsIn} de entrada`,
    }),
};
