import {
  compactMaterials,
  makeLine,
  material,
  type CalculatorConfig,
  type ResultRow,
  type Values,
} from "@/components/calculators/CalculatorScreen";
import {
  calculateRailing,
  type RailingInput,
  type RailingPrices,
  type RailingResult,
} from "@/utils/exterior-works-calculations";

const hasRailing = (v: Values) => v.n("length") > 0 && v.n("height") > 0;

function inputFrom(v: Values): RailingInput {
  return {
    length: v.n("length"),
    height: v.n("height"),
    postSpacing: v.n("postSpacing"),
    postEmbed: v.n("postEmbed"),
    includeBalusters: Boolean(v.flags.includeBalusters),
    balusterSpacing: v.n("balusterSpacing"),
    railRows: v.n("railRows"),
    handrailRuns: v.flags.includeHandrail ? v.n("handrailRuns") : 0,
    tubePieceLength: v.n("tubePieceLength"),
    wastePercentage: v.n("wastePercentage"),
    electrodeKgPerMeter: v.n("electrodeKgPerMeter"),
    includePaint: Boolean(v.flags.includePaint),
    surfacePerMeter: v.n("surfacePerMeter"),
    paintCoats: v.n("paintCoats"),
    paintCoverage: v.n("paintCoverage"),
  };
}

function pricesFrom(v: Values): RailingPrices {
  return {
    postTube: v.n("postPrice"),
    railTube: v.n("railPrice"),
    balusterTube: v.n("balusterPrice"),
    electrodeKg: v.n("electrodePrice"),
    paintGallon: v.n("paintPrice"),
    laborMeter: v.n("laborPrice"),
  };
}

export const barandaConfig: CalculatorConfig<RailingResult> = {
  id: "railing",
  settingsKey: "calculator.baranda",
  title: "Barandas y pasamanos",
  subtitle: "Postes, rieles, barrotes y pasamanos de tubo metálico, con soldadura y pintura.",
  icon: "remove-outline",
  calculateLabel: "Calcular baranda",
  defaults: {
    length: "", height: "1.00", postSpacing: "1.50", postEmbed: "0.10", balusterSpacing: "0.12",
    railRows: "2", handrailRuns: "1", tubePieceLength: "6", wastePercentage: "5", electrodeKgPerMeter: "0.08",
    surfacePerMeter: "0.15", paintCoats: "2", paintCoverage: "25",
    postPrice: "", railPrice: "", balusterPrice: "", electrodePrice: "", paintPrice: "", laborPrice: "",
  },
  flagDefaults: { includeBalusters: true, includeHandrail: true, includePaint: true },
  sections: [
    {
      title: "Medidas",
      description: "Una altura de 1.00 a 1.10 m es la usual en barandas de escaleras y balcones; confirma la norma de tu zona.",
      fields: [
        { key: "length", label: "Largo total de baranda", unit: "m" },
        { key: "height", label: "Altura", unit: "m", persist: true },
        { key: "postSpacing", label: "Separación de postes", unit: "m", persist: true },
        { key: "postEmbed", label: "Largo extra del poste", unit: "m", persist: true },
        { key: "railRows", label: "Rieles horizontales", unit: "filas", persist: true },
        { key: "tubePieceLength", label: "Largo del tubo comprado", unit: "m", persist: true },
        { key: "wastePercentage", label: "Desperdicio de corte", unit: "%", persist: true },
      ],
      info: (v) => {
        if (!hasRailing(v)) return null;
        const r = calculateRailing(inputFrom(v), pricesFrom(v));
        return r.posts ? `${r.posts} postes${r.balusters ? ` · ${r.balusters} barrotes` : ""}.` : null;
      },
    },
    {
      title: "Barrotes y pasamanos",
      fields: [
        { key: "balusterSpacing", label: "Separación de barrotes (centro a centro)", unit: "m", persist: true },
        { key: "handrailRuns", label: "Pasamanos", unit: "líneas", persist: true },
      ],
      toggles: [
        { key: "includeBalusters", title: "Incluir barrotes verticales" },
        { key: "includeHandrail", title: "Incluir pasamanos" },
      ],
    },
    {
      title: "Soldadura y pintura",
      fields: [
        { key: "electrodeKgPerMeter", label: "Electrodo por metro de baranda", unit: "kg", persist: true },
        { key: "surfacePerMeter", label: "Superficie por metro de tubo", unit: "m²", persist: true },
        { key: "paintCoats", label: "Manos de pintura", unit: "manos", persist: true },
        { key: "paintCoverage", label: "Rendimiento por galón", unit: "m²", persist: true },
      ],
      toggles: [{ key: "includePaint", title: "Incluir pintura anticorrosiva" }],
    },
  ],
  prices: [
    { key: "postPrice", label: "Tubo de poste", unit: "por pieza", kind: "material", keywords: /tubo.*(poste|baranda)|baranda.*poste/, showWhen: hasRailing },
    { key: "railPrice", label: "Tubo de riel y pasamanos", unit: "por pieza", kind: "material", keywords: /tubo.*(riel|pasamano)|pasamano/ },
    { key: "balusterPrice", label: "Tubo de barrote", unit: "por pieza", kind: "material", keywords: /barrote|tubo.*cuadrado.*(1\/2|3\/4)/, showWhen: (v) => Boolean(v.flags.includeBalusters) },
    { key: "electrodePrice", label: "Electrodo de soldadura", unit: "por kg", kind: "material", keywords: /electrodo|soldadura/ },
    { key: "paintPrice", label: "Pintura anticorrosiva", unit: "por galón", kind: "material", keywords: /anticorrosiva/, showWhen: (v) => Boolean(v.flags.includePaint) },
    { key: "laborPrice", label: "Fabricación e instalación de baranda", unit: "por metro", kind: "labor", keywords: /baranda/ },
  ],
  validate: (v) => {
    if (!hasRailing(v)) return "Escribe el largo y la altura de la baranda.";
    if (v.n("postSpacing") <= 0) return "Escribe la separación de los postes.";
    if (v.n("tubePieceLength") <= 0) return "Escribe el largo del tubo comprado.";
    if (v.flags.includeBalusters && v.n("balusterSpacing") <= 0) return "Escribe la separación de los barrotes.";
    if (v.flags.includePaint && v.n("paintCoverage") <= 0) return "Escribe el rendimiento de la pintura.";
    return null;
  },
  compute: (v) => {
    const result = calculateRailing(inputFrom(v), pricesFrom(v));
    if (!result.posts) throw new Error("Baranda sin medidas");
    return result;
  },
  resultRows: (r) => {
    const rows: ResultRow[] = [
      { label: "Postes", value: `${r.posts} · ${r.postPieces} tubos`, strong: true },
      { label: "Rieles y pasamanos", value: `${r.railMeters.toFixed(1)} m · ${r.railPieces} tubos` },
    ];
    if (r.balusters) rows.push({ label: "Barrotes", value: `${r.balusters} · ${r.balusterPieces} tubos` });
    rows.push({ label: "Electrodo", value: `${r.electrodeKg.toFixed(2)} kg` });
    if (r.paintGallons) rows.push({ label: "Pintura anticorrosiva", value: `${r.paintGallons} galones` });
    return rows;
  },
  buildLine: (r, c, v) =>
    makeLine({
      description: "Baranda de tubo metálico con pasamanos",
      unit: "m",
      quantity: Number(v.n("length").toFixed(2)),
      total: r.totalCost,
      costTotal: c.totalCost,
      materials: compactMaterials([
        material("Tubo de poste", r.postPieces, "und.", c.postCost),
        material("Tubo de riel y pasamanos", r.railPieces, "und.", c.railCost),
        material("Tubo de barrote", r.balusterPieces, "und.", c.balusterCost),
        material("Electrodo de soldadura", Number(r.electrodeKg.toFixed(2)), "kg", c.electrodeCost),
        material("Pintura anticorrosiva", r.paintGallons, "gal.", c.paintCost),
      ]),
      notes: `${r.posts} postes${r.balusters ? ` · ${r.balusters} barrotes` : ""}`,
    }),
};
