import {
  compactMaterials,
  material,
  type PriceDef,
  type ResultRow,
  type SectionDef,
  type Values,
} from "@/components/calculators/CalculatorScreen";
import type {
  ReinforcedParams,
  ReinforcedPrices,
  ReinforcedWork,
} from "@/utils/reinforced-works-calculations";

/** Piezas comunes de las calculadoras de obras de concreto armado (escalera, muro, cisterna). */

const BAR_SIZES = [3, 4, 5, 6].map((size) => ({ value: String(size), label: `#${size}` }));

export const reinforcedFlagDefaults = { includeFormwork: true };

export function reinforcedDefaults(steelKgM3: string, mixGravel = "3"): Record<string, string> {
  return {
    steelKgM3, mixCement: "1", mixSand: "2", mixGravel, cementBagWeight: "42.5",
    concreteWastePercentage: "5", barSize: "4", barPieceLength: "9.14", rebarWastePercentage: "5",
    tieWireKgPer100Kg: "1.5", formworkUses: "4", sheetWidth: "1.22", sheetLength: "2.44",
    lumberPerSquareMeter: "1", nailsPerSquareMeter: "0.15", formworkWastePercentage: "10",
    cementPrice: "", sandPrice: "", gravelPrice: "", barPrice: "", tieWirePrice: "", sheetPrice: "",
    lumberPrice: "", nailPrice: "", laborConcretePrice: "", laborRebarPrice: "", laborFormworkPrice: "",
  };
}

export function reinforcedSections(steelLabel = "Acero de refuerzo"): SectionDef[] {
  return [
    {
      title: "Concreto y acero",
      description: "La cuantía es el acero de referencia por m³ de concreto. Confírmala con tus planos.",
      fields: [
        { key: "mixCement", label: "Mezcla: cemento", unit: "parte", persist: true },
        { key: "mixSand", label: "Mezcla: arena", unit: "partes", persist: true },
        { key: "mixGravel", label: "Mezcla: piedra", unit: "partes", persist: true },
        { key: "cementBagWeight", label: "Peso del saco de cemento", unit: "kg", persist: true },
        { key: "concreteWastePercentage", label: "Desperdicio de concreto", unit: "%", persist: true },
        { key: "steelKgM3", label: steelLabel, unit: "kg/m³", persist: true },
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
  ];
}

export function reinforcedParamsFrom(v: Values): ReinforcedParams {
  const n = v.n;
  return {
    steelKgM3: n("steelKgM3"),
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

export function reinforcedPricesFrom(v: Values): ReinforcedPrices {
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

export function reinforcedPriceDefs(showWhen: (v: Values) => boolean): PriceDef[] {
  const formwork = (v: Values) => Boolean(v.flags.includeFormwork);
  return [
    { key: "cementPrice", label: "Cemento", unit: "por saco", kind: "material", keywords: /cemento/, showWhen },
    { key: "sandPrice", label: "Arena", unit: "por m³", kind: "material", keywords: /arena/ },
    { key: "gravelPrice", label: "Piedra", unit: "por m³", kind: "material", keywords: /piedra|gravilla|grava/ },
    { key: "barPrice", label: "Varilla de acero", unit: "por pieza", kind: "material", keywords: /varilla/ },
    { key: "tieWirePrice", label: "Alambre de amarre", unit: "por kg", kind: "material", keywords: /alambre.*(amarre|recocido)|recocido/ },
    { key: "sheetPrice", label: "Plywood", unit: "por lámina", kind: "material", keywords: /plywood|formaleta|fenolico/, showWhen: formwork },
    { key: "lumberPrice", label: "Regla de madera", unit: "por pieza", kind: "material", keywords: /madera|regla|2x4/, showWhen: formwork },
    { key: "nailPrice", label: "Clavos", unit: "por kg", kind: "material", keywords: /clavo/, showWhen: formwork },
    { key: "laborConcretePrice", label: "Colado de concreto", unit: "por m³", kind: "labor", keywords: /concreto|colado|vaciado/ },
    { key: "laborRebarPrice", label: "Armado de acero", unit: "por kg", kind: "labor", keywords: /armado.*acero|acero.*armado/ },
    { key: "laborFormworkPrice", label: "Armado y desarmado de formaleta", unit: "por m²", kind: "labor", keywords: /encofrado|formaleta/, showWhen: formwork },
  ];
}

export function reinforcedValidate(v: Values): string | null {
  if (v.n("mixCement") <= 0 || v.n("mixSand") <= 0 || v.n("mixGravel") < 0) {
    return "Revisa la mezcla: cemento y arena deben ser mayores que 0.";
  }
  if (v.n("barPieceLength") <= 0) return "Escribe el largo de la varilla.";
  if (v.flags.includeFormwork && (v.n("sheetWidth") <= 0 || v.n("sheetLength") <= 0)) {
    return "Escribe el ancho y el largo del plywood.";
  }
  return null;
}

export function reinforcedRows(r: ReinforcedWork): ResultRow[] {
  const rows: ResultRow[] = [
    { label: "Concreto", value: `${r.volume.toFixed(2)} m³`, strong: true },
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
}

export function reinforcedMaterialLines(r: ReinforcedWork, c: ReinforcedWork) {
  return [
    material("Cemento", r.concrete.cementBagsToBuy, "saco", c.concrete.cementCost),
    material("Arena", Number(r.concrete.sandVolume.toFixed(2)), "m³", c.concrete.sandCost),
    material("Piedra", Number(r.concrete.gravelVolume.toFixed(2)), "m³", c.concrete.gravelCost),
    material("Varilla de acero", r.barPieces, "und.", c.barCost),
    material("Alambre de amarre", Number(r.tieWireKg.toFixed(1)), "kg", c.tieWireCost),
    material("Plywood", r.formwork.sheets, "lám.", c.formwork.sheetCost),
    material("Regla de madera", r.formwork.lumberPieces, "und.", c.formwork.lumberCost),
    material("Clavos", Number(r.formwork.nailsKg.toFixed(1)), "kg", c.formwork.nailCost),
  ];
}

export { compactMaterials };
