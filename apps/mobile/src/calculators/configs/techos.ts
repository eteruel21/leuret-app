import {
  compactMaterials,
  makeLine,
  material,
  type CalculatorConfig,
  type Values,
} from "@/components/calculators/CalculatorScreen";
import {
  calculateRoofing,
  type RoofingInput,
  type RoofingPrices,
  type RoofingResult,
  type RoofType,
} from "@/utils/construction-calculations";

const hasRoof = (v: Values) => v.n("length") > 0 && v.n("width") > 0;
const gable = (v: Values) => v.form.roofType !== "shed";

function inputFrom(v: Values): RoofingInput {
  const n = v.n;
  return {
    roofType: (gable(v) ? "gable" : "shed") as RoofType,
    length: n("length"),
    width: n("width"),
    overhang: n("overhang"),
    slopePercent: n("slopePercent"),
    sheetEffectiveWidth: n("sheetEffectiveWidth"),
    sheetLength: n("sheetLength"),
    longitudinalLap: n("longitudinalLap"),
    purlinSpacing: n("purlinSpacing"),
    purlinPieceLength: n("purlinPieceLength"),
    purlinLap: n("purlinLap"),
    screwsPerSquareMeter: n("screwsPerSquareMeter"),
    screwsPerBox: n("screwsPerBox"),
    includeRidge: Boolean(v.flags.includeRidge),
    ridgePieceLength: n("ridgePieceLength"),
    includeGutter: Boolean(v.flags.includeGutter),
    gutterPieceLength: n("gutterPieceLength"),
    downspouts: n("downspouts"),
    wastePercentage: n("wastePercentage"),
  };
}

function pricesFrom(v: Values): RoofingPrices {
  const n = v.n;
  return {
    sheet: n("sheetPrice"),
    purlin: n("purlinPrice"),
    screwBox: n("screwBoxPrice"),
    ridgePiece: n("ridgePrice"),
    gutterPiece: n("gutterPrice"),
    downspoutPiece: n("downspoutPrice"),
    supplies: n("suppliesPrice"),
    laborSquareMeter: n("laborPrice"),
  };
}

export const techosConfig: CalculatorConfig<RoofingResult> = {
  id: "roofing",
  settingsKey: "calculator.techos",
  title: "Techos y cubiertas",
  subtitle: "Láminas, carriolas, tornillos, cumbrera, canal y mano de obra.",
  icon: "home-outline",
  calculateLabel: "Calcular techo",
  defaults: {
    roofType: "gable", length: "", width: "", overhang: "0.50", slopePercent: "30",
    sheetEffectiveWidth: "0.90", sheetLength: "6.10", longitudinalLap: "0.20",
    purlinSpacing: "1.00", purlinPieceLength: "6.10", purlinLap: "0.15",
    screwsPerSquareMeter: "6", screwsPerBox: "100", ridgePieceLength: "3.05",
    gutterPieceLength: "3.00", downspouts: "2", wastePercentage: "8",
    sheetPrice: "", purlinPrice: "", screwBoxPrice: "", ridgePrice: "", gutterPrice: "",
    downspoutPrice: "", suppliesPrice: "", laborPrice: "",
  },
  flagDefaults: { includeRidge: true, includeGutter: false },
  sections: [
    {
      title: "Medidas del techo",
      description: "Mide la casa vista desde arriba; el alero y la pendiente se suman solos.",
      fields: [
        {
          key: "roofType", label: "Tipo de techo", persist: true,
          options: [{ value: "gable", label: "Dos aguas" }, { value: "shed", label: "Una agua" }],
        },
        { key: "length", label: "Largo (a lo largo del caballete)", unit: "m" },
        { key: "width", label: "Ancho (de alero a alero sin vuelo)", unit: "m" },
        { key: "overhang", label: "Alero (vuelo)", unit: "m", persist: true },
        { key: "slopePercent", label: "Pendiente", unit: "%", persist: true },
      ],
      info: (v) => {
        if (!hasRoof(v)) return null;
        const r = calculateRoofing(inputFrom(v), pricesFrom(v));
        return `Área real del techo: ${r.roofArea.toFixed(2)} m² (largo de cada agua: ${r.slopeLength.toFixed(2)} m).`;
      },
    },
    {
      title: "Láminas y estructura",
      description: "Datos de la lámina de zinc y de las carriolas. Revisa los de tu proveedor.",
      fields: [
        { key: "sheetEffectiveWidth", label: "Ancho útil de la lámina", unit: "m", persist: true },
        { key: "sheetLength", label: "Largo de la lámina", unit: "m", persist: true },
        { key: "longitudinalLap", label: "Traslape entre láminas", unit: "m", persist: true },
        { key: "purlinSpacing", label: "Separación de carriolas", unit: "m", persist: true },
        { key: "purlinPieceLength", label: "Largo de la carriola", unit: "m", persist: true },
        { key: "purlinLap", label: "Empalme de carriolas", unit: "m", persist: true },
        { key: "screwsPerSquareMeter", label: "Tornillos por m²", unit: "und.", persist: true },
        { key: "screwsPerBox", label: "Tornillos por caja", unit: "und.", persist: true },
        { key: "wastePercentage", label: "Desperdicio", unit: "%", persist: true },
      ],
    },
    {
      title: "Cumbrera y canal",
      description: "Actívalos si el trabajo los incluye.",
      fields: [
        { key: "ridgePieceLength", label: "Largo de la cumbrera", unit: "m", persist: true },
        { key: "gutterPieceLength", label: "Largo de la canal", unit: "m", persist: true },
        { key: "downspouts", label: "Bajantes", unit: "und.", persist: true },
      ],
      toggles: [
        { key: "includeRidge", title: "Incluir cumbrera", subtitle: "Solo en techos a dos aguas." },
        { key: "includeGutter", title: "Incluir canal y bajantes" },
      ],
    },
  ],
  prices: [
    { key: "sheetPrice", label: "Lámina de zinc", unit: "por lámina", kind: "material", keywords: /zinc|lamina|cubierta/, showWhen: hasRoof },
    { key: "purlinPrice", label: "Carriola", unit: "por pieza", kind: "material", keywords: /carriola|correa/ },
    { key: "screwBoxPrice", label: "Tornillos de techo", unit: "por caja", kind: "material", keywords: /tornillo.*(zinc|techo|arandela)|autoperforante/ },
    { key: "ridgePrice", label: "Cumbrera", unit: "por pieza", kind: "material", keywords: /cumbrera|caballete/, showWhen: (v) => gable(v) && Boolean(v.flags.includeRidge) },
    { key: "gutterPrice", label: "Canal", unit: "por pieza", kind: "material", keywords: /canal|canaleta/, showWhen: (v) => Boolean(v.flags.includeGutter) },
    { key: "downspoutPrice", label: "Bajante", unit: "por pieza", kind: "material", keywords: /bajante/, showWhen: (v) => Boolean(v.flags.includeGutter) },
    { key: "suppliesPrice", label: "Sellador y otros insumos", unit: "global", kind: "material", keywords: /sellador|silicon|poliuretano/ },
    { key: "laborPrice", label: "Instalación del techo", unit: "por m²", kind: "labor", keywords: /techo|cubierta|zinc/ },
  ],
  validate: (v) => {
    if (!hasRoof(v)) return "Escribe el largo y el ancho del techo.";
    if (v.n("sheetEffectiveWidth") <= 0 || v.n("sheetLength") <= 0) return "Escribe el ancho útil y el largo de la lámina.";
    if (v.n("slopePercent") > 200) return "Revisa la pendiente: se escribe en porcentaje (30 = 30 %).";
    if (v.n("wastePercentage") > 100) return "El desperdicio debe estar entre 0% y 100%.";
    return null;
  },
  compute: (v) => calculateRoofing(inputFrom(v), pricesFrom(v)),
  resultRows: (r) => {
    const rows = [
      { label: "Área real del techo", value: `${r.roofArea.toFixed(2)} m²`, strong: true },
      { label: `Láminas (${r.sheetsAcross} por fila × ${r.sheetsPerRun} por tramo × ${r.planes} agua${r.planes > 1 ? "s" : ""})`, value: `${r.sheets} und.` },
      { label: `Carriolas (${r.purlinLines} líneas)`, value: `${r.purlins} und.` },
      { label: "Tornillos", value: `${r.screws} und. · ${r.screwBoxes} cajas` },
    ];
    if (r.ridgePieces) rows.push({ label: "Cumbrera", value: `${r.ridgePieces} piezas` });
    if (r.gutterPieces) rows.push({ label: "Canal", value: `${r.gutterPieces} piezas · ${r.downspouts} bajantes` });
    return rows;
  },
  buildLine: (r, c) =>
    makeLine({
      description: r.planes === 2 ? "Techo de zinc a dos aguas con estructura" : "Techo de zinc a una agua con estructura",
      unit: "m²",
      quantity: r.roofArea,
      total: r.totalCost,
      costTotal: c.totalCost,
      materials: compactMaterials([
        material("Lámina de zinc", r.sheets, "lám.", c.sheetCost),
        material("Carriola", r.purlins, "und.", c.purlinCost),
        material("Tornillos de techo", r.screwBoxes, "caja", c.screwCost),
        material("Cumbrera", r.ridgePieces, "und.", c.ridgeCost),
        material("Canal", r.gutterPieces, "und.", c.gutterCost),
        material("Bajante", r.downspouts, "und.", c.downspoutCost),
      ]),
      notes: `${r.sheets} láminas · ${r.purlins} carriolas · ${r.screwBoxes} cajas de tornillos`,
    }),
};
