import {
  compactMaterials,
  makeLine,
  material,
  type CalculatorConfig,
  type ResultRow,
  type Values,
} from "@/components/calculators/CalculatorScreen";
import {
  calculateGypsumWalls,
  type GypsumWallsInput,
  type GypsumWallsPrices,
  type GypsumWallsResult,
} from "@/utils/masonry-gypsum-extras-calculations";

const hasWall = (v: Values) => v.n("wallLength") > 0 && v.n("wallHeight") > 0;

function inputFrom(v: Values): GypsumWallsInput {
  return {
    wallLength: v.n("wallLength"),
    wallHeight: v.n("wallHeight"),
    openingsArea: v.n("openingsArea"),
    doorCount: v.n("doorCount"),
    doorWidth: v.n("doorWidth"),
    sides: Number(v.form.sides) || 2,
    layers: Number(v.form.layers) || 1,
    boardWidth: v.n("boardWidth"),
    boardHeight: v.n("boardHeight"),
    wastePercentage: v.n("wastePercentage"),
    studSpacing: v.n("studSpacing"),
    studPieceLength: v.n("studPieceLength"),
    trackPieceLength: v.n("trackPieceLength"),
    screwsPerBoard: v.n("screwsPerBoard"),
    screwsPerBox: v.n("screwsPerBox"),
    tapePerSquareMeter: v.n("tapePerSquareMeter"),
    tapeRollLength: v.n("tapeRollLength"),
    compoundKgPerSquareMeter: v.n("compoundKgPerSquareMeter"),
    compoundPackageKg: v.n("compoundPackageKg"),
    includeInsulation: Boolean(v.flags.includeInsulation),
    insulationRollArea: v.n("insulationRollArea"),
    cornerLength: v.flags.includeCorners ? v.n("cornerLength") : 0,
    cornerPieceLength: v.n("cornerPieceLength"),
  };
}

function pricesFrom(v: Values): GypsumWallsPrices {
  return {
    board: v.n("boardPrice"),
    stud: v.n("studPrice"),
    track: v.n("trackPrice"),
    screwBox: v.n("screwPrice"),
    tapeRoll: v.n("tapePrice"),
    compoundPackage: v.n("compoundPrice"),
    insulationRoll: v.n("insulationPrice"),
    cornerPiece: v.n("cornerPrice"),
    laborSquareMeter: v.n("laborPrice"),
  };
}

export const paredesGypsumConfig: CalculatorConfig<GypsumWallsResult> = {
  id: "gypsum-walls",
  settingsKey: "calculator.paredes-gypsum",
  title: "Paredes de gypsum completas",
  subtitle: "Una o dos caras y capas, marcos de puerta, aislante y esquineros.",
  icon: "reader-outline",
  calculateLabel: "Calcular paredes",
  defaults: {
    wallLength: "", wallHeight: "2.60", openingsArea: "0", doorCount: "0", doorWidth: "0.90",
    sides: "2", layers: "1", boardWidth: "1.22", boardHeight: "2.44", wastePercentage: "10",
    studSpacing: "0.40", studPieceLength: "3.05", trackPieceLength: "3.05", screwsPerBoard: "28",
    screwsPerBox: "1000", tapePerSquareMeter: "1.4", tapeRollLength: "90", compoundKgPerSquareMeter: "0.5",
    compoundPackageKg: "28", insulationRollArea: "10", cornerLength: "0", cornerPieceLength: "3.05",
    boardPrice: "", studPrice: "", trackPrice: "", screwPrice: "", tapePrice: "", compoundPrice: "",
    insulationPrice: "", cornerPrice: "", laborPrice: "",
  },
  flagDefaults: { includeInsulation: false, includeCorners: false },
  sections: [
    {
      title: "Paredes",
      fields: [
        { key: "wallLength", label: "Largo total de paredes", unit: "m" },
        { key: "wallHeight", label: "Altura de las paredes", unit: "m", persist: true },
        { key: "openingsArea", label: "Vanos a descontar", unit: "m²" },
        { key: "doorCount", label: "Puertas (marco reforzado)", unit: "und." },
        { key: "doorWidth", label: "Ancho de puerta", unit: "m", persist: true },
        {
          key: "sides", label: "Caras con lámina", persist: true,
          options: [{ value: "1", label: "Una cara" }, { value: "2", label: "Dos caras" }],
        },
        {
          key: "layers", label: "Capas por cara", persist: true,
          options: [{ value: "1", label: "Una capa" }, { value: "2", label: "Doble capa" }],
        },
      ],
      info: (v) => {
        if (!hasWall(v)) return null;
        const r = calculateGypsumWalls(inputFrom(v), pricesFrom(v));
        return r.netWallArea ? `${r.netWallArea.toFixed(2)} m² de pared · ${r.finishedArea.toFixed(2)} m² con lámina.` : null;
      },
    },
    {
      title: "Láminas y estructura",
      fields: [
        { key: "boardWidth", label: "Ancho de la lámina", unit: "m", persist: true },
        { key: "boardHeight", label: "Largo de la lámina", unit: "m", persist: true },
        { key: "wastePercentage", label: "Desperdicio de láminas", unit: "%", persist: true },
        { key: "studSpacing", label: "Separación de parales", unit: "m", persist: true },
        { key: "studPieceLength", label: "Largo del paral", unit: "m", persist: true },
        { key: "trackPieceLength", label: "Largo del riel", unit: "m", persist: true },
      ],
    },
    {
      title: "Acabado",
      fields: [
        { key: "screwsPerBoard", label: "Tornillos por lámina", unit: "und.", persist: true },
        { key: "screwsPerBox", label: "Tornillos por caja", unit: "und.", persist: true },
        { key: "tapePerSquareMeter", label: "Cinta por m²", unit: "m", persist: true },
        { key: "tapeRollLength", label: "Largo del rollo de cinta", unit: "m", persist: true },
        { key: "compoundKgPerSquareMeter", label: "Pasta por m²", unit: "kg", persist: true },
        { key: "compoundPackageKg", label: "Peso de la cubeta de pasta", unit: "kg", persist: true },
      ],
    },
    {
      title: "Aislante",
      fields: [{ key: "insulationRollArea", label: "Cobertura por rollo", unit: "m²", persist: true }],
      toggles: [{ key: "includeInsulation", title: "Incluir aislante térmico o acústico" }],
    },
    {
      title: "Esquineros",
      fields: [
        { key: "cornerLength", label: "Largo de esquinas", unit: "m" },
        { key: "cornerPieceLength", label: "Largo del esquinero", unit: "m", persist: true },
      ],
      toggles: [{ key: "includeCorners", title: "Incluir esquineros metálicos" }],
    },
  ],
  prices: [
    { key: "boardPrice", label: "Lámina de gypsum", unit: "por lámina", kind: "material", keywords: /lamina de gypsum|lamina de yeso|placa de yeso|tablaroca|drywall/, showWhen: hasWall },
    { key: "studPrice", label: "Paral (stud)", unit: "por pieza", kind: "material", keywords: /stud|parral|montante/ },
    { key: "trackPrice", label: "Riel (track)", unit: "por pieza", kind: "material", keywords: /track|riel/ },
    { key: "screwPrice", label: "Tornillos para gypsum", unit: "por caja", kind: "material", keywords: /tornillo.*gypsum/ },
    { key: "tapePrice", label: "Cinta para juntas", unit: "por rollo", kind: "material", keywords: /cinta.*(junta|malla|papel)/ },
    { key: "compoundPrice", label: "Pasta para juntas", unit: "por cubeta", kind: "material", keywords: /pasta.*(juntas|gypsum)/ },
    { key: "insulationPrice", label: "Aislante de fibra", unit: "por rollo", kind: "material", keywords: /aislante.*(fibra|pared)|fibra de vidrio/, showWhen: (v) => Boolean(v.flags.includeInsulation) },
    { key: "cornerPrice", label: "Esquinero metálico", unit: "por pieza", kind: "material", keywords: /esquinero.*(gypsum|metalico)/, showWhen: (v) => Boolean(v.flags.includeCorners) },
    { key: "laborPrice", label: "Instalación de pared", unit: "por m²", kind: "labor", keywords: /pared.*gypsum|gypsum.*pared/ },
  ],
  validate: (v) => {
    if (!hasWall(v)) return "Escribe el largo y la altura de las paredes.";
    if (v.n("boardWidth") <= 0 || v.n("boardHeight") <= 0) return "Escribe las medidas de la lámina.";
    if (v.n("studSpacing") <= 0) return "Escribe la separación de los parales.";
    if (v.n("studPieceLength") <= 0 || v.n("trackPieceLength") <= 0) return "Escribe el largo del paral y del riel.";
    return null;
  },
  compute: (v) => {
    const result = calculateGypsumWalls(inputFrom(v), pricesFrom(v));
    if (!result.netWallArea) throw new Error("Paredes sin área");
    return result;
  },
  resultRows: (r) => {
    const rows: ResultRow[] = [
      { label: "Área con lámina", value: `${r.finishedArea.toFixed(2)} m²`, strong: true },
      { label: "Láminas", value: `${r.boardsToBuy} unidades` },
      { label: "Parales", value: `${r.studPieces} piezas (${r.studPositions} posiciones)` },
      { label: "Riel", value: `${r.trackPieces} piezas` },
      { label: "Tornillos", value: `${r.screwBoxes} cajas` },
      { label: "Cinta", value: `${r.tapeRolls} rollos` },
      { label: "Pasta para juntas", value: `${r.compoundPackages} cubetas` },
    ];
    if (r.insulationRolls) rows.push({ label: "Aislante", value: `${r.insulationRolls} rollos` });
    if (r.cornerPieces) rows.push({ label: "Esquineros", value: `${r.cornerPieces} piezas` });
    return rows;
  },
  buildLine: (r, c) =>
    makeLine({
      description: "Paredes de gypsum con estructura metálica",
      unit: "m²",
      quantity: Number(r.netWallArea.toFixed(2)),
      total: r.totalCost,
      costTotal: c.totalCost,
      materials: compactMaterials([
        material("Lámina de gypsum", r.boardsToBuy, "und.", c.boardCost),
        material("Paral (stud)", r.studPieces, "und.", c.studCost),
        material("Riel (track)", r.trackPieces, "und.", c.trackCost),
        material("Tornillos para gypsum", r.screwBoxes, "caja", c.screwCost),
        material("Cinta para juntas", r.tapeRolls, "rollo", c.tapeCost),
        material("Pasta para juntas", r.compoundPackages, "cubeta", c.compoundCost),
        material("Aislante de fibra", r.insulationRolls, "rollo", c.insulationCost),
        material("Esquinero metálico", r.cornerPieces, "und.", c.cornerCost),
      ]),
      notes: `${r.netWallArea.toFixed(2)} m² de pared`,
    }),
};
