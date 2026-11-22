import {
  compactMaterials,
  makeLine,
  material,
  type CalculatorConfig,
  type ResultRow,
  type Values,
} from "@/components/calculators/CalculatorScreen";
import {
  calculateReinforcedMasonry,
  type ReinforcedMasonryInput,
  type ReinforcedMasonryPrices,
  type ReinforcedMasonryResult,
} from "@/utils/masonry-gypsum-extras-calculations";

const hasWall = (v: Values) => v.n("wallLength") > 0 && v.n("wallHeight") > 0;

/** Volumen de relleno por metro de celda llena, según el espesor del bloque. */
const CELL_FILL_PER_METER: Record<string, number> = { "4": 0.0035, "6": 0.009, "8": 0.0155 };
const BLOCK_PRICE_KEY: Record<string, string> = { "4": "block4Price", "6": "block6Price", "8": "block8Price" };

function inputFrom(v: Values): ReinforcedMasonryInput {
  return {
    wallLength: v.n("wallLength"),
    wallHeight: v.n("wallHeight"),
    openingsArea: v.n("openingsArea"),
    blockLength: v.n("blockLength"),
    blockHeight: v.n("blockHeight"),
    blockWastePercentage: v.n("blockWastePercentage"),
    layingMortarPerSquareMeter: v.n("layingMortarPerSquareMeter"),
    mortarCement: v.n("mortarCement"),
    mortarSand: v.n("mortarSand"),
    groutCement: v.n("groutCement"),
    groutSand: v.n("groutSand"),
    groutGravel: v.n("groutGravel"),
    cementBagWeight: v.n("cementBagWeight"),
    verticalSpacing: v.n("verticalSpacing"),
    anchorLength: v.n("anchorLength"),
    horizontalEveryCourses: v.n("horizontalEveryCourses"),
    cellFillPerMeter: CELL_FILL_PER_METER[String(v.form.blockThickness)] ?? 0.009,
    groutWastePercentage: v.n("groutWastePercentage"),
    barSize: v.n("barSize"),
    barPieceLength: v.n("barPieceLength"),
    rebarWastePercentage: v.n("rebarWastePercentage"),
    includeRebar: Boolean(v.flags.includeRebar),
  };
}

function pricesFrom(v: Values): ReinforcedMasonryPrices {
  return {
    blockUnit: v.n(BLOCK_PRICE_KEY[String(v.form.blockThickness)] ?? "block6Price"),
    cementBag: v.n("cementPrice"),
    sandCubicMeter: v.n("sandPrice"),
    gravelCubicMeter: v.n("gravelPrice"),
    bar: v.n("barPrice"),
    laborSquareMeter: v.n("laborPrice"),
    laborRebarKg: v.n("laborRebarPrice"),
  };
}

const blockIs = (size: string) => (v: Values) => String(v.form.blockThickness) === size;

export const muroBloquesReforzadoConfig: CalculatorConfig<ReinforcedMasonryResult> = {
  id: "reinforced-masonry",
  settingsKey: "calculator.muro-bloques-reforzado",
  title: "Muro de bloques reforzado",
  subtitle: "Bloques por tamaño, mortero, celdas rellenas y varillas verticales y horizontales.",
  icon: "apps-outline",
  calculateLabel: "Calcular muro",
  defaults: {
    wallLength: "", wallHeight: "", openingsArea: "0", blockThickness: "6", blockLength: "0.40",
    blockHeight: "0.20", blockWastePercentage: "5", layingMortarPerSquareMeter: "0.015",
    mortarCement: "1", mortarSand: "4", groutCement: "1", groutSand: "2", groutGravel: "3",
    cementBagWeight: "42.5", verticalSpacing: "0.80", anchorLength: "0.40", horizontalEveryCourses: "3",
    groutWastePercentage: "10", barSize: "4", barPieceLength: "9.14", rebarWastePercentage: "5",
    block4Price: "", block6Price: "", block8Price: "", cementPrice: "", sandPrice: "", gravelPrice: "",
    barPrice: "", laborPrice: "", laborRebarPrice: "",
  },
  flagDefaults: { includeRebar: true },
  sections: [
    {
      title: "Muro",
      description: "Resta puertas y ventanas en vanos. El espesor del bloque define su precio y el relleno de cada celda.",
      fields: [
        { key: "wallLength", label: "Largo del muro", unit: "m" },
        { key: "wallHeight", label: "Altura del muro", unit: "m" },
        { key: "openingsArea", label: "Vanos a descontar", unit: "m²" },
        {
          key: "blockThickness", label: "Bloque", persist: true,
          options: [
            { value: "4", label: '4"' },
            { value: "6", label: '6"' },
            { value: "8", label: '8"' },
          ],
        },
        { key: "blockLength", label: "Largo del bloque", unit: "m", persist: true },
        { key: "blockHeight", label: "Alto del bloque", unit: "m", persist: true },
        { key: "blockWastePercentage", label: "Desperdicio de bloques", unit: "%", persist: true },
      ],
      info: (v) => {
        if (!hasWall(v)) return null;
        const r = calculateReinforcedMasonry(inputFrom(v), pricesFrom(v));
        return r.netWallArea ? `${r.netWallArea.toFixed(2)} m² netos · ${r.blocksToBuy} bloques.` : null;
      },
    },
    {
      title: "Mortero y relleno",
      description: "Mezclas en partes por volumen. El relleno de celdas lleva piedra.",
      fields: [
        { key: "layingMortarPerSquareMeter", label: "Mortero de pega por m²", unit: "m³", persist: true },
        { key: "mortarCement", label: "Pega: cemento", unit: "parte", persist: true },
        { key: "mortarSand", label: "Pega: arena", unit: "partes", persist: true },
        { key: "groutCement", label: "Relleno: cemento", unit: "parte", persist: true },
        { key: "groutSand", label: "Relleno: arena", unit: "partes", persist: true },
        { key: "groutGravel", label: "Relleno: piedra", unit: "partes", persist: true },
        { key: "cementBagWeight", label: "Peso del saco de cemento", unit: "kg", persist: true },
        { key: "groutWastePercentage", label: "Desperdicio de relleno", unit: "%", persist: true },
      ],
    },
    {
      title: "Refuerzo",
      description: "Una varilla en cada celda rellena. Confirma la separación y el diámetro con tus planos.",
      fields: [
        { key: "verticalSpacing", label: "Separación de varillas verticales", unit: "m", persist: true },
        { key: "anchorLength", label: "Anclaje por varilla", unit: "m", persist: true },
        { key: "horizontalEveryCourses", label: "Refuerzo horizontal cada (0 = sin)", unit: "hileras", persist: true },
        {
          key: "barSize", label: "Varilla de compra", persist: true,
          options: [3, 4, 5].map((n) => ({ value: String(n), label: `#${n}` })),
        },
        { key: "barPieceLength", label: "Largo de la varilla", unit: "m", persist: true },
        { key: "rebarWastePercentage", label: "Desperdicio de acero", unit: "%", persist: true },
      ],
      toggles: [{ key: "includeRebar", title: "Incluir varillas de refuerzo" }],
    },
  ],
  prices: [
    { key: "block4Price", label: 'Bloque de 4"', unit: "por unidad", kind: "material", keywords: /bloque de concreto de 4/, showWhen: blockIs("4") },
    { key: "block6Price", label: 'Bloque de 6"', unit: "por unidad", kind: "material", keywords: /bloque de concreto de 6/, showWhen: blockIs("6") },
    { key: "block8Price", label: 'Bloque de 8"', unit: "por unidad", kind: "material", keywords: /bloque de concreto de 8/, showWhen: blockIs("8") },
    { key: "cementPrice", label: "Cemento", unit: "por saco", kind: "material", keywords: /cemento/ },
    { key: "sandPrice", label: "Arena", unit: "por m³", kind: "material", keywords: /arena/ },
    { key: "gravelPrice", label: "Piedra", unit: "por m³", kind: "material", keywords: /piedra|gravilla|grava/ },
    { key: "barPrice", label: "Varilla de acero", unit: "por pieza", kind: "material", keywords: /varilla/, showWhen: (v) => Boolean(v.flags.includeRebar) },
    { key: "laborPrice", label: "Colocación de bloques", unit: "por m²", kind: "labor", keywords: /colocacion.*bloque|bloques/ },
    { key: "laborRebarPrice", label: "Armado de acero", unit: "por kg", kind: "labor", keywords: /armado.*acero|acero.*armado/, showWhen: (v) => Boolean(v.flags.includeRebar) },
  ],
  validate: (v) => {
    if (!hasWall(v)) return "Escribe el largo y la altura del muro.";
    if (v.n("blockLength") <= 0 || v.n("blockHeight") <= 0) return "Escribe las medidas del bloque.";
    if (v.n("mortarCement") <= 0 || v.n("mortarSand") <= 0 || v.n("groutCement") <= 0 || v.n("groutSand") <= 0) {
      return "Revisa las mezclas: cemento y arena deben ser mayores que 0.";
    }
    if (v.n("verticalSpacing") <= 0) return "Escribe la separación de las varillas verticales.";
    if (v.flags.includeRebar && v.n("barPieceLength") <= 0) return "Escribe el largo de la varilla.";
    return null;
  },
  compute: (v) => {
    const result = calculateReinforcedMasonry(inputFrom(v), pricesFrom(v));
    if (!result.netWallArea) throw new Error("Muro sin área");
    return result;
  },
  resultRows: (r) => {
    const rows: ResultRow[] = [
      { label: "Área neta", value: `${r.netWallArea.toFixed(2)} m²`, strong: true },
      { label: "Bloques", value: `${r.blocksToBuy} unidades` },
      { label: "Cemento", value: `${r.cementBagsToBuy} sacos` },
      { label: "Arena", value: `${r.sandVolume.toFixed(2)} m³` },
      { label: "Piedra", value: `${r.gravelVolume.toFixed(2)} m³` },
      { label: "Celdas rellenas", value: `${r.filledCells} · ${r.groutVolume.toFixed(2)} m³` },
    ];
    if (r.barPieces) rows.push({ label: "Acero", value: `${r.steelKg.toFixed(0)} kg · ${r.barPieces} varillas` });
    return rows;
  },
  buildLine: (r, c, v) => {
    const size = String(v.form.blockThickness);
    return makeLine({
      description: `Muro de bloques de ${size}" reforzado y relleno`,
      unit: "m²",
      quantity: Number(r.netWallArea.toFixed(2)),
      total: r.totalCost,
      costTotal: c.totalCost,
      materials: compactMaterials([
        material(`Bloque de ${size}"`, r.blocksToBuy, "und.", c.blockCost),
        material("Cemento", r.cementBagsToBuy, "saco", c.cementCost),
        material("Arena", Number(r.sandVolume.toFixed(2)), "m³", c.sandCost),
        material("Piedra", Number(r.gravelVolume.toFixed(2)), "m³", c.gravelCost),
        material("Varilla de acero", r.barPieces, "und.", c.barCost),
      ]),
      notes: `${r.filledCells} celdas rellenas · ${r.steelKg.toFixed(0)} kg de acero`,
    });
  },
};
