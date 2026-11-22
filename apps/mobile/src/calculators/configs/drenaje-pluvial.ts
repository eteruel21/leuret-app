import {
  compactMaterials,
  makeLine,
  material,
  type CalculatorConfig,
  type ResultRow,
  type Values,
} from "@/components/calculators/CalculatorScreen";
import {
  calculateStormDrainage,
  type StormDrainageInput,
  type StormDrainagePrices,
  type StormDrainageResult,
} from "@/utils/site-works-calculations";

const hasWork = (v: Values) =>
  v.n("gutterLength") > 0 || v.n("downspoutCount") > 0 || v.n("pipeLength") > 0 || v.n("inspectionBoxes") > 0;

function inputFrom(v: Values): StormDrainageInput {
  const gutters = Boolean(v.flags.includeGutters);
  const buried = Boolean(v.flags.includeBuriedPipe);
  return {
    roofArea: v.n("roofArea"),
    gutterLength: gutters ? v.n("gutterLength") : 0,
    gutterPieceLength: v.n("gutterPieceLength"),
    hangerSpacing: v.n("hangerSpacing"),
    gutterAccessories: gutters ? v.n("gutterAccessories") : 0,
    downspoutCount: gutters ? v.n("downspoutCount") : 0,
    downspoutHeight: v.n("downspoutHeight"),
    downspoutPieceLength: v.n("downspoutPieceLength"),
    downspoutFittingsPerUnit: v.n("downspoutFittingsPerUnit"),
    pipeLength: buried ? v.n("pipeLength") : 0,
    pipePieceLength: v.n("pipePieceLength"),
    pipeFittingsPercentage: v.n("pipeFittingsPercentage"),
    trenchWidth: v.n("trenchWidth"),
    trenchDepth: v.n("trenchDepth"),
    beddingThickness: v.n("beddingThickness"),
    inspectionBoxes: buried ? v.n("inspectionBoxes") : 0,
    wastePercentage: v.n("wastePercentage"),
  };
}

function pricesFrom(v: Values): StormDrainagePrices {
  return {
    gutterPiece: v.n("gutterPrice"),
    hanger: v.n("hangerPrice"),
    gutterAccessory: v.n("gutterAccessoryPrice"),
    downspoutPiece: v.n("downspoutPrice"),
    downspoutFitting: v.n("downspoutFittingPrice"),
    pipePiece: v.n("pipePrice"),
    box: v.n("boxPrice"),
    lid: v.n("lidPrice"),
    beddingCubicMeter: v.n("beddingPrice"),
    laborGutterMeter: v.n("laborGutterPrice"),
    laborPipeMeter: v.n("laborPipePrice"),
    laborExcavationCubicMeter: v.n("laborExcavationPrice"),
  };
}

const gutterOn = (v: Values) => Boolean(v.flags.includeGutters);
const pipeOn = (v: Values) => Boolean(v.flags.includeBuriedPipe);

export const drenajePluvialConfig: CalculatorConfig<StormDrainageResult> = {
  id: "storm-drainage",
  settingsKey: "calculator.drenaje-pluvial",
  title: "Drenaje pluvial",
  subtitle: "Canal, bajantes, tubería enterrada, zanja, cama de arena y cajas de registro.",
  icon: "rainy-outline",
  calculateLabel: "Calcular drenaje",
  defaults: {
    roofArea: "", gutterLength: "", gutterPieceLength: "3", hangerSpacing: "0.60", gutterAccessories: "4",
    downspoutCount: "", downspoutHeight: "3", downspoutPieceLength: "3", downspoutFittingsPerUnit: "3",
    pipeLength: "", pipePieceLength: "6.1", pipeFittingsPercentage: "20", trenchWidth: "0.40",
    trenchDepth: "0.60", beddingThickness: "0.10", inspectionBoxes: "0", wastePercentage: "5",
    gutterPrice: "", hangerPrice: "", gutterAccessoryPrice: "", downspoutPrice: "", downspoutFittingPrice: "",
    pipePrice: "", boxPrice: "", lidPrice: "", beddingPrice: "", laborGutterPrice: "", laborPipePrice: "",
    laborExcavationPrice: "",
  },
  flagDefaults: { includeGutters: true, includeBuriedPipe: true },
  sections: [
    {
      title: "Canal y bajantes",
      description: "El área de techo por bajante te ayuda a ver si falta alguna; confirma el diámetro con tu proveedor.",
      fields: [
        { key: "roofArea", label: "Área de techo que drena", unit: "m²" },
        { key: "gutterLength", label: "Largo de canal", unit: "m" },
        { key: "gutterPieceLength", label: "Largo de cada pieza de canal", unit: "m", persist: true },
        { key: "hangerSpacing", label: "Separación de soportes", unit: "m", persist: true },
        { key: "gutterAccessories", label: "Tapas, esquinas y uniones", unit: "und." },
        { key: "downspoutCount", label: "Bajantes", unit: "und." },
        { key: "downspoutHeight", label: "Altura de cada bajante", unit: "m", persist: true },
        { key: "downspoutPieceLength", label: "Largo de cada pieza de bajante", unit: "m", persist: true },
        { key: "downspoutFittingsPerUnit", label: "Codos y abrazaderas por bajante", unit: "und.", persist: true },
      ],
      toggles: [{ key: "includeGutters", title: "Incluir canal y bajantes" }],
      info: (v) => {
        if (!gutterOn(v) || v.n("downspoutCount") <= 0 || v.n("roofArea") <= 0) return null;
        return `${(v.n("roofArea") / v.n("downspoutCount")).toFixed(0)} m² de techo por bajante.`;
      },
    },
    {
      title: "Tubería enterrada y cajas",
      fields: [
        { key: "pipeLength", label: "Largo de tubería", unit: "m" },
        { key: "pipePieceLength", label: "Largo de cada tubo", unit: "m", persist: true },
        { key: "pipeFittingsPercentage", label: "Accesorios (% del tubo)", unit: "%", persist: true },
        { key: "trenchWidth", label: "Ancho de zanja", unit: "m", persist: true },
        { key: "trenchDepth", label: "Profundidad de zanja", unit: "m", persist: true },
        { key: "beddingThickness", label: "Cama de arena", unit: "m", persist: true },
        { key: "inspectionBoxes", label: "Cajas de registro", unit: "und." },
      ],
      toggles: [{ key: "includeBuriedPipe", title: "Incluir tubería enterrada y cajas" }],
    },
    {
      title: "Desperdicio",
      fields: [{ key: "wastePercentage", label: "Desperdicio de corte", unit: "%", persist: true }],
    },
  ],
  prices: [
    { key: "gutterPrice", label: "Canal de PVC", unit: "por pieza", kind: "material", keywords: /canal de pvc/, showWhen: (v) => gutterOn(v) && hasWork(v) },
    { key: "hangerPrice", label: "Soporte de canal", unit: "por unidad", kind: "material", keywords: /soporte.*canal|abrazadera.*canal/, showWhen: gutterOn },
    { key: "gutterAccessoryPrice", label: "Accesorio de canal", unit: "por unidad", kind: "material", keywords: /accesorio.*canal/, showWhen: (v) => gutterOn(v) && v.n("gutterAccessories") > 0 },
    { key: "downspoutPrice", label: "Bajante de PVC", unit: "por pieza", kind: "material", keywords: /bajante de pvc/, showWhen: (v) => gutterOn(v) && v.n("downspoutCount") > 0 },
    { key: "downspoutFittingPrice", label: "Accesorio de bajante", unit: "por unidad", kind: "material", keywords: /accesorio.*bajante/, showWhen: (v) => gutterOn(v) && v.n("downspoutCount") > 0 },
    { key: "pipePrice", label: "Tubo PVC pluvial", unit: "por tubo", kind: "material", keywords: /tubo pvc 4|pvc 4/, showWhen: pipeOn },
    { key: "boxPrice", label: "Caja de registro", unit: "por unidad", kind: "material", keywords: /caja de registro.*(pluvial|concreto)/, showWhen: (v) => pipeOn(v) && v.n("inspectionBoxes") > 0 },
    { key: "lidPrice", label: "Tapa de caja", unit: "por unidad", kind: "material", keywords: /tapa.*caja/, showWhen: (v) => pipeOn(v) && v.n("inspectionBoxes") > 0 },
    { key: "beddingPrice", label: "Arena para cama", unit: "por m³", kind: "material", keywords: /arena/, showWhen: pipeOn },
    { key: "laborGutterPrice", label: "Instalación de canal y bajante", unit: "por metro", kind: "labor", keywords: /canal.*bajante|bajante/, showWhen: gutterOn },
    { key: "laborPipePrice", label: "Tendido de tubería pluvial", unit: "por metro", kind: "labor", keywords: /tuberia pluvial|pluvial/, showWhen: pipeOn },
    { key: "laborExcavationPrice", label: "Excavación de zanja", unit: "por m³", kind: "labor", keywords: /excavacion/, showWhen: pipeOn },
  ],
  validate: (v) => {
    if (!hasWork(v)) return "Escribe al menos el largo de canal, las bajantes, la tubería o las cajas.";
    if (gutterOn(v) && v.n("gutterLength") > 0 && (v.n("gutterPieceLength") <= 0 || v.n("hangerSpacing") <= 0)) {
      return "Escribe el largo de cada pieza de canal y la separación de soportes.";
    }
    if (gutterOn(v) && v.n("downspoutCount") > 0 && (v.n("downspoutPieceLength") <= 0 || v.n("downspoutHeight") <= 0)) {
      return "Escribe la altura y el largo de pieza de las bajantes.";
    }
    if (pipeOn(v) && v.n("pipeLength") > 0 && v.n("pipePieceLength") <= 0) return "Escribe el largo de cada tubo.";
    return null;
  },
  compute: (v) => {
    const result = calculateStormDrainage(inputFrom(v), pricesFrom(v));
    if (!result.totalCost && !result.gutterPieces && !result.pipePieces && !result.boxes && !result.downspoutPieces) {
      throw new Error("Drenaje sin medidas");
    }
    return result;
  },
  resultRows: (r) => {
    const rows: ResultRow[] = [];
    if (r.gutterPieces) rows.push({ label: "Canal", value: `${r.gutterPieces} piezas · ${r.hangers} soportes`, strong: true });
    if (r.gutterAccessories) rows.push({ label: "Accesorios de canal", value: `${r.gutterAccessories} unidades` });
    if (r.downspoutPieces) rows.push({ label: "Bajantes", value: `${r.downspoutPieces} piezas · ${r.downspoutFittings} accesorios` });
    if (r.roofAreaPerDownspout) rows.push({ label: "Techo por bajante", value: `${r.roofAreaPerDownspout.toFixed(0)} m²` });
    if (r.pipePieces) rows.push({ label: "Tubería pluvial", value: `${r.pipePieces} tubos`, strong: !rows.length });
    if (r.excavationVolume) rows.push({ label: "Zanja", value: `${r.excavationVolume.toFixed(2)} m³ · cama ${r.beddingVolume.toFixed(2)} m³` });
    if (r.boxes) rows.push({ label: "Cajas de registro", value: `${r.boxes} con tapa` });
    return rows;
  },
  buildLine: (r, c) =>
    makeLine({
      description: "Drenaje pluvial: canal, bajantes y tubería",
      unit: "global",
      quantity: 1,
      total: r.totalCost,
      costTotal: c.totalCost,
      materials: compactMaterials([
        material("Canal de PVC", r.gutterPieces, "pieza", c.gutterCost),
        material("Soporte de canal", r.hangers, "und.", c.hangerCost),
        material("Accesorio de canal", r.gutterAccessories, "und.", c.gutterAccessoryCost),
        material("Bajante de PVC", r.downspoutPieces, "pieza", c.downspoutCost),
        material("Accesorio de bajante", r.downspoutFittings, "und.", c.downspoutFittingCost),
        material("Tubo PVC pluvial", r.pipePieces, "tubo", c.pipeCost + c.pipeFittingsCost),
        material("Caja de registro", r.boxes, "und.", c.boxCost),
        material("Tapa de caja", r.boxes, "und.", c.lidCost),
        material("Arena para cama", Number(r.beddingVolume.toFixed(2)), "m³", c.beddingCost),
      ]),
      notes: `${r.gutterPieces} piezas de canal · ${r.pipePieces} tubos`,
    }),
};
