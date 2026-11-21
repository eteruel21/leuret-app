import {
  compactMaterials,
  makeLine,
  material,
  type CalculatorConfig,
  type ResultRow,
  type Values,
} from "@/components/calculators/CalculatorScreen";
import {
  calculateRetainingWall,
  type RetainingWallInput,
  type RetainingWallPrices,
  type RetainingWallResult,
} from "@/utils/reinforced-works-calculations";

import {
  reinforcedDefaults,
  reinforcedFlagDefaults,
  reinforcedMaterialLines,
  reinforcedParamsFrom,
  reinforcedPriceDefs,
  reinforcedPricesFrom,
  reinforcedRows,
  reinforcedSections,
  reinforcedValidate,
} from "./reinforced-shared";

const hasWall = (v: Values) => v.n("length") > 0 && v.n("height") > 0;

function inputFrom(v: Values): RetainingWallInput {
  return {
    ...reinforcedParamsFrom(v),
    length: v.n("length"),
    height: v.n("height"),
    stemThickness: v.n("stemThickness"),
    footingWidth: v.n("footingWidth"),
    footingThickness: v.n("footingThickness"),
    includeDrain: Boolean(v.flags.includeDrain),
    weepSpacing: v.n("weepSpacing"),
    weepRowSpacing: v.n("weepRowSpacing"),
    weepPipePieceLength: v.n("weepPipePieceLength"),
    drainThickness: v.n("drainThickness"),
  };
}

function pricesFrom(v: Values): RetainingWallPrices {
  return {
    ...reinforcedPricesFrom(v),
    weepPipePiece: v.n("weepPipePrice"),
    drainGravelCubicMeter: v.n("drainGravelPrice"),
  };
}

export const muroRetencionConfig: CalculatorConfig<RetainingWallResult> = {
  id: "retaining-wall",
  settingsKey: "calculator.muro-retencion",
  title: "Muro de retención",
  subtitle: "Concreto, acero y encofrado del muro y su zapata, con barbacanas y drenaje.",
  icon: "git-merge-outline",
  calculateLabel: "Calcular muro",
  defaults: {
    length: "", height: "", stemThickness: "0.25", footingWidth: "", footingThickness: "0.30",
    weepSpacing: "2", weepRowSpacing: "1.5", weepPipePieceLength: "3", drainThickness: "0.30",
    weepPipePrice: "", drainGravelPrice: "",
    ...reinforcedDefaults("90"),
  },
  flagDefaults: { ...reinforcedFlagDefaults, includeDrain: true },
  sections: [
    {
      title: "Medidas del muro",
      description: "Una zapata de entre la mitad y dos tercios de la altura es un punto de partida común; confírmalo con el diseño.",
      fields: [
        { key: "length", label: "Largo del muro", unit: "m" },
        { key: "height", label: "Altura del muro", unit: "m" },
        { key: "stemThickness", label: "Espesor del muro", unit: "m", persist: true },
        { key: "footingWidth", label: "Ancho de la zapata", unit: "m" },
        { key: "footingThickness", label: "Espesor de la zapata", unit: "m", persist: true },
      ],
    },
    {
      title: "Drenaje",
      description: "Barbacanas en el muro y grava detrás para que no se acumule agua.",
      fields: [
        { key: "weepSpacing", label: "Separación de barbacanas", unit: "m", persist: true },
        { key: "weepRowSpacing", label: "Separación entre filas", unit: "m", persist: true },
        { key: "weepPipePieceLength", label: "Largo del tubo", unit: "m", persist: true },
        { key: "drainThickness", label: "Espesor de la grava de drenaje", unit: "m", persist: true },
      ],
      toggles: [{ key: "includeDrain", title: "Incluir barbacanas y grava de drenaje" }],
    },
    ...reinforcedSections(),
  ],
  prices: [
    ...reinforcedPriceDefs(hasWall),
    { key: "weepPipePrice", label: "Tubo de barbacana", unit: "por pieza", kind: "material", keywords: /barbacana|pvc.*2/, showWhen: (v) => Boolean(v.flags.includeDrain) },
    { key: "drainGravelPrice", label: "Grava de drenaje", unit: "por m³", kind: "material", keywords: /grava de drenaje|piedra|grava/, showWhen: (v) => Boolean(v.flags.includeDrain) },
  ],
  validate: (v) => {
    if (!hasWall(v)) return "Escribe el largo y la altura del muro.";
    if (v.n("stemThickness") <= 0 || v.n("footingWidth") <= 0 || v.n("footingThickness") <= 0) {
      return "Escribe el espesor del muro y el ancho y el espesor de la zapata.";
    }
    return reinforcedValidate(v);
  },
  compute: (v) => {
    const result = calculateRetainingWall(inputFrom(v), pricesFrom(v));
    if (!result) throw new Error("Muro sin medidas");
    return result;
  },
  resultRows: (r) => {
    const rows: ResultRow[] = reinforcedRows(r);
    if (r.weepHoles) rows.push({ label: "Barbacanas", value: `${r.weepHoles} huecos · ${r.weepPipePieces} tubos` });
    if (r.drainVolume) rows.push({ label: "Grava de drenaje", value: `${r.drainVolume.toFixed(2)} m³` });
    return rows;
  },
  buildLine: (r, c) =>
    makeLine({
      description: "Muro de retención de concreto armado",
      unit: "m³",
      quantity: Number(r.volume.toFixed(2)),
      total: r.totalCost,
      costTotal: c.totalCost,
      materials: compactMaterials([
        ...reinforcedMaterialLines(r, c),
        material("Tubo de barbacana", r.weepPipePieces, "und.", c.weepCost),
        material("Grava de drenaje", Number(r.drainVolume.toFixed(2)), "m³", c.drainCost),
      ]),
      notes: `${r.volume.toFixed(2)} m³ de concreto · ${r.steelKg.toFixed(0)} kg de acero`,
    }),
};
