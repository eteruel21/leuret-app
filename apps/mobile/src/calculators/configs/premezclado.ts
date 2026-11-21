import {
  compactMaterials,
  makeLine,
  material,
  type CalculatorConfig,
  type ResultRow,
  type Values,
} from "@/components/calculators/CalculatorScreen";
import {
  calculateReadyMix,
  type ReadyMixInput,
  type ReadyMixPrices,
  type ReadyMixResult,
} from "@/utils/finishing-calculations";

function inputFrom(v: Values): ReadyMixInput {
  const n = v.n;
  return {
    length: n("length"),
    width: n("width"),
    thickness: n("thickness"),
    extraVolume: n("extraVolume"),
    wastePercentage: n("wastePercentage"),
    orderStep: n("orderStep"),
    truckCapacity: n("truckCapacity"),
    minimumLoad: n("minimumLoad"),
    includePump: Boolean(v.flags.includePump),
  };
}

function pricesFrom(v: Values): ReadyMixPrices {
  const n = v.n;
  return {
    concreteCubicMeter: n("concretePrice"),
    shortLoadFee: n("shortLoadPrice"),
    pumpService: n("pumpPrice"),
    laborCubicMeter: n("laborPrice"),
  };
}

const volumeOf = (v: Values) => calculateReadyMix(inputFrom(v), pricesFrom(v)).netVolume;

export const premezcladoConfig: CalculatorConfig<ReadyMixResult> = {
  id: "ready-mix",
  settingsKey: "calculator.premezclado",
  title: "Concreto premezclado",
  subtitle: "Pedido a la planta: metros cúbicos, camiones, carga corta y bomba.",
  icon: "car-outline",
  calculateLabel: "Calcular pedido",
  defaults: {
    length: "", width: "", thickness: "0.12", extraVolume: "0", wastePercentage: "5",
    orderStep: "0.5", truckCapacity: "7", minimumLoad: "3",
    concretePrice: "", shortLoadPrice: "", pumpPrice: "", laborPrice: "",
  },
  flagDefaults: { includePump: false },
  sections: [
    {
      title: "Qué vas a fundir",
      description: "Losa o piso por medidas, más otros elementos en m³ si los hay.",
      fields: [
        { key: "length", label: "Largo", unit: "m" },
        { key: "width", label: "Ancho", unit: "m" },
        { key: "thickness", label: "Espesor", unit: "m", persist: true },
        { key: "extraVolume", label: "Otros elementos (columnas, vigas…)", unit: "m³" },
      ],
      info: (v) => (volumeOf(v) > 0 ? `Volumen neto: ${volumeOf(v).toFixed(2)} m³.` : null),
    },
    {
      title: "Pedido a la planta",
      description: "Confirma con tu planta el múltiplo de venta, la capacidad del camión y la carga mínima.",
      fields: [
        { key: "wastePercentage", label: "Desperdicio", unit: "%", persist: true },
        { key: "orderStep", label: "Se vende en múltiplos de", unit: "m³", persist: true },
        { key: "truckCapacity", label: "Capacidad del camión", unit: "m³", persist: true },
        { key: "minimumLoad", label: "Carga mínima sin recargo", unit: "m³", persist: true },
      ],
      toggles: [{ key: "includePump", title: "Incluir bomba", subtitle: "Servicio de bombeo para losas o puntos de difícil acceso." }],
    },
  ],
  prices: [
    { key: "concretePrice", label: "Concreto premezclado", unit: "por m³", kind: "material", keywords: /premezclad|concreto/, showWhen: (v) => volumeOf(v) > 0 },
    { key: "shortLoadPrice", label: "Recargo por carga corta", unit: "global", kind: "material", keywords: /carga corta|recargo/ },
    { key: "pumpPrice", label: "Servicio de bomba", unit: "global", kind: "material", keywords: /bomba|bombeo/, showWhen: (v) => Boolean(v.flags.includePump) },
    { key: "laborPrice", label: "Colocación y vibrado", unit: "por m³", kind: "labor", keywords: /colado|vibrado|colocacion/ },
  ],
  validate: (v) => {
    if (volumeOf(v) <= 0) return "Escribe las medidas (largo, ancho y espesor) o el volumen de otros elementos.";
    if (v.n("truckCapacity") <= 0) return "Escribe la capacidad del camión.";
    if (v.n("wastePercentage") > 100) return "El desperdicio debe estar entre 0% y 100%.";
    return null;
  },
  compute: (v) => calculateReadyMix(inputFrom(v), pricesFrom(v)),
  resultRows: (r) => {
    const rows: ResultRow[] = [
      { label: "Volumen neto", value: `${r.netVolume.toFixed(2)} m³` },
      { label: "Pedir a la planta", value: `${r.orderVolume.toFixed(1)} m³`, strong: true },
      { label: "Camiones", value: `${r.trucks} (último con ${r.lastLoad.toFixed(1)} m³)` },
    ];
    if (r.shortLoad) rows.push({ label: "Carga corta", value: "El último camión paga recargo" });
    return rows;
  },
  buildLine: (r, c, v) =>
    makeLine({
      description: "Concreto premezclado colocado",
      unit: "m³",
      quantity: Number(r.netVolume.toFixed(2)),
      total: r.totalCost,
      costTotal: c.totalCost,
      materials: compactMaterials([
        material("Concreto premezclado", Number(r.orderVolume.toFixed(1)), "m³", c.concreteCost),
        material("Recargo por carga corta", r.shortLoad ? 1 : 0, "global", c.shortLoadCost),
        material("Servicio de bomba", v.flags.includePump ? 1 : 0, "global", c.pumpCost),
      ]),
      notes: `${r.orderVolume.toFixed(1)} m³ en ${r.trucks} camiones`,
    }),
};
