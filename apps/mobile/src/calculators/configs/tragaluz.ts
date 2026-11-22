import {
  compactMaterials,
  makeLine,
  material,
  type CalculatorConfig,
  type ResultRow,
  type Values,
} from "@/components/calculators/CalculatorScreen";
import {
  calculateSkylights,
  type SkylightInput,
  type SkylightPrices,
  type SkylightResult,
} from "@/utils/exterior-works-calculations";

const hasSkylight = (v: Values) => v.n("units") > 0 && v.n("width") > 0 && v.n("length") > 0;

function inputFrom(v: Values): SkylightInput {
  return {
    units: v.n("units"),
    width: v.n("width"),
    length: v.n("length"),
    panelWastePercentage: v.n("panelWastePercentage"),
    crossbarSpacing: v.n("crossbarSpacing"),
    profilePieceLength: v.n("profilePieceLength"),
    profileWastePercentage: v.n("profileWastePercentage"),
    metersPerSealantCartridge: v.n("metersPerSealantCartridge"),
    screwsPerSquareMeter: v.n("screwsPerSquareMeter"),
    screwsPerBox: v.n("screwsPerBox"),
    flashingPieceLength: v.flags.includeFlashing ? v.n("flashingPieceLength") : 0,
  };
}

function pricesFrom(v: Values): SkylightPrices {
  return {
    panelSquareMeter: v.n("panelPrice"),
    profilePiece: v.n("profilePrice"),
    sealantCartridge: v.n("sealantPrice"),
    screwBox: v.n("screwPrice"),
    flashingPiece: v.n("flashingPrice"),
    laborUnit: v.n("laborPrice"),
  };
}

export const tragaluzConfig: CalculatorConfig<SkylightResult> = {
  id: "skylight",
  settingsKey: "calculator.tragaluz",
  title: "Tragaluces y claraboyas",
  subtitle: "Panel de policarbonato, perfiles del marco, sellador, tornillos y botaguas.",
  icon: "sunny-outline",
  calculateLabel: "Calcular tragaluces",
  defaults: {
    units: "1", width: "", length: "", panelWastePercentage: "10", crossbarSpacing: "0.60",
    profilePieceLength: "6", profileWastePercentage: "5", metersPerSealantCartridge: "6",
    screwsPerSquareMeter: "8", screwsPerBox: "100", flashingPieceLength: "3",
    panelPrice: "", profilePrice: "", sealantPrice: "", screwPrice: "", flashingPrice: "", laborPrice: "",
  },
  flagDefaults: { includeFlashing: true },
  sections: [
    {
      title: "Tragaluces",
      description: "Todos del mismo tamaño. Para medidas distintas, haz un cálculo por tamaño.",
      fields: [
        { key: "units", label: "Cantidad", unit: "und." },
        { key: "width", label: "Ancho de cada uno", unit: "m" },
        { key: "length", label: "Largo de cada uno", unit: "m" },
        { key: "panelWastePercentage", label: "Desperdicio de panel", unit: "%", persist: true },
      ],
      info: (v) => {
        if (!hasSkylight(v)) return null;
        const r = calculateSkylights(inputFrom(v), pricesFrom(v));
        return r.totalArea ? `${r.totalArea.toFixed(2)} m² de tragaluz en total.` : null;
      },
    },
    {
      title: "Marco y sellado",
      fields: [
        { key: "crossbarSpacing", label: "Travesaños cada", unit: "m", persist: true },
        { key: "profilePieceLength", label: "Largo del perfil comprado", unit: "m", persist: true },
        { key: "profileWastePercentage", label: "Desperdicio de perfil", unit: "%", persist: true },
        { key: "metersPerSealantCartridge", label: "Metros por cartucho de sellador", unit: "m", persist: true },
        { key: "screwsPerSquareMeter", label: "Tornillos por m²", unit: "und.", persist: true },
        { key: "screwsPerBox", label: "Tornillos por caja", unit: "und.", persist: true },
      ],
    },
    {
      title: "Botaguas",
      fields: [{ key: "flashingPieceLength", label: "Largo de cada pieza", unit: "m", persist: true }],
      toggles: [{ key: "includeFlashing", title: "Incluir botaguas alrededor" }],
    },
  ],
  prices: [
    { key: "panelPrice", label: "Panel de policarbonato", unit: "por m²", kind: "material", keywords: /policarbonato/, showWhen: hasSkylight },
    { key: "profilePrice", label: "Perfil de aluminio del marco", unit: "por pieza", kind: "material", keywords: /perfil.*(aluminio|tragaluz)|tragaluz/ },
    { key: "sealantPrice", label: "Sellador", unit: "por cartucho", kind: "material", keywords: /sellador.*(poliuretano|silicon)|silicon|poliuretano/ },
    { key: "screwPrice", label: "Tornillos con arandela", unit: "por caja", kind: "material", keywords: /tornillo.*arandela/ },
    { key: "flashingPrice", label: "Botaguas", unit: "por pieza", kind: "material", keywords: /botaguas/, showWhen: (v) => Boolean(v.flags.includeFlashing) },
    { key: "laborPrice", label: "Instalación de tragaluz", unit: "por unidad", kind: "labor", keywords: /tragaluz|claraboya/ },
  ],
  validate: (v) => {
    if (!hasSkylight(v)) return "Escribe la cantidad, el ancho y el largo del tragaluz.";
    if (v.n("profilePieceLength") <= 0) return "Escribe el largo del perfil comprado.";
    if (v.n("metersPerSealantCartridge") <= 0) return "Escribe los metros por cartucho de sellador.";
    if (v.n("screwsPerBox") <= 0) return "Escribe los tornillos por caja.";
    if (v.flags.includeFlashing && v.n("flashingPieceLength") <= 0) return "Escribe el largo de cada pieza de botaguas.";
    return null;
  },
  compute: (v) => {
    const result = calculateSkylights(inputFrom(v), pricesFrom(v));
    if (!result.totalArea) throw new Error("Tragaluz sin medidas");
    return result;
  },
  resultRows: (r) => {
    const rows: ResultRow[] = [
      { label: "Área de tragaluz", value: `${r.totalArea.toFixed(2)} m²`, strong: true },
      { label: "Panel a comprar", value: `${r.panelArea.toFixed(2)} m²` },
      { label: "Perfil del marco", value: `${r.profileMeters.toFixed(1)} m · ${r.profilePieces} piezas` },
      { label: "Sellador", value: `${r.sealantCartridges} cartuchos` },
      { label: "Tornillos", value: `${r.screwBoxes} cajas` },
    ];
    if (r.flashingPieces) rows.push({ label: "Botaguas", value: `${r.flashingPieces} piezas` });
    return rows;
  },
  buildLine: (r, c, v) =>
    makeLine({
      description: "Tragaluz de policarbonato con marco de aluminio",
      unit: "und.",
      quantity: v.n("units"),
      total: r.totalCost,
      costTotal: c.totalCost,
      materials: compactMaterials([
        material("Panel de policarbonato", Number(r.panelArea.toFixed(2)), "m²", c.panelCost),
        material("Perfil de aluminio", r.profilePieces, "und.", c.profileCost),
        material("Sellador", r.sealantCartridges, "cartucho", c.sealantCost),
        material("Tornillos con arandela", r.screwBoxes, "caja", c.screwCost),
        material("Botaguas", r.flashingPieces, "und.", c.flashingCost),
      ]),
      notes: `${r.totalArea.toFixed(2)} m² en total`,
    }),
};
