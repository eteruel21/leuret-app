import {
  compactMaterials,
  makeLine,
  material,
  type CalculatorConfig,
  type ResultRow,
  type Values,
} from "@/components/calculators/CalculatorScreen";
import {
  calculateSteelFrame,
  type SteelFrameInput,
  type SteelFramePrices,
  type SteelFrameResult,
} from "@/utils/tiling-steel-calculations";

const hasFrame = (v: Values) =>
  v.n("columnCount") * v.n("columnHeight") + v.n("beamLength") + v.n("purlinLength") > 0;

function inputFrom(v: Values): SteelFrameInput {
  return {
    columnCount: v.n("columnCount"),
    columnHeight: v.n("columnHeight"),
    columnKgPerMeter: v.n("columnKgPerMeter"),
    beamLength: v.n("beamLength"),
    beamKgPerMeter: v.n("beamKgPerMeter"),
    purlinLength: v.n("purlinLength"),
    purlinKgPerMeter: v.n("purlinKgPerMeter"),
    memberPieceLength: v.n("memberPieceLength"),
    wastePercentage: v.n("wastePercentage"),
    basePlates: v.n("basePlates"),
    electrodeKgPerSteelKg: v.n("electrodeKgPerSteelKg"),
    includePaint: Boolean(v.flags.includePaint),
    surfaceSquareMetersPerKg: v.n("surfaceSquareMetersPerKg"),
    paintCoats: v.n("paintCoats"),
    paintCoverage: v.n("paintCoverage"),
  };
}

function pricesFrom(v: Values): SteelFramePrices {
  return {
    columnPiece: v.n("columnPrice"),
    beamPiece: v.n("beamPrice"),
    purlinPiece: v.n("purlinPrice"),
    plate: v.n("platePrice"),
    electrodeKg: v.n("electrodePrice"),
    paintGallon: v.n("paintPrice"),
    laborKg: v.n("laborPrice"),
  };
}

export const estructuraMetalicaConfig: CalculatorConfig<SteelFrameResult> = {
  id: "steel-frame",
  settingsKey: "calculator.estructura-metalica",
  title: "Estructura metálica",
  subtitle: "Columnas, vigas y correas en kilos y piezas, con placas base, soldadura y pintura.",
  icon: "construct-outline",
  calculateLabel: "Calcular estructura",
  defaults: {
    columnCount: "", columnHeight: "", columnKgPerMeter: "9.1", beamLength: "0", beamKgPerMeter: "11",
    purlinLength: "0", purlinKgPerMeter: "3.6", memberPieceLength: "6.1", wastePercentage: "5",
    basePlates: "0", electrodeKgPerSteelKg: "0.03", surfaceSquareMetersPerKg: "0.045", paintCoats: "2",
    paintCoverage: "25",
    columnPrice: "", beamPrice: "", purlinPrice: "", platePrice: "", electrodePrice: "", paintPrice: "",
    laborPrice: "",
  },
  flagDefaults: { includePaint: true },
  sections: [
    {
      title: "Miembros de la estructura",
      description: "El peso por metro sale de la ficha del perfil (tubo, viga o canal). Confírmalo con tu proveedor.",
      fields: [
        { key: "columnCount", label: "Cantidad de columnas", unit: "und." },
        { key: "columnHeight", label: "Altura de columnas", unit: "m" },
        { key: "columnKgPerMeter", label: "Peso de la columna", unit: "kg/m", persist: true },
        { key: "beamLength", label: "Largo total de vigas", unit: "m" },
        { key: "beamKgPerMeter", label: "Peso de la viga", unit: "kg/m", persist: true },
        { key: "purlinLength", label: "Largo total de correas", unit: "m" },
        { key: "purlinKgPerMeter", label: "Peso de la correa", unit: "kg/m", persist: true },
        { key: "memberPieceLength", label: "Largo de cada pieza comprada", unit: "m", persist: true },
        { key: "wastePercentage", label: "Desperdicio de corte", unit: "%", persist: true },
        { key: "basePlates", label: "Placas base", unit: "und." },
      ],
      info: (v) => {
        if (!hasFrame(v)) return null;
        const r = calculateSteelFrame(inputFrom(v), pricesFrom(v));
        return r.steelKg ? `Peso total de la estructura: ${r.steelKg.toFixed(0)} kg.` : null;
      },
    },
    {
      title: "Soldadura y pintura",
      fields: [
        { key: "electrodeKgPerSteelKg", label: "Electrodo por kg de acero", unit: "kg", persist: true },
        { key: "surfaceSquareMetersPerKg", label: "Superficie por kg de acero", unit: "m²", persist: true },
        { key: "paintCoats", label: "Manos de pintura", unit: "manos", persist: true },
        { key: "paintCoverage", label: "Rendimiento por galón", unit: "m²", persist: true },
      ],
      toggles: [{ key: "includePaint", title: "Incluir pintura anticorrosiva" }],
    },
  ],
  prices: [
    { key: "columnPrice", label: "Perfil de columna", unit: "por pieza", kind: "material", keywords: /tubo estructural|columna/, showWhen: hasFrame },
    { key: "beamPrice", label: "Perfil de viga", unit: "por pieza", kind: "material", keywords: /viga metalica|perfil.*viga|viga ipe|canal/ },
    { key: "purlinPrice", label: "Correa", unit: "por pieza", kind: "material", keywords: /correa|perfil.*c\b/ },
    { key: "platePrice", label: "Placa base", unit: "por pieza", kind: "material", keywords: /placa base|platina/, showWhen: (v) => v.n("basePlates") > 0 },
    { key: "electrodePrice", label: "Electrodo de soldadura", unit: "por kg", kind: "material", keywords: /electrodo|soldadura/ },
    { key: "paintPrice", label: "Pintura anticorrosiva", unit: "por galón", kind: "material", keywords: /anticorrosiva/, showWhen: (v) => Boolean(v.flags.includePaint) },
    { key: "laborPrice", label: "Fabricación y montaje", unit: "por kg", kind: "labor", keywords: /estructura metalica|soldador|montaje/ },
  ],
  validate: (v) => {
    if (!hasFrame(v)) return "Escribe las columnas, las vigas o las correas de la estructura.";
    if (v.n("memberPieceLength") <= 0) return "Escribe el largo de cada pieza comprada.";
    if (v.flags.includePaint && (v.n("paintCoverage") <= 0 || v.n("paintCoats") <= 0)) {
      return "Escribe el rendimiento de la pintura y las manos.";
    }
    return null;
  },
  compute: (v) => {
    const result = calculateSteelFrame(inputFrom(v), pricesFrom(v));
    if (!result.steelKg) throw new Error("Estructura sin peso");
    return result;
  },
  resultRows: (r) => {
    const rows: ResultRow[] = [
      { label: "Peso de acero", value: `${r.steelKg.toFixed(0)} kg`, strong: true },
      { label: "Columnas", value: `${r.columnPieces} piezas` },
      { label: "Vigas", value: `${r.beamPieces} piezas` },
      { label: "Correas", value: `${r.purlinPieces} piezas` },
      { label: "Electrodo", value: `${r.electrodeKg.toFixed(1)} kg` },
    ];
    if (r.basePlates) rows.push({ label: "Placas base", value: `${r.basePlates} piezas` });
    if (r.paintGallons) rows.push({ label: "Pintura anticorrosiva", value: `${r.paintGallons} galones` });
    return rows;
  },
  buildLine: (r, c) =>
    makeLine({
      description: "Estructura metálica",
      unit: "kg",
      quantity: Number(r.steelKg.toFixed(0)),
      total: r.totalCost,
      costTotal: c.totalCost,
      materials: compactMaterials([
        material("Perfil de columna", r.columnPieces, "und.", c.columnCost),
        material("Perfil de viga", r.beamPieces, "und.", c.beamCost),
        material("Correa", r.purlinPieces, "und.", c.purlinCost),
        material("Placa base", r.basePlates, "und.", c.plateCost),
        material("Electrodo de soldadura", Number(r.electrodeKg.toFixed(1)), "kg", c.electrodeCost),
        material("Pintura anticorrosiva", r.paintGallons, "gal.", c.paintCost),
      ]),
      notes: `${r.steelKg.toFixed(0)} kg de acero`,
    }),
};
