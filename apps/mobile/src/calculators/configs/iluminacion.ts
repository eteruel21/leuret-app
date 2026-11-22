import {
  compactMaterials,
  makeLine,
  material,
  type CalculatorConfig,
  type ResultRow,
  type Values,
} from "@/components/calculators/CalculatorScreen";
import {
  calculateLighting,
  suggestedLuminaires,
  type LightingInput,
  type LightingPrices,
  type LightingResult,
} from "@/utils/carpentry-lighting-calculations";

const hasPoints = (v: Values) => v.n("lightPoints") + v.n("switches") + v.n("outlets") > 0;

function inputFrom(v: Values): LightingInput {
  return {
    lightPoints: v.n("lightPoints"),
    switches: v.n("switches"),
    outlets: v.n("outlets"),
    runPerPoint: v.n("runPerPoint"),
    conductorsPerRun: v.n("conductorsPerRun"),
    conduitPieceLength: v.n("conduitPieceLength"),
    conduitFittingsPercentage: v.n("conduitFittingsPercentage"),
    cableWastePercentage: v.n("cableWastePercentage"),
    lightsPerCircuit: v.flags.includeBreakers ? v.n("lightsPerCircuit") : 0,
    outletsPerCircuit: v.flags.includeBreakers ? v.n("outletsPerCircuit") : 0,
    roomArea: v.n("roomArea"),
    luxLevel: Number(v.form.luxLevel) || 0,
    lumensPerLuminaire: v.n("lumensPerLuminaire"),
    utilizationFactor: v.n("utilizationFactor"),
  };
}

function pricesFrom(v: Values): LightingPrices {
  return {
    luminaire: v.n("luminairePrice"),
    switchUnit: v.n("switchPrice"),
    outletUnit: v.n("outletPrice"),
    lightBox: v.n("lightBoxPrice"),
    deviceBox: v.n("deviceBoxPrice"),
    plate: v.n("platePrice"),
    lightingCableMeter: v.n("lightingCablePrice"),
    outletCableMeter: v.n("outletCablePrice"),
    conduitPiece: v.n("conduitPrice"),
    breakerLighting: v.n("breakerLightingPrice"),
    breakerOutlets: v.n("breakerOutletsPrice"),
    laborPoint: v.n("laborPrice"),
  };
}

const breakersOn = (v: Values) => Boolean(v.flags.includeBreakers);

export const iluminacionConfig: CalculatorConfig<LightingResult> = {
  id: "lighting",
  settingsKey: "calculator.iluminacion",
  title: "Iluminación y tomacorrientes",
  subtitle: "Luminarias, interruptores, tomacorrientes, cable, tubo, cajas y circuitos por ambiente.",
  icon: "bulb-outline",
  calculateLabel: "Calcular instalación",
  defaults: {
    lightPoints: "", switches: "", outlets: "", runPerPoint: "6", conductorsPerRun: "3",
    conduitPieceLength: "3.05", conduitFittingsPercentage: "20", cableWastePercentage: "10",
    lightsPerCircuit: "10", outletsPerCircuit: "8", roomArea: "0", luxLevel: "200",
    lumensPerLuminaire: "1200", utilizationFactor: "0.5",
    luminairePrice: "", switchPrice: "", outletPrice: "", lightBoxPrice: "", deviceBoxPrice: "", platePrice: "",
    lightingCablePrice: "", outletCablePrice: "", conduitPrice: "", breakerLightingPrice: "",
    breakerOutletsPrice: "", laborPrice: "",
  },
  flagDefaults: { includeBreakers: true },
  sections: [
    {
      title: "Puntos",
      fields: [
        { key: "lightPoints", label: "Luminarias", unit: "und." },
        { key: "switches", label: "Interruptores", unit: "und." },
        { key: "outlets", label: "Tomacorrientes", unit: "und." },
        { key: "runPerPoint", label: "Recorrido medio por punto", unit: "m", persist: true },
        { key: "conductorsPerRun", label: "Conductores por recorrido", unit: "und.", persist: true },
        { key: "cableWastePercentage", label: "Desperdicio de cable", unit: "%", persist: true },
        { key: "conduitPieceLength", label: "Largo del tubo", unit: "m", persist: true },
        { key: "conduitFittingsPercentage", label: "Conectores y curvas (% del tubo)", unit: "%", persist: true },
      ],
    },
    {
      title: "Cuántas luminarias necesito",
      description: "Sugerencia por iluminancia: área × lux ÷ aprovechamiento ÷ lúmenes de cada luminaria.",
      fields: [
        { key: "roomArea", label: "Área del ambiente", unit: "m²" },
        {
          key: "luxLevel", label: "Ambiente", persist: true,
          options: [
            { value: "100", label: "Pasillo" },
            { value: "150", label: "Dormitorio" },
            { value: "200", label: "Sala" },
            { value: "300", label: "Cocina" },
            { value: "500", label: "Oficina" },
          ],
        },
        { key: "lumensPerLuminaire", label: "Lúmenes por luminaria", unit: "lm", persist: true },
        { key: "utilizationFactor", label: "Aprovechamiento de la luz", persist: true },
      ],
      info: (v) => {
        const n = suggestedLuminaires(inputFrom(v));
        return n ? `Se sugieren ${n} luminarias para ese ambiente.` : null;
      },
    },
    {
      title: "Circuitos",
      fields: [
        { key: "lightsPerCircuit", label: "Luminarias por circuito", unit: "und.", persist: true },
        { key: "outletsPerCircuit", label: "Tomacorrientes por circuito", unit: "und.", persist: true },
      ],
      toggles: [{ key: "includeBreakers", title: "Incluir breakers de los circuitos" }],
    },
  ],
  prices: [
    { key: "luminairePrice", label: "Luminaria", unit: "por unidad", kind: "material", keywords: /luminaria|lampara|bombillo/, showWhen: (v) => v.n("lightPoints") > 0 },
    { key: "switchPrice", label: "Interruptor", unit: "por unidad", kind: "material", keywords: /interruptor sencillo/, showWhen: (v) => v.n("switches") > 0 },
    { key: "outletPrice", label: "Tomacorriente", unit: "por unidad", kind: "material", keywords: /tomacorriente doble/, showWhen: (v) => v.n("outlets") > 0 },
    { key: "lightBoxPrice", label: "Caja octogonal", unit: "por unidad", kind: "material", keywords: /caja octogonal/, showWhen: (v) => v.n("lightPoints") > 0 },
    { key: "deviceBoxPrice", label: "Caja rectangular", unit: "por unidad", kind: "material", keywords: /caja rectangular/, showWhen: (v) => v.n("switches") + v.n("outlets") > 0 },
    { key: "platePrice", label: "Placa de pared", unit: "por unidad", kind: "material", keywords: /placa de pared|placa.*dispositivo/, showWhen: (v) => v.n("switches") + v.n("outlets") > 0 },
    { key: "lightingCablePrice", label: "Cable #14 (luces)", unit: "por metro", kind: "material", keywords: /thhn.*14.*metro|thhn 14/, showWhen: (v) => v.n("lightPoints") + v.n("switches") > 0 },
    { key: "outletCablePrice", label: "Cable #12 (tomacorrientes)", unit: "por metro", kind: "material", keywords: /thhn.*12.*metro|thhn 12/, showWhen: (v) => v.n("outlets") > 0 },
    { key: "conduitPrice", label: "Tubo eléctrico PVC", unit: "por pieza", kind: "material", keywords: /tubo electrico pvc 1\/2|conduit.*1\/2/, showWhen: hasPoints },
    { key: "breakerLightingPrice", label: "Breaker 1 polo 15 A", unit: "por unidad", kind: "material", keywords: /breaker.*1 polo 15/, showWhen: (v) => breakersOn(v) && v.n("lightPoints") > 0 },
    { key: "breakerOutletsPrice", label: "Breaker 1 polo 20 A", unit: "por unidad", kind: "material", keywords: /breaker.*1 polo 20/, showWhen: (v) => breakersOn(v) && v.n("outlets") > 0 },
    { key: "laborPrice", label: "Instalación por salida", unit: "por punto", kind: "labor", keywords: /instalacion electrica por salida|por salida/ },
  ],
  validate: (v) => {
    if (!hasPoints(v)) return "Escribe al menos una luminaria, un interruptor o un tomacorriente.";
    if (v.n("runPerPoint") <= 0) return "Escribe el recorrido medio por punto.";
    if (v.n("conduitPieceLength") <= 0) return "Escribe el largo del tubo.";
    if (breakersOn(v) && (v.n("lightsPerCircuit") <= 0 || v.n("outletsPerCircuit") <= 0)) {
      return "Escribe cuántas luminarias y tomacorrientes lleva cada circuito.";
    }
    return null;
  },
  compute: (v) => {
    const result = calculateLighting(inputFrom(v), pricesFrom(v));
    if (!result.points) throw new Error("Instalación sin puntos");
    return result;
  },
  resultRows: (r) => {
    const rows: ResultRow[] = [
      { label: "Puntos", value: `${r.points}`, strong: true },
      { label: "Tubo", value: `${r.conduitMeters.toFixed(0)} m · ${r.conduitPieces} piezas` },
      { label: "Cable #14", value: `${r.lightingCableMeters.toFixed(0)} m` },
      { label: "Cable #12", value: `${r.outletCableMeters.toFixed(0)} m` },
      { label: "Cajas", value: `${r.lightBoxes} octogonales · ${r.deviceBoxes} rectangulares` },
    ];
    if (r.lightingCircuits + r.outletCircuits) {
      rows.push({ label: "Circuitos", value: `${r.lightingCircuits} de luces · ${r.outletCircuits} de tomacorrientes` });
    }
    return rows;
  },
  buildLine: (r, c, v) =>
    makeLine({
      description: "Iluminación y tomacorrientes",
      unit: "punto",
      quantity: r.points,
      total: r.totalCost,
      costTotal: c.totalCost,
      materials: compactMaterials([
        material("Luminaria", v.n("lightPoints"), "und.", c.luminaireCost),
        material("Interruptor", v.n("switches"), "und.", c.switchCost),
        material("Tomacorriente", v.n("outlets"), "und.", c.outletCost),
        material("Cajas eléctricas", r.lightBoxes + r.deviceBoxes, "und.", c.boxCost),
        material("Placa de pared", r.plates, "und.", c.plateCost),
        material("Cable THHN", Number((r.lightingCableMeters + r.outletCableMeters).toFixed(0)), "m", c.cableCost),
        material("Tubo eléctrico PVC", r.conduitPieces, "pieza", c.conduitCost + c.conduitFittingsCost),
        material("Breakers", r.lightingCircuits + r.outletCircuits, "und.", c.breakerCost),
      ]),
      notes: `${r.points} puntos`,
    }),
};
