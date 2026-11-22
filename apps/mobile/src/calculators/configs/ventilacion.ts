import {
  compactMaterials,
  makeLine,
  material,
  type CalculatorConfig,
  type ResultRow,
  type Values,
} from "@/components/calculators/CalculatorScreen";
import {
  calculateVentilation,
  type VentilationInput,
  type VentilationPrices,
  type VentilationResult,
} from "@/utils/hvac-solar-calculations";

const hasRoom = (v: Values) => v.n("area") > 0 && v.n("rooms") > 0;

function inputFrom(v: Values): VentilationInput {
  return {
    rooms: v.n("rooms"),
    area: v.n("area"),
    height: v.n("height"),
    airChangesPerHour: v.n("airChangesPerHour"),
    fanFlow: v.n("fanFlow"),
    ductMeters: v.n("ductMeters"),
    ductPieceLength: v.n("ductPieceLength"),
    grillesPerFan: v.n("grillesPerFan"),
    cableRun: v.n("cableRun"),
    runWastePercentage: v.n("runWastePercentage"),
  };
}

function pricesFrom(v: Values): VentilationPrices {
  return {
    fan: v.n("fanPrice"),
    ductPiece: v.n("ductPrice"),
    grille: v.n("grillePrice"),
    cableMeter: v.n("cablePrice"),
    laborFan: v.n("laborFanPrice"),
  };
}

export const ventilacionConfig: CalculatorConfig<VentilationResult> = {
  id: "ventilation",
  settingsKey: "calculator.ventilacion",
  title: "Ventilación y extracción",
  subtitle: "Extractores según el caudal que pide el ambiente, ductos, rejillas y cable.",
  icon: "aperture-outline",
  calculateLabel: "Calcular ventilación",
  defaults: {
    rooms: "1", area: "", height: "2.5", airChangesPerHour: "8", fanFlow: "150", ductMeters: "3",
    ductPieceLength: "3", grillesPerFan: "1", cableRun: "8", runWastePercentage: "10",
    fanPrice: "", ductPrice: "", grillePrice: "", cablePrice: "", laborFanPrice: "",
  },
  sections: [
    {
      title: "Ambiente",
      description:
        "Cambios de aire por hora típicos: baños 8 a 12, cocinas 10 a 15, cuartos de máquinas o talleres 10 a 20.",
      fields: [
        { key: "rooms", label: "Ambientes iguales", unit: "und." },
        { key: "area", label: "Área del ambiente", unit: "m²" },
        { key: "height", label: "Altura del cielo", unit: "m", persist: true },
        { key: "airChangesPerHour", label: "Cambios de aire por hora", unit: "veces", persist: true },
      ],
      info: (v) => {
        if (!hasRoom(v) || v.n("airChangesPerHour") <= 0) return null;
        const r = calculateVentilation(inputFrom(v), pricesFrom(v));
        return r.requiredFlow ? `Caudal requerido: ${Math.round(r.requiredFlow)} m³/h por ambiente.` : null;
      },
    },
    {
      title: "Extractores e instalación",
      fields: [
        { key: "fanFlow", label: "Caudal de cada extractor", unit: "m³/h", persist: true },
        { key: "ductMeters", label: "Ducto por extractor", unit: "m", persist: true },
        { key: "ductPieceLength", label: "Largo de cada ducto", unit: "m", persist: true },
        { key: "grillesPerFan", label: "Rejillas por extractor", unit: "und.", persist: true },
        { key: "cableRun", label: "Cable hasta el interruptor", unit: "m", persist: true },
        { key: "runWastePercentage", label: "Desperdicio de cable", unit: "%", persist: true },
      ],
    },
  ],
  prices: [
    { key: "fanPrice", label: "Extractor de aire", unit: "por unidad", kind: "material", keywords: /extractor/ },
    { key: "ductPrice", label: "Ducto flexible", unit: "por tramo", kind: "material", keywords: /ducto/ },
    { key: "grillePrice", label: "Rejilla o tapa exterior", unit: "por unidad", kind: "material", keywords: /rejilla.*(ventilacion|extractor)|rejilla/ },
    { key: "cablePrice", label: "Cable THHN #14", unit: "por m", kind: "material", keywords: /thhn 14|thhn-14/ },
    { key: "laborFanPrice", label: "Instalación de extractor", unit: "por unidad", kind: "labor", keywords: /instalacion.*extractor|extractor/ },
  ],
  validate: (v) => {
    if (v.n("rooms") <= 0) return "Escribe cuántos ambientes son.";
    if (v.n("area") <= 0) return "Escribe el área del ambiente.";
    if (v.n("height") <= 0) return "Escribe la altura del cielo.";
    if (v.n("airChangesPerHour") <= 0) return "Escribe los cambios de aire por hora.";
    if (v.n("fanFlow") <= 0) return "Escribe el caudal de cada extractor.";
    return null;
  },
  compute: (v) => {
    const result = calculateVentilation(inputFrom(v), pricesFrom(v));
    if (!result.fans) throw new Error("Ventilación sin extractores");
    return result;
  },
  resultRows: (r) => {
    const rows: ResultRow[] = [
      { label: "Volumen del ambiente", value: `${r.volume.toFixed(1)} m³` },
      { label: "Caudal requerido", value: `${Math.round(r.requiredFlow)} m³/h por ambiente` },
      { label: "Extractores", value: `${r.fans} (${r.fansPerRoom} por ambiente)`, strong: true },
      { label: "Ductos", value: `${r.ductPieces} tramos` },
      { label: "Rejillas", value: `${r.grilles} und.` },
      { label: "Cable #14", value: `${r.cableMeters} m` },
    ];
    return rows;
  },
  buildLine: (r, c) =>
    makeLine({
      description: "Ventilación con extractores",
      unit: "extractor",
      quantity: r.fans,
      total: r.totalCost,
      costTotal: c.totalCost,
      materials: compactMaterials([
        material("Extractor de aire", r.fans, "und.", c.fanCost),
        material("Ducto flexible", r.ductPieces, "tramo", c.ductCost),
        material("Rejilla o tapa exterior", r.grilles, "und.", c.grilleCost),
        material("Cable THHN #14", r.cableMeters, "m", c.cableCost),
      ]),
      notes: `${Math.round(r.requiredFlow)} m³/h por ambiente`,
    }),
};
