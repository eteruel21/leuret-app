import {
  compactMaterials,
  makeLine,
  material,
  type CalculatorConfig,
  type ResultRow,
  type Values,
} from "@/components/calculators/CalculatorScreen";
import {
  calculateWallTiling,
  type WallTilingInput,
  type WallTilingPrices,
  type WallTilingResult,
} from "@/utils/tiling-steel-calculations";

const hasWall = (v: Values) => v.n("wallLength") * v.n("height") + v.n("extraArea") > 0;

function inputFrom(v: Values): WallTilingInput {
  return {
    wallLength: v.n("wallLength"),
    height: v.n("height"),
    extraArea: v.n("extraArea"),
    openingsArea: v.n("openingsArea"),
    boxArea: v.n("boxArea"),
    wastePercentage: v.n("wastePercentage"),
    adhesiveKgPerSquareMeter: v.n("adhesiveKgPerSquareMeter"),
    adhesiveBagKg: v.n("adhesiveBagKg"),
    groutKgPerSquareMeter: v.n("groutKgPerSquareMeter"),
    groutBagKg: v.n("groutBagKg"),
    spacersPerSquareMeter: v.n("spacersPerSquareMeter"),
    spacersPerBag: v.n("spacersPerBag"),
    trimLength: v.flags.includeTrim ? v.n("trimLength") : 0,
    trimPieceLength: v.n("trimPieceLength"),
  };
}

function pricesFrom(v: Values): WallTilingPrices {
  return {
    tileSquareMeter: v.n("tilePrice"),
    adhesiveBag: v.n("adhesivePrice"),
    groutBag: v.n("groutPrice"),
    spacerBag: v.n("spacerPrice"),
    trimPiece: v.n("trimPrice"),
    laborSquareMeter: v.n("laborPrice"),
  };
}

export const enchapeConfig: CalculatorConfig<WallTilingResult> = {
  id: "wall-tiling",
  settingsKey: "calculator.enchape",
  title: "Enchape de paredes",
  subtitle: "Azulejo, pegamento, boquilla, crucetas y esquineros para baños y cocinas.",
  icon: "grid-outline",
  calculateLabel: "Calcular enchape",
  defaults: {
    wallLength: "", height: "2.40", extraArea: "0", openingsArea: "0", boxArea: "1.44", wastePercentage: "10",
    adhesiveKgPerSquareMeter: "5", adhesiveBagKg: "20", groutKgPerSquareMeter: "0.4", groutBagKg: "5",
    spacersPerSquareMeter: "25", spacersPerBag: "100", trimLength: "0", trimPieceLength: "2.5",
    tilePrice: "", adhesivePrice: "", groutPrice: "", spacerPrice: "", trimPrice: "", laborPrice: "",
  },
  flagDefaults: { includeTrim: false },
  sections: [
    {
      title: "Paredes a enchapar",
      description: "Suma el largo de todas las paredes. Resta puertas y ventanas en vanos.",
      fields: [
        { key: "wallLength", label: "Largo total de paredes", unit: "m" },
        { key: "height", label: "Altura del enchape", unit: "m" },
        { key: "extraArea", label: "Otras áreas (frentes, mesones)", unit: "m²" },
        { key: "openingsArea", label: "Vanos a descontar", unit: "m²" },
      ],
      info: (v) => {
        if (!hasWall(v)) return null;
        const r = calculateWallTiling(inputFrom(v), pricesFrom(v));
        return r.netArea ? `Área neta a enchapar: ${r.netArea.toFixed(2)} m².` : null;
      },
    },
    {
      title: "Azulejo y materiales",
      fields: [
        { key: "boxArea", label: "Área por caja (0 = por m²)", unit: "m²", persist: true },
        { key: "wastePercentage", label: "Desperdicio de azulejo", unit: "%", persist: true },
        { key: "adhesiveKgPerSquareMeter", label: "Pegamento por m²", unit: "kg", persist: true },
        { key: "adhesiveBagKg", label: "Peso del saco de pegamento", unit: "kg", persist: true },
        { key: "groutKgPerSquareMeter", label: "Boquilla por m²", unit: "kg", persist: true },
        { key: "groutBagKg", label: "Peso de la bolsa de boquilla", unit: "kg", persist: true },
        { key: "spacersPerSquareMeter", label: "Crucetas por m²", unit: "und.", persist: true },
        { key: "spacersPerBag", label: "Crucetas por bolsa", unit: "und.", persist: true },
      ],
    },
    {
      title: "Esquineros",
      fields: [
        { key: "trimLength", label: "Largo de esquinas y remates", unit: "m" },
        { key: "trimPieceLength", label: "Largo de cada esquinero", unit: "m", persist: true },
      ],
      toggles: [{ key: "includeTrim", title: "Incluir esquineros o guardacantos" }],
    },
  ],
  prices: [
    { key: "tilePrice", label: "Azulejo de pared", unit: "por m²", kind: "material", keywords: /azulejo|ceramica de pared|enchape/, showWhen: hasWall },
    { key: "adhesivePrice", label: "Pegamento para cerámica", unit: "por saco", kind: "material", keywords: /pegamento.*ceramica|adhesivo.*ceramica/ },
    { key: "groutPrice", label: "Boquilla", unit: "por bolsa", kind: "material", keywords: /boquilla|fragua/ },
    { key: "spacerPrice", label: "Crucetas", unit: "por bolsa", kind: "material", keywords: /crucetas/ },
    { key: "trimPrice", label: "Esquinero de enchape", unit: "por pieza", kind: "material", keywords: /esquinero.*(enchape|azulejo|ceramica)|guardacanto/, showWhen: (v) => Boolean(v.flags.includeTrim) },
    { key: "laborPrice", label: "Colocación de azulejo", unit: "por m²", kind: "labor", keywords: /colocacion.*(ceramica|azulejo|porcelanato)/ },
  ],
  validate: (v) => {
    if (!hasWall(v)) return "Escribe el largo y la altura de las paredes.";
    if (v.n("adhesiveBagKg") <= 0 || v.n("groutBagKg") <= 0 || v.n("spacersPerBag") <= 0) {
      return "Revisa el tamaño de los empaques de pegamento, boquilla y crucetas.";
    }
    if (v.flags.includeTrim && v.n("trimPieceLength") <= 0) return "Escribe el largo de cada esquinero.";
    return null;
  },
  compute: (v) => {
    const result = calculateWallTiling(inputFrom(v), pricesFrom(v));
    if (!result.netArea) throw new Error("Los vanos cubren toda el área");
    return result;
  },
  resultRows: (r) => {
    const rows: ResultRow[] = [
      { label: "Área neta", value: `${r.netArea.toFixed(2)} m²`, strong: true },
      { label: "Azulejo a comprar", value: r.boxes ? `${r.boxes} cajas · ${r.buyArea.toFixed(2)} m²` : `${r.buyArea.toFixed(2)} m²` },
      { label: "Pegamento", value: `${r.adhesiveBags} sacos` },
      { label: "Boquilla", value: `${r.groutBags} bolsas` },
      { label: "Crucetas", value: `${r.spacerBags} bolsas` },
    ];
    if (r.trimPieces) rows.push({ label: "Esquineros", value: `${r.trimPieces} piezas` });
    return rows;
  },
  buildLine: (r, c) =>
    makeLine({
      description: "Enchape de paredes con azulejo",
      unit: "m²",
      quantity: Number(r.netArea.toFixed(2)),
      total: r.totalCost,
      costTotal: c.totalCost,
      materials: compactMaterials([
        material("Azulejo de pared", Number(r.buyArea.toFixed(2)), "m²", c.tileCost),
        material("Pegamento para cerámica", r.adhesiveBags, "saco", c.adhesiveCost),
        material("Boquilla", r.groutBags, "bolsa", c.groutCost),
        material("Crucetas", r.spacerBags, "bolsa", c.spacerCost),
        material("Esquinero de enchape", r.trimPieces, "und.", c.trimCost),
      ]),
      notes: `${r.netArea.toFixed(2)} m² netos`,
    }),
};
