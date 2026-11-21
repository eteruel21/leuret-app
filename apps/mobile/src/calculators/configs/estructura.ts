import {
  compactMaterials,
  makeLine,
  material,
  type CalculatorConfig,
  type Values,
} from "@/components/calculators/CalculatorScreen";
import {
  calculateStructure,
  type StructureInput,
  type StructurePrices,
  type StructureResult,
} from "@/utils/structure-calculations";

const BAR_SIZES = [3, 4, 5, 6].map((size) => ({ value: String(size), label: `#${size}` }));

function inputFrom(v: Values): StructureInput {
  const n = v.n;
  return {
    footingCount: n("footingCount"),
    footingLength: n("footingLength"),
    footingWidth: n("footingWidth"),
    footingHeight: n("footingHeight"),
    columnCount: n("columnCount"),
    columnWidthCm: n("columnWidthCm"),
    columnDepthCm: n("columnDepthCm"),
    columnHeight: n("columnHeight"),
    beamLength: n("beamLength"),
    beamWidthCm: n("beamWidthCm"),
    beamHeightCm: n("beamHeightCm"),
    slabArea: n("slabArea"),
    slabThickness: n("slabThickness"),
    footingRebarKgM3: n("footingRebarKgM3"),
    columnRebarKgM3: n("columnRebarKgM3"),
    beamRebarKgM3: n("beamRebarKgM3"),
    slabRebarKgM3: n("slabRebarKgM3"),
    mixCement: n("mixCement"),
    mixSand: n("mixSand"),
    mixGravel: n("mixGravel"),
    cementBagWeight: n("cementBagWeight"),
    concreteWastePercentage: n("concreteWastePercentage"),
    barSize: n("barSize"),
    barPieceLength: n("barPieceLength"),
    rebarWastePercentage: n("rebarWastePercentage"),
    tieWireKgPer100Kg: n("tieWireKgPer100Kg"),
    includeFormwork: Boolean(v.flags.includeFormwork),
    formworkUses: n("formworkUses"),
    sheetWidth: n("sheetWidth"),
    sheetLength: n("sheetLength"),
    lumberPiecesPerSquareMeter: n("lumberPerSquareMeter"),
    nailsKgPerSquareMeter: n("nailsPerSquareMeter"),
    formworkWastePercentage: n("formworkWastePercentage"),
  };
}

function pricesFrom(v: Values): StructurePrices {
  const n = v.n;
  return {
    cementBag: n("cementPrice"),
    sandCubicMeter: n("sandPrice"),
    gravelCubicMeter: n("gravelPrice"),
    bar: n("barPrice"),
    tieWireKg: n("tieWirePrice"),
    sheet: n("sheetPrice"),
    lumberPiece: n("lumberPrice"),
    nailKg: n("nailPrice"),
    laborConcreteCubicMeter: n("laborConcretePrice"),
    laborRebarKg: n("laborRebarPrice"),
    laborFormworkSquareMeter: n("laborFormworkPrice"),
  };
}

const volumeOf = (v: Values) => calculateStructure(inputFrom(v), pricesFrom(v))?.concreteVolume ?? 0;

export const estructuraConfig: CalculatorConfig<StructureResult> = {
  id: "structure",
  settingsKey: "calculator.estructura",
  title: "Estructura",
  subtitle: "Zapatas, columnas, vigas y losa: concreto, acero y encofrado juntos.",
  icon: "business-outline",
  calculateLabel: "Calcular estructura",
  defaults: {
    footingCount: "", footingLength: "1", footingWidth: "1", footingHeight: "0.40",
    columnCount: "", columnWidthCm: "20", columnDepthCm: "20", columnHeight: "",
    beamLength: "", beamWidthCm: "20", beamHeightCm: "30", slabArea: "", slabThickness: "0.12",
    footingRebarKgM3: "60", columnRebarKgM3: "140", beamRebarKgM3: "120", slabRebarKgM3: "80",
    mixCement: "1", mixSand: "2", mixGravel: "3", cementBagWeight: "42.5",
    concreteWastePercentage: "5", barSize: "4", barPieceLength: "9.14", rebarWastePercentage: "5",
    tieWireKgPer100Kg: "1.5", formworkUses: "4", sheetWidth: "1.22", sheetLength: "2.44",
    lumberPerSquareMeter: "1", nailsPerSquareMeter: "0.15", formworkWastePercentage: "10",
    cementPrice: "", sandPrice: "", gravelPrice: "", barPrice: "", tieWirePrice: "",
    sheetPrice: "", lumberPrice: "", nailPrice: "", laborConcretePrice: "", laborRebarPrice: "",
    laborFormworkPrice: "",
  },
  flagDefaults: { includeFormwork: true },
  sections: [
    {
      title: "Zapatas",
      fields: [
        { key: "footingCount", label: "Cantidad", unit: "und." },
        { key: "footingLength", label: "Largo", unit: "m", persist: true },
        { key: "footingWidth", label: "Ancho", unit: "m", persist: true },
        { key: "footingHeight", label: "Espesor", unit: "m", persist: true },
      ],
    },
    {
      title: "Columnas",
      fields: [
        { key: "columnCount", label: "Cantidad", unit: "und." },
        { key: "columnWidthCm", label: "Ancho", unit: "cm", persist: true },
        { key: "columnDepthCm", label: "Fondo", unit: "cm", persist: true },
        { key: "columnHeight", label: "Altura", unit: "m" },
      ],
    },
    {
      title: "Vigas y losa",
      fields: [
        { key: "beamLength", label: "Largo total de vigas", unit: "m" },
        { key: "beamWidthCm", label: "Ancho de viga", unit: "cm", persist: true },
        { key: "beamHeightCm", label: "Peralte de viga", unit: "cm", persist: true },
        { key: "slabArea", label: "Área de losa", unit: "m²" },
        { key: "slabThickness", label: "Espesor de losa", unit: "m", persist: true },
      ],
      info: (v) => {
        const volume = volumeOf(v);
        return volume > 0 ? `Concreto total: ${volume.toFixed(2)} m³.` : null;
      },
    },
    {
      title: "Concreto y acero",
      description: "La cuantía es el acero de referencia por m³ de concreto. Confírmala con tus planos.",
      fields: [
        { key: "mixCement", label: "Mezcla: cemento", unit: "parte", persist: true },
        { key: "mixSand", label: "Mezcla: arena", unit: "partes", persist: true },
        { key: "mixGravel", label: "Mezcla: piedra", unit: "partes", persist: true },
        { key: "cementBagWeight", label: "Peso del saco de cemento", unit: "kg", persist: true },
        { key: "concreteWastePercentage", label: "Desperdicio de concreto", unit: "%", persist: true },
        { key: "footingRebarKgM3", label: "Acero en zapatas", unit: "kg/m³", persist: true },
        { key: "columnRebarKgM3", label: "Acero en columnas", unit: "kg/m³", persist: true },
        { key: "beamRebarKgM3", label: "Acero en vigas", unit: "kg/m³", persist: true },
        { key: "slabRebarKgM3", label: "Acero en losa", unit: "kg/m³", persist: true },
        { key: "barSize", label: "Varilla de compra", persist: true, options: BAR_SIZES },
        { key: "barPieceLength", label: "Largo de la varilla", unit: "m", persist: true },
        { key: "rebarWastePercentage", label: "Desperdicio de acero", unit: "%", persist: true },
        { key: "tieWireKgPer100Kg", label: "Alambre de amarre", unit: "kg/100 kg", persist: true },
      ],
    },
    {
      title: "Encofrado",
      fields: [
        { key: "formworkUses", label: "Usos de la formaleta", unit: "veces", persist: true },
        { key: "sheetWidth", label: "Ancho del plywood", unit: "m", persist: true },
        { key: "sheetLength", label: "Largo del plywood", unit: "m", persist: true },
        { key: "lumberPerSquareMeter", label: "Reglas de madera por m²", unit: "und.", persist: true },
        { key: "nailsPerSquareMeter", label: "Clavos por m² por uso", unit: "kg", persist: true },
        { key: "formworkWastePercentage", label: "Desperdicio de formaleta", unit: "%", persist: true },
      ],
      toggles: [{ key: "includeFormwork", title: "Incluir encofrado" }],
    },
  ],
  prices: [
    { key: "cementPrice", label: "Cemento", unit: "por saco", kind: "material", keywords: /cemento/, showWhen: (v) => volumeOf(v) > 0 },
    { key: "sandPrice", label: "Arena", unit: "por m³", kind: "material", keywords: /arena/ },
    { key: "gravelPrice", label: "Piedra", unit: "por m³", kind: "material", keywords: /piedra|gravilla|grava/ },
    { key: "barPrice", label: "Varilla de acero", unit: "por pieza", kind: "material", keywords: /varilla/ },
    { key: "tieWirePrice", label: "Alambre de amarre", unit: "por kg", kind: "material", keywords: /alambre.*(amarre|recocido)|recocido/ },
    { key: "sheetPrice", label: "Plywood", unit: "por lámina", kind: "material", keywords: /plywood|formaleta|fenolico/, showWhen: (v) => Boolean(v.flags.includeFormwork) },
    { key: "lumberPrice", label: "Regla de madera", unit: "por pieza", kind: "material", keywords: /madera|regla|2x4/, showWhen: (v) => Boolean(v.flags.includeFormwork) },
    { key: "nailPrice", label: "Clavos", unit: "por kg", kind: "material", keywords: /clavo/, showWhen: (v) => Boolean(v.flags.includeFormwork) },
    { key: "laborConcretePrice", label: "Colado de concreto", unit: "por m³", kind: "labor", keywords: /concreto|colado|vaciado/ },
    { key: "laborRebarPrice", label: "Armado de acero", unit: "por kg", kind: "labor", keywords: /armado.*acero|acero.*armado/ },
    { key: "laborFormworkPrice", label: "Armado y desarmado de formaleta", unit: "por m²", kind: "labor", keywords: /encofrado|formaleta/, showWhen: (v) => Boolean(v.flags.includeFormwork) },
  ],
  validate: (v) => {
    if (volumeOf(v) <= 0) return "Escribe al menos un elemento (zapatas, columnas, vigas o losa).";
    if (v.n("mixCement") <= 0 || v.n("mixSand") <= 0 || v.n("mixGravel") < 0) return "Revisa la mezcla: cemento y arena deben ser mayores que 0.";
    if (v.n("barPieceLength") <= 0) return "Escribe el largo de la varilla.";
    if (v.flags.includeFormwork && (v.n("sheetWidth") <= 0 || v.n("sheetLength") <= 0)) return "Escribe el ancho y el largo del plywood.";
    return null;
  },
  compute: (v) => {
    const result = calculateStructure(inputFrom(v), pricesFrom(v));
    if (!result) throw new Error("Estructura sin elementos");
    return result;
  },
  resultRows: (r) => {
    const rows = [
      { label: "Concreto total", value: `${r.concreteVolume.toFixed(2)} m³`, strong: true },
      { label: "Cemento", value: `${r.concrete.cementBagsToBuy} sacos` },
      { label: "Arena", value: `${r.concrete.sandVolume.toFixed(2)} m³` },
      { label: "Piedra", value: `${r.concrete.gravelVolume.toFixed(2)} m³` },
      { label: "Acero", value: `${r.steelKg.toFixed(0)} kg · ${r.barPieces} varillas` },
      { label: "Alambre de amarre", value: `${r.tieWireKg.toFixed(1)} kg` },
    ];
    if (r.formwork.totalArea) {
      rows.push({ label: "Encofrado", value: `${r.formwork.totalArea.toFixed(2)} m² · ${r.formwork.sheets} láminas` });
    }
    return rows;
  },
  buildLine: (r, c) =>
    makeLine({
      description: "Estructura de concreto armado",
      unit: "m³",
      quantity: Number(r.concreteVolume.toFixed(2)),
      total: r.totalCost,
      costTotal: c.totalCost,
      materials: compactMaterials([
        material("Cemento", r.concrete.cementBagsToBuy, "saco", c.concrete.cementCost),
        material("Arena", Number(r.concrete.sandVolume.toFixed(2)), "m³", c.concrete.sandCost),
        material("Piedra", Number(r.concrete.gravelVolume.toFixed(2)), "m³", c.concrete.gravelCost),
        material("Varilla de acero", r.barPieces, "und.", c.barCost),
        material("Alambre de amarre", Number(r.tieWireKg.toFixed(1)), "kg", c.tieWireCost),
        material("Plywood", r.formwork.sheets, "lám.", c.formwork.sheetCost),
        material("Regla de madera", r.formwork.lumberPieces, "und.", c.formwork.lumberCost),
        material("Clavos", Number(r.formwork.nailsKg.toFixed(1)), "kg", c.formwork.nailCost),
      ]),
      notes: `${r.concreteVolume.toFixed(2)} m³ de concreto · ${r.steelKg.toFixed(0)} kg de acero`,
    }),
};
