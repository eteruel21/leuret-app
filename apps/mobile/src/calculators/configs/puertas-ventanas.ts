import {
  compactMaterials,
  makeLine,
  material,
  type CalculatorConfig,
  type ResultRow,
  type Values,
} from "@/components/calculators/CalculatorScreen";
import {
  calculateOpenings,
  type OpeningsInput,
  type OpeningsPrices,
  type OpeningsResult,
} from "@/utils/openings-calculations";

const hasOpenings = (v: Values) => v.n("doorCount") > 0 || v.n("windowCount") > 0;

function inputFrom(v: Values): OpeningsInput {
  const n = v.n;
  return {
    doorCount: n("doorCount"),
    doorWidth: n("doorWidth"),
    doorHeight: n("doorHeight"),
    windowCount: n("windowCount"),
    windowWidth: n("windowWidth"),
    windowHeight: n("windowHeight"),
    sealantMetersPerCartridge: n("sealantMetersPerCartridge"),
    hingesPerDoor: n("hingesPerDoor"),
    locksPerDoor: n("locksPerDoor"),
    includeGlass: Boolean(v.flags.includeGlass),
    glassWastePercentage: n("glassWastePercentage"),
  };
}

function pricesFrom(v: Values): OpeningsPrices {
  const n = v.n;
  return {
    door: n("doorPrice"),
    window: n("windowPrice"),
    hinge: n("hingePrice"),
    lock: n("lockPrice"),
    glassSquareMeter: n("glassPrice"),
    sealantCartridge: n("sealantPrice"),
    laborDoor: n("laborDoorPrice"),
    laborWindow: n("laborWindowPrice"),
  };
}

export const puertasVentanasConfig: CalculatorConfig<OpeningsResult> = {
  id: "openings",
  settingsKey: "calculator.puertas-ventanas",
  title: "Puertas y ventanas",
  subtitle: "Unidades, herrajes, vidrio, sellador e instalación.",
  icon: "enter-outline",
  calculateLabel: "Calcular puertas y ventanas",
  defaults: {
    doorCount: "", doorWidth: "0.90", doorHeight: "2.10", windowCount: "", windowWidth: "1.20",
    windowHeight: "1.00", sealantMetersPerCartridge: "8", hingesPerDoor: "3", locksPerDoor: "1",
    glassWastePercentage: "10", doorPrice: "", windowPrice: "", hingePrice: "", lockPrice: "",
    glassPrice: "", sealantPrice: "", laborDoorPrice: "", laborWindowPrice: "",
  },
  flagDefaults: { includeGlass: false },
  sections: [
    {
      title: "Puertas",
      fields: [
        { key: "doorCount", label: "Cantidad", unit: "und." },
        { key: "doorWidth", label: "Ancho", unit: "m", persist: true },
        { key: "doorHeight", label: "Alto", unit: "m", persist: true },
        { key: "hingesPerDoor", label: "Bisagras por puerta", unit: "und.", persist: true },
        { key: "locksPerDoor", label: "Cerraduras por puerta", unit: "und.", persist: true },
      ],
    },
    {
      title: "Ventanas",
      description: "Todas las ventanas del mismo tamaño. Para otro tamaño, haz otro cálculo.",
      fields: [
        { key: "windowCount", label: "Cantidad", unit: "und." },
        { key: "windowWidth", label: "Ancho", unit: "m", persist: true },
        { key: "windowHeight", label: "Alto", unit: "m", persist: true },
        { key: "sealantMetersPerCartridge", label: "Metros que rinde un cartucho de sellador", unit: "m", persist: true },
        { key: "glassWastePercentage", label: "Desperdicio de vidrio", unit: "%", persist: true },
      ],
      toggles: [{ key: "includeGlass", title: "Comprar el vidrio por separado", subtitle: "Actívalo si la ventana viene sin vidrio." }],
      info: (v) => {
        if (!hasOpenings(v)) return null;
        const r = calculateOpenings(inputFrom(v), pricesFrom(v));
        return `Área de vanos: ${r.openingsArea.toFixed(2)} m².`;
      },
    },
  ],
  prices: [
    { key: "doorPrice", label: "Puerta con marco", unit: "por unidad", kind: "material", keywords: /puerta/, showWhen: (v) => v.n("doorCount") > 0 },
    { key: "windowPrice", label: "Ventana", unit: "por unidad", kind: "material", keywords: /ventana/, showWhen: (v) => v.n("windowCount") > 0 },
    { key: "hingePrice", label: "Bisagra", unit: "por unidad", kind: "material", keywords: /bisagra.*(puerta|3)/, showWhen: (v) => v.n("doorCount") > 0 },
    { key: "lockPrice", label: "Cerradura", unit: "por unidad", kind: "material", keywords: /cerradura.*(pomo|puerta)|pomo/, showWhen: (v) => v.n("doorCount") > 0 },
    { key: "glassPrice", label: "Vidrio", unit: "por m²", kind: "material", keywords: /vidrio/, showWhen: (v) => Boolean(v.flags.includeGlass) },
    { key: "sealantPrice", label: "Sellador o silicón", unit: "por cartucho", kind: "material", keywords: /silicon|sellador/, showWhen: (v) => v.n("windowCount") > 0 },
    { key: "laborDoorPrice", label: "Instalación de puerta", unit: "por unidad", kind: "labor", keywords: /instalacion.*puerta|puerta/, showWhen: (v) => v.n("doorCount") > 0 },
    { key: "laborWindowPrice", label: "Instalación de ventana", unit: "por unidad", kind: "labor", keywords: /instalacion.*ventana|ventana/, showWhen: (v) => v.n("windowCount") > 0 },
  ],
  validate: (v) => {
    if (!hasOpenings(v)) return "Escribe cuántas puertas o ventanas necesitas.";
    if (v.n("doorCount") > 0 && (v.n("doorWidth") <= 0 || v.n("doorHeight") <= 0)) return "Escribe el ancho y el alto de la puerta.";
    if (v.n("windowCount") > 0 && (v.n("windowWidth") <= 0 || v.n("windowHeight") <= 0)) return "Escribe el ancho y el alto de la ventana.";
    return null;
  },
  compute: (v) => calculateOpenings(inputFrom(v), pricesFrom(v)),
  resultRows: (r) => {
    const rows: ResultRow[] = [{ label: "Área de vanos", value: `${r.openingsArea.toFixed(2)} m²`, strong: true }];
    if (r.doors) rows.push({ label: "Puertas", value: `${r.doors} und. · ${r.hinges} bisagras · ${r.locks} cerraduras` });
    if (r.windows) rows.push({ label: "Ventanas", value: `${r.windows} und. · ${r.sealantCartridges} cartuchos de sellador` });
    if (r.glassArea) rows.push({ label: "Vidrio", value: `${r.glassArea.toFixed(2)} m²` });
    return rows;
  },
  buildLine: (r, c) =>
    makeLine({
      description: "Puertas y ventanas",
      unit: "und.",
      quantity: r.doors + r.windows,
      total: r.totalCost,
      costTotal: c.totalCost,
      materials: compactMaterials([
        material("Puerta con marco", r.doors, "und.", c.doorCost),
        material("Ventana", r.windows, "und.", c.windowCost),
        material("Bisagra", r.hinges, "und.", c.hingeCost),
        material("Cerradura", r.locks, "und.", c.lockCost),
        material("Vidrio", Number(r.glassArea.toFixed(2)), "m²", c.glassCost),
        material("Sellador", r.sealantCartridges, "cartucho", c.sealantCost),
      ]),
      notes: `${r.doors} puertas · ${r.windows} ventanas`,
    }),
};
