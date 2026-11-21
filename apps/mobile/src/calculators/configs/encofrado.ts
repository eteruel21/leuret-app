import {
  compactMaterials,
  makeLine,
  material,
  type CalculatorConfig,
  type Values,
} from "@/components/calculators/CalculatorScreen";
import {
  calculateFormwork,
  type FormworkInput,
  type FormworkPrices,
  type FormworkResult,
} from "@/utils/structure-calculations";

function inputFrom(v: Values): FormworkInput {
  const n = v.n;
  return {
    directArea: n("directArea"),
    columnCount: n("columnCount"),
    columnWidthCm: n("columnWidthCm"),
    columnDepthCm: n("columnDepthCm"),
    columnHeight: n("columnHeight"),
    beamLength: n("beamLength"),
    beamWidthCm: n("beamWidthCm"),
    beamHeightCm: n("beamHeightCm"),
    slabArea: n("slabArea"),
    edgeLength: n("edgeLength"),
    edgeHeight: n("edgeHeight"),
    uses: n("uses"),
    sheetWidth: n("sheetWidth"),
    sheetLength: n("sheetLength"),
    lumberPiecesPerSquareMeter: n("lumberPerSquareMeter"),
    nailsKgPerSquareMeter: n("nailsPerSquareMeter"),
    wastePercentage: n("wastePercentage"),
  };
}

function pricesFrom(v: Values): FormworkPrices {
  const n = v.n;
  return {
    sheet: n("sheetPrice"),
    lumberPiece: n("lumberPrice"),
    nailKg: n("nailPrice"),
    laborSquareMeter: n("laborPrice"),
  };
}

const hasForm = (v: Values) => calculateFormwork(inputFrom(v), pricesFrom(v)).totalArea > 0;

export const encofradoConfig: CalculatorConfig<FormworkResult> = {
  id: "formwork",
  settingsKey: "calculator.encofrado",
  title: "Encofrado",
  subtitle: "Plywood, madera y clavos de las formaletas, según los usos que les des.",
  icon: "albums-outline",
  calculateLabel: "Calcular encofrado",
  defaults: {
    directArea: "", columnCount: "", columnWidthCm: "20", columnDepthCm: "20", columnHeight: "",
    beamLength: "", beamWidthCm: "20", beamHeightCm: "30", slabArea: "", edgeLength: "", edgeHeight: "",
    uses: "4", sheetWidth: "1.22", sheetLength: "2.44", lumberPerSquareMeter: "1",
    nailsPerSquareMeter: "0.15", wastePercentage: "10",
    sheetPrice: "", lumberPrice: "", nailPrice: "", laborPrice: "",
  },
  sections: [
    {
      title: "Qué vas a encofrar",
      description: "Llena solo lo que necesites; el área de contacto se suma sola.",
      fields: [
        { key: "columnCount", label: "Columnas (cantidad)", unit: "und." },
        { key: "columnWidthCm", label: "Ancho de columna", unit: "cm", persist: true },
        { key: "columnDepthCm", label: "Fondo de columna", unit: "cm", persist: true },
        { key: "columnHeight", label: "Altura de columna", unit: "m" },
        { key: "beamLength", label: "Largo total de vigas", unit: "m" },
        { key: "beamWidthCm", label: "Ancho de viga", unit: "cm", persist: true },
        { key: "beamHeightCm", label: "Peralte de viga", unit: "cm", persist: true },
        { key: "slabArea", label: "Losa (fondo)", unit: "m²" },
        { key: "edgeLength", label: "Largo de bordes o zapatas", unit: "m" },
        { key: "edgeHeight", label: "Altura de bordes o zapatas", unit: "m" },
        { key: "directArea", label: "Otra área de contacto", unit: "m²" },
      ],
      info: (v) => {
        if (!hasForm(v)) return null;
        const r = calculateFormwork(inputFrom(v), pricesFrom(v));
        return `Área de contacto: ${r.totalArea.toFixed(2)} m².`;
      },
    },
    {
      title: "Material y reutilización",
      description: "La formaleta se arma una vez y se reutiliza; los clavos se gastan en cada uso.",
      fields: [
        { key: "uses", label: "Usos de la formaleta", unit: "veces", persist: true },
        { key: "sheetWidth", label: "Ancho del plywood", unit: "m", persist: true },
        { key: "sheetLength", label: "Largo del plywood", unit: "m", persist: true },
        { key: "lumberPerSquareMeter", label: "Reglas de madera por m²", unit: "und.", persist: true },
        { key: "nailsPerSquareMeter", label: "Clavos por m² por uso", unit: "kg", persist: true },
        { key: "wastePercentage", label: "Desperdicio", unit: "%", persist: true },
      ],
    },
  ],
  prices: [
    { key: "sheetPrice", label: "Plywood", unit: "por lámina", kind: "material", keywords: /plywood|formaleta|fenolico/, showWhen: hasForm },
    { key: "lumberPrice", label: "Regla de madera", unit: "por pieza", kind: "material", keywords: /madera|regla|2x4/ },
    { key: "nailPrice", label: "Clavos", unit: "por kg", kind: "material", keywords: /clavo/ },
    { key: "laborPrice", label: "Armado y desarmado", unit: "por m²", kind: "labor", keywords: /encofrado|formaleta/ },
  ],
  validate: (v) => {
    if (!hasForm(v)) return "Escribe al menos un elemento a encofrar (columnas, vigas, losa, bordes o área directa).";
    if (v.n("sheetWidth") <= 0 || v.n("sheetLength") <= 0) return "Escribe el ancho y el largo del plywood.";
    if (v.n("wastePercentage") > 100) return "El desperdicio debe estar entre 0% y 100%.";
    return null;
  },
  compute: (v) => calculateFormwork(inputFrom(v), pricesFrom(v)),
  resultRows: (r, v) => [
    { label: "Área de contacto", value: `${r.totalArea.toFixed(2)} m²`, strong: true },
    { label: `Plywood (${Math.max(Math.round(v.n("uses")), 1)} usos)`, value: `${r.sheets} láminas` },
    { label: "Reglas de madera", value: `${r.lumberPieces} und.` },
    { label: "Clavos", value: `${r.nailsKg.toFixed(1)} kg` },
  ],
  buildLine: (r, c) =>
    makeLine({
      description: "Encofrado (formaleta)",
      unit: "m²",
      quantity: r.totalArea,
      total: r.totalCost,
      costTotal: c.totalCost,
      materials: compactMaterials([
        material("Plywood", r.sheets, "lám.", c.sheetCost),
        material("Regla de madera", r.lumberPieces, "und.", c.lumberCost),
        material("Clavos", Number(r.nailsKg.toFixed(1)), "kg", c.nailCost),
      ]),
      notes: `${r.sheets} láminas de plywood · ${r.lumberPieces} reglas`,
    }),
};
