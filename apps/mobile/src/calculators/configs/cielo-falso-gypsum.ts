import {
  compactMaterials,
  makeLine,
  material,
  type CalculatorConfig,
  type Values,
} from "@/components/calculators/CalculatorScreen";
import {
  calculateGypsumCeiling,
  type GypsumCeilingInput,
  type GypsumCeilingPrices,
  type GypsumCeilingResult,
} from "@/utils/ceiling-panel-calculations";

const hasCeiling = (v: Values) => v.n("length") > 0 && v.n("width") > 0;

function inputFrom(v: Values): GypsumCeilingInput {
  const n = v.n;
  return {
    length: n("length"),
    width: n("width"),
    sheetWidth: n("sheetWidth"),
    sheetLength: n("sheetLength"),
    mainSpacing: n("mainSpacing"),
    furringSpacing: n("furringSpacing"),
    profilePieceLength: n("profilePieceLength"),
    perimeterPieceLength: n("perimeterPieceLength"),
    hangerSpacing: n("hangerSpacing"),
    hangerLength: n("hangerLength"),
    hangerKgPerMeter: n("hangerKgPerMeter"),
    screwsPerSquareMeter: n("screwsPerSquareMeter"),
    screwsPerBox: n("screwsPerBox"),
    compoundKgPerSquareMeter: n("compoundKgPerSquareMeter"),
    compoundPailKg: n("compoundPailKg"),
    tapeMetersPerSquareMeter: n("tapeMetersPerSquareMeter"),
    tapeRollLength: n("tapeRollLength"),
    wastePercentage: n("wastePercentage"),
  };
}

function pricesFrom(v: Values): GypsumCeilingPrices {
  const n = v.n;
  return {
    sheet: n("sheetPrice"),
    mainPiece: n("mainPrice"),
    furringPiece: n("furringPrice"),
    perimeterPiece: n("perimeterPrice"),
    hangerKg: n("hangerPrice"),
    screwBox: n("screwPrice"),
    compoundPail: n("compoundPrice"),
    tapeRoll: n("tapePrice"),
    laborSquareMeter: n("laborPrice"),
  };
}

export const cieloFalsoGypsumConfig: CalculatorConfig<GypsumCeilingResult> = {
  id: "gypsum-ceiling",
  settingsKey: "calculator.cielo-falso-gypsum",
  title: "Cielo falso de gypsum",
  subtitle: "Láminas, canales, ángulo perimetral, colgantes, tornillos y acabado.",
  icon: "remove-outline",
  calculateLabel: "Calcular cielo falso",
  defaults: {
    length: "", width: "", sheetWidth: "1.22", sheetLength: "2.44", mainSpacing: "1.20",
    furringSpacing: "0.60", profilePieceLength: "3.05", perimeterPieceLength: "3.05",
    hangerSpacing: "1.20", hangerLength: "0.60", hangerKgPerMeter: "0.016", screwsPerSquareMeter: "25",
    screwsPerBox: "1000", compoundKgPerSquareMeter: "0.6", compoundPailKg: "28",
    tapeMetersPerSquareMeter: "1.4", tapeRollLength: "90", wastePercentage: "10",
    sheetPrice: "", mainPrice: "", furringPrice: "", perimeterPrice: "", hangerPrice: "",
    screwPrice: "", compoundPrice: "", tapePrice: "", laborPrice: "",
  },
  sections: [
    {
      title: "Medidas del cielo",
      description: "Para un cuarto rectangular. Si son varios cuartos, haz un cálculo por cuarto.",
      fields: [
        { key: "length", label: "Largo", unit: "m" },
        { key: "width", label: "Ancho", unit: "m" },
      ],
      info: (v) =>
        hasCeiling(v) ? `Área: ${(v.n("length") * v.n("width")).toFixed(2)} m² · perímetro: ${(2 * (v.n("length") + v.n("width"))).toFixed(2)} m.` : null,
    },
    {
      title: "Estructura y láminas",
      description: "Datos de referencia. Ajústalos a lo que vende tu proveedor.",
      fields: [
        { key: "sheetWidth", label: "Ancho de la lámina", unit: "m", persist: true },
        { key: "sheetLength", label: "Largo de la lámina", unit: "m", persist: true },
        { key: "mainSpacing", label: "Separación de canales portantes", unit: "m", persist: true },
        { key: "furringSpacing", label: "Separación de canales de amarre", unit: "m", persist: true },
        { key: "profilePieceLength", label: "Largo del canal", unit: "m", persist: true },
        { key: "perimeterPieceLength", label: "Largo del ángulo perimetral", unit: "m", persist: true },
        { key: "hangerSpacing", label: "Separación de colgantes", unit: "m", persist: true },
        { key: "hangerLength", label: "Largo de cada colgante", unit: "m", persist: true },
        { key: "hangerKgPerMeter", label: "Peso del alambre del colgante", unit: "kg/m", persist: true },
        { key: "wastePercentage", label: "Desperdicio", unit: "%", persist: true },
      ],
    },
    {
      title: "Fijación y acabado",
      fields: [
        { key: "screwsPerSquareMeter", label: "Tornillos por m²", unit: "und.", persist: true },
        { key: "screwsPerBox", label: "Tornillos por caja", unit: "und.", persist: true },
        { key: "compoundKgPerSquareMeter", label: "Pasta por m²", unit: "kg", persist: true },
        { key: "compoundPailKg", label: "Peso de la cubeta de pasta", unit: "kg", persist: true },
        { key: "tapeMetersPerSquareMeter", label: "Cinta por m²", unit: "m", persist: true },
        { key: "tapeRollLength", label: "Largo del rollo de cinta", unit: "m", persist: true },
      ],
    },
  ],
  prices: [
    { key: "sheetPrice", label: "Lámina de gypsum", unit: "por lámina", kind: "material", keywords: /gypsum.*(regular|1\/2|lamina)|lamina.*gypsum/, showWhen: hasCeiling },
    { key: "mainPrice", label: "Canal portante", unit: "por pieza", kind: "material", keywords: /canal portante|portante/ },
    { key: "furringPrice", label: "Canal de amarre (listón)", unit: "por pieza", kind: "material", keywords: /canal.*(liston|amarre)|liston/ },
    { key: "perimeterPrice", label: "Ángulo perimetral", unit: "por pieza", kind: "material", keywords: /angulo perimetral.*(galvaniz|metal)|angulo.*galvaniz/ },
    { key: "hangerPrice", label: "Alambre de colgante", unit: "por kg", kind: "material", keywords: /tensor|colgante/ },
    { key: "screwPrice", label: "Tornillos para gypsum", unit: "por caja", kind: "material", keywords: /tornillo.*gypsum/ },
    { key: "compoundPrice", label: "Pasta para juntas", unit: "por cubeta", kind: "material", keywords: /pasta.*(juntas|gypsum)/ },
    { key: "tapePrice", label: "Cinta para juntas", unit: "por rollo", kind: "material", keywords: /cinta.*(junta|malla|papel)/ },
    { key: "laborPrice", label: "Instalación del cielo falso", unit: "por m²", kind: "labor", keywords: /cielo falso|cielo raso/ },
  ],
  validate: (v) => {
    if (!hasCeiling(v)) return "Escribe el largo y el ancho del cielo.";
    if (v.n("sheetWidth") <= 0 || v.n("sheetLength") <= 0) return "Escribe el ancho y el largo de la lámina.";
    if (v.n("mainSpacing") <= 0 || v.n("furringSpacing") <= 0) return "Escribe la separación de los canales.";
    if (v.n("profilePieceLength") <= 0 || v.n("perimeterPieceLength") <= 0) return "Escribe el largo de los canales y del ángulo.";
    if (v.n("wastePercentage") > 100) return "El desperdicio debe estar entre 0% y 100%.";
    return null;
  },
  compute: (v) => calculateGypsumCeiling(inputFrom(v), pricesFrom(v)),
  resultRows: (r) => [
    { label: "Área del cielo", value: `${r.area.toFixed(2)} m²`, strong: true },
    { label: "Láminas de gypsum", value: `${r.sheets} und.` },
    { label: `Canal portante (${r.mainLines} líneas)`, value: `${r.mainPieces} piezas` },
    { label: `Canal de amarre (${r.furringLines} líneas)`, value: `${r.furringPieces} piezas` },
    { label: "Ángulo perimetral", value: `${r.perimeterPieces} piezas` },
    { label: "Colgantes", value: `${r.hangers} und. · ${r.hangerKg.toFixed(2)} kg de alambre` },
    { label: "Tornillos", value: `${r.screwBoxes} cajas` },
    { label: "Pasta y cinta", value: `${r.compoundPails} cubetas · ${r.tapeRolls} rollos` },
  ],
  buildLine: (r, c) =>
    makeLine({
      description: "Cielo falso de gypsum con estructura metálica",
      unit: "m²",
      quantity: r.area,
      total: r.totalCost,
      costTotal: c.totalCost,
      materials: compactMaterials([
        material("Lámina de gypsum", r.sheets, "lám.", c.sheetCost),
        material("Canal portante", r.mainPieces, "und.", c.mainCost),
        material("Canal de amarre", r.furringPieces, "und.", c.furringCost),
        material("Ángulo perimetral", r.perimeterPieces, "und.", c.perimeterCost),
        material("Alambre de colgante", Number(r.hangerKg.toFixed(2)), "kg", c.hangerCost),
        material("Tornillos para gypsum", r.screwBoxes, "caja", c.screwCost),
        material("Pasta para juntas", r.compoundPails, "cubeta", c.compoundCost),
        material("Cinta para juntas", r.tapeRolls, "rollo", c.tapeCost),
      ]),
      notes: `${r.sheets} láminas · ${r.mainPieces + r.furringPieces} canales`,
    }),
};
