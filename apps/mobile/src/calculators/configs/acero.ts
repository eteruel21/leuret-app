import {
  compactMaterials,
  makeLine,
  material,
  parseNumber,
  type CalculatorConfig,
  type Values,
} from "@/components/calculators/CalculatorScreen";
import {
  calculateRebar,
  type RebarInput,
  type RebarPrices,
  type RebarResult,
} from "@/utils/construction-calculations";

const BAR_SIZES = [3, 4, 5, 6].map((size) => ({ value: String(size), label: `#${size}` }));
const STIRRUP_SIZES = [2, 3, 4].map((size) => ({ value: String(size), label: `#${size}` }));

export function rebarInputFrom(values: Values): RebarInput {
  const n = values.n;
  return {
    gridLength: n("gridLength"),
    gridWidth: n("gridWidth"),
    gridSpacingAcrossWidth: n("gridSpacingAcrossWidth"),
    gridSpacingAlongLength: n("gridSpacingAlongLength"),
    gridBarSize: n("gridBarSize"),
    gridLayers: n("gridLayers"),
    meshArea: n("meshArea"),
    meshSheetWidth: n("meshSheetWidth"),
    meshSheetLength: n("meshSheetLength"),
    meshOverlap: n("meshOverlap"),
    memberCount: n("memberCount"),
    memberLength: n("memberLength"),
    mainBarsPerMember: n("mainBarsPerMember"),
    mainBarSize: n("mainBarSize"),
    sectionWidthCm: n("sectionWidthCm"),
    sectionHeightCm: n("sectionHeightCm"),
    coverCm: n("coverCm"),
    stirrupSpacing: n("stirrupSpacing"),
    stirrupBarSize: n("stirrupBarSize"),
    stirrupHookLength: n("stirrupHookLength"),
    barPieceLength: n("barPieceLength"),
    lapDiameters: n("lapDiameters"),
    wastePercentage: n("wastePercentage"),
    tieWireKgPer100Kg: n("tieWireKgPer100Kg"),
  };
}

function rebarPricesFrom(values: Values): RebarPrices {
  const n = values.n;
  return {
    gridBar: n("gridBarPrice"),
    mainBar: n("mainBarPrice"),
    stirrupBar: n("stirrupBarPrice"),
    meshSheet: n("meshSheetPrice"),
    tieWireKg: n("tieWirePrice"),
    laborKg: n("laborKgPrice"),
    laborMeshSquareMeter: n("laborMeshPrice"),
  };
}

const hasGrid = (v: Values) => v.n("gridLength") > 0 && v.n("gridWidth") > 0;
const hasMesh = (v: Values) => v.n("meshArea") > 0;
const hasMembers = (v: Values) => v.n("memberCount") > 0 && v.n("memberLength") > 0;

export const aceroConfig: CalculatorConfig<RebarResult> = {
  id: "rebar",
  settingsKey: "calculator.acero",
  title: "Acero de refuerzo",
  subtitle: "Varillas, estribos, malla, alambre de amarre y armado.",
  icon: "construct-outline",
  calculateLabel: "Calcular acero",
  defaults: {
    gridLength: "", gridWidth: "", gridSpacingAcrossWidth: "0.20", gridSpacingAlongLength: "0.20",
    gridBarSize: "3", gridLayers: "1",
    meshArea: "", meshSheetWidth: "2.35", meshSheetLength: "6", meshOverlap: "0.15",
    memberCount: "", memberLength: "", mainBarsPerMember: "4", mainBarSize: "4",
    sectionWidthCm: "20", sectionHeightCm: "20", coverCm: "3", stirrupSpacing: "0.15",
    stirrupBarSize: "2", stirrupHookLength: "0.20",
    barPieceLength: "9.14", lapDiameters: "40", wastePercentage: "5", tieWireKgPer100Kg: "1.5",
    gridBarPrice: "", mainBarPrice: "", stirrupBarPrice: "", meshSheetPrice: "",
    tieWirePrice: "", laborKgPrice: "", laborMeshPrice: "",
  },
  sections: [
    {
      title: "Parrilla",
      description: "Losa, zapata o piso: varillas en las dos direcciones. Déjala vacía si no aplica.",
      fields: [
        { key: "gridLength", label: "Largo", unit: "m" },
        { key: "gridWidth", label: "Ancho", unit: "m" },
        { key: "gridSpacingAcrossWidth", label: "Separación de varillas del largo", unit: "m", persist: true },
        { key: "gridSpacingAlongLength", label: "Separación de varillas del ancho", unit: "m", persist: true },
        { key: "gridBarSize", label: "Varilla", options: BAR_SIZES, persist: true },
        {
          key: "gridLayers", label: "Capas", persist: true,
          options: [{ value: "1", label: "Una capa" }, { value: "2", label: "Dos capas" }],
        },
      ],
      info: (v) => {
        if (!hasGrid(v)) return null;
        const across = v.n("gridSpacingAcrossWidth");
        const along = v.n("gridSpacingAlongLength");
        if (!across || !along) return null;
        return `${Math.ceil(v.n("gridWidth") / across) + 1} varillas del largo y ${Math.ceil(v.n("gridLength") / along) + 1} del ancho, por capa.`;
      },
    },
    {
      title: "Malla electrosoldada",
      description: "Pisos y losas sobre el terreno. Déjala vacía si no aplica.",
      fields: [
        { key: "meshArea", label: "Área", unit: "m²" },
        { key: "meshSheetWidth", label: "Ancho de la hoja", unit: "m", persist: true },
        { key: "meshSheetLength", label: "Largo de la hoja", unit: "m", persist: true },
        { key: "meshOverlap", label: "Traslape", unit: "m", persist: true },
      ],
    },
    {
      title: "Columnas y vigas",
      description: "Varillas longitudinales y estribos. Déjalo vacío si no aplica.",
      fields: [
        { key: "memberCount", label: "Cantidad de elementos", unit: "und." },
        { key: "memberLength", label: "Largo o altura de cada uno", unit: "m" },
        { key: "mainBarsPerMember", label: "Varillas por elemento", unit: "und.", persist: true },
        { key: "mainBarSize", label: "Varilla principal", options: BAR_SIZES, persist: true },
        { key: "sectionWidthCm", label: "Sección: ancho", unit: "cm" },
        { key: "sectionHeightCm", label: "Sección: alto", unit: "cm" },
        { key: "coverCm", label: "Recubrimiento", unit: "cm", persist: true },
        { key: "stirrupSpacing", label: "Separación de estribos", unit: "m", persist: true },
        { key: "stirrupBarSize", label: "Varilla del estribo", options: STIRRUP_SIZES, persist: true },
        { key: "stirrupHookLength", label: "Ganchos del estribo", unit: "m", persist: true },
      ],
    },
    {
      title: "Ajustes",
      description: "Largo de la varilla, empalmes y desperdicio.",
      fields: [
        { key: "barPieceLength", label: "Largo de la varilla", unit: "m", persist: true },
        { key: "lapDiameters", label: "Empalme", unit: "diám.", persist: true },
        { key: "wastePercentage", label: "Desperdicio", unit: "%", persist: true },
        { key: "tieWireKgPer100Kg", label: "Alambre de amarre", unit: "kg/100 kg", persist: true },
      ],
    },
  ],
  prices: [
    { key: "gridBarPrice", label: "Varilla de la parrilla", unit: "por varilla", kind: "material", keywords: /varilla|barra corrugada/, showWhen: hasGrid },
    { key: "mainBarPrice", label: "Varilla principal", unit: "por varilla", kind: "material", keywords: /varilla|barra corrugada/, showWhen: (v) => hasMembers(v) && v.n("mainBarsPerMember") > 0 },
    { key: "stirrupBarPrice", label: "Varilla de estribos", unit: "por varilla", kind: "material", keywords: /varilla|barra corrugada/, showWhen: hasMembers },
    { key: "meshSheetPrice", label: "Malla electrosoldada", unit: "por hoja", kind: "material", keywords: /malla electro/, showWhen: hasMesh },
    { key: "tieWirePrice", label: "Alambre de amarre", unit: "por kg", kind: "material", keywords: /amarre|recocido|alambre/ },
    { key: "laborKgPrice", label: "Armado de varillas", unit: "por kg", kind: "labor", keywords: /acero|armad|refuerzo|varilla/, showWhen: (v) => hasGrid(v) || hasMembers(v) },
    { key: "laborMeshPrice", label: "Colocación de malla", unit: "por m²", kind: "labor", keywords: /malla/, showWhen: hasMesh },
  ],
  validate: (v) => {
    if (!hasGrid(v) && !hasMesh(v) && !hasMembers(v)) {
      return "Escribe las medidas de la parrilla, el área de malla o los elementos (columnas o vigas).";
    }
    if (hasGrid(v) && (v.n("gridSpacingAcrossWidth") <= 0 || v.n("gridSpacingAlongLength") <= 0)) {
      return "Escribe la separación de las varillas de la parrilla.";
    }
    if (hasMembers(v) && v.n("stirrupSpacing") <= 0) return "Escribe la separación de los estribos.";
    if (v.n("barPieceLength") <= 0) return "Escribe el largo de la varilla (9.14 m es una de 30 pies).";
    if (hasMesh(v) && (v.n("meshSheetWidth") <= v.n("meshOverlap") || v.n("meshSheetLength") <= v.n("meshOverlap"))) {
      return "El traslape de la malla debe ser menor que la hoja.";
    }
    if (v.n("wastePercentage") > 100) return "El desperdicio debe estar entre 0% y 100%.";
    return null;
  },
  compute: (v) => calculateRebar(rebarInputFrom(v), rebarPricesFrom(v)),
  resultRows: (r, v) => {
    const rows = [] as { label: string; value: string; strong?: boolean }[];
    if (r.gridPieces) rows.push({ label: `Parrilla: varillas #${v.form.gridBarSize}`, value: `${r.gridPieces} und. · ${r.gridKg.toFixed(1)} kg` });
    if (r.meshSheets) rows.push({ label: "Malla electrosoldada", value: `${r.meshSheets} hojas` });
    if (r.mainPieces) rows.push({ label: `Columnas y vigas: varillas #${v.form.mainBarSize}`, value: `${r.mainPieces} und. · ${r.mainKg.toFixed(1)} kg` });
    if (r.stirrupPieces) rows.push({ label: `Estribos #${v.form.stirrupBarSize} (${r.stirrupsPerMember} por elemento)`, value: `${r.stirrupPieces} und. · ${r.stirrupKg.toFixed(1)} kg` });
    rows.push({ label: "Acero total", value: `${r.totalSteelKg.toFixed(1)} kg`, strong: true });
    rows.push({ label: "Alambre de amarre", value: `${r.tieWireKg.toFixed(1)} kg` });
    return rows;
  },
  buildLine: (r, c, v) => {
    const steel = r.totalSteelKg > 0;
    const description = [
      r.gridPieces && "parrilla",
      r.meshSheets && "malla",
      (r.mainPieces || r.stirrupPieces) && "columnas y vigas",
    ].filter(Boolean).join(", ");
    return makeLine({
      description: `Acero de refuerzo (${description})`,
      unit: steel ? "kg" : "m²",
      quantity: steel ? r.totalSteelKg : parseNumber(v.form.meshArea),
      total: r.totalCost,
      costTotal: c.totalCost,
      materials: compactMaterials([
        material(`Varilla #${v.form.gridBarSize} (parrilla)`, r.gridPieces, "und.", c.gridCost),
        material("Malla electrosoldada", r.meshSheets, "hoja", c.meshCost),
        material(`Varilla #${v.form.mainBarSize} (principal)`, r.mainPieces, "und.", c.mainCost),
        material(`Varilla #${v.form.stirrupBarSize} (estribos)`, r.stirrupPieces, "und.", c.stirrupCost),
        material("Alambre de amarre", r.tieWireKg, "kg", c.tieWireCost),
      ]),
      notes: `${r.totalSteelKg.toFixed(1)} kg de acero · ${r.tieWireKg.toFixed(1)} kg de alambre de amarre`,
    });
  },
};
