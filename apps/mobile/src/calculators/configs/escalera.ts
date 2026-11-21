import {
  compactMaterials,
  makeLine,
  type CalculatorConfig,
  type Values,
} from "@/components/calculators/CalculatorScreen";
import {
  calculateStairs,
  type StairsInput,
  type StairsResult,
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

const hasStairs = (v: Values) => v.n("totalRise") > 0 && v.n("width") > 0 && v.n("stepRise") > 0;

function inputFrom(v: Values): StairsInput {
  return {
    ...reinforcedParamsFrom(v),
    totalRise: v.n("totalRise"),
    stepRise: v.n("stepRise"),
    tread: v.n("tread"),
    width: v.n("width"),
    waist: v.n("waist"),
    landingArea: v.n("landingArea"),
  };
}

const compute = (v: Values) => calculateStairs(inputFrom(v), reinforcedPricesFrom(v));

export const escaleraConfig: CalculatorConfig<StairsResult> = {
  id: "stairs",
  settingsKey: "calculator.escalera",
  title: "Escalera de concreto",
  subtitle: "Escalones, concreto, acero y encofrado de una escalera de un tramo.",
  icon: "trending-up-outline",
  calculateLabel: "Calcular escalera",
  defaults: {
    totalRise: "", stepRise: "0.18", tread: "0.28", width: "1.00", waist: "0.12", landingArea: "0",
    ...reinforcedDefaults("100"),
  },
  flagDefaults: reinforcedFlagDefaults,
  sections: [
    {
      title: "Medidas de la escalera",
      description: "La altura se divide entre la contrahuella para contar los escalones.",
      fields: [
        { key: "totalRise", label: "Altura total a salvar", unit: "m" },
        { key: "stepRise", label: "Contrahuella (altura del escalón)", unit: "m", persist: true },
        { key: "tread", label: "Huella (pisada)", unit: "m", persist: true },
        { key: "width", label: "Ancho de la escalera", unit: "m", persist: true },
        { key: "waist", label: "Espesor de la losa inclinada", unit: "m", persist: true },
        { key: "landingArea", label: "Descanso (área)", unit: "m²" },
      ],
      info: (v) => {
        const r = hasStairs(v) ? compute(v) : null;
        return r ? `${r.steps} escalones de ${(r.actualRise * 100).toFixed(1)} cm · largo inclinado ${r.slopeLength.toFixed(2)} m.` : null;
      },
    },
    ...reinforcedSections(),
  ],
  prices: reinforcedPriceDefs(hasStairs),
  validate: (v) => {
    if (!hasStairs(v)) return "Escribe la altura, la contrahuella y el ancho de la escalera.";
    if (v.n("tread") <= 0) return "Escribe la huella de los escalones.";
    return reinforcedValidate(v);
  },
  compute: (v) => {
    const result = compute(v);
    if (!result) throw new Error("Escalera sin medidas");
    return result;
  },
  resultRows: (r) => [
    { label: "Escalones", value: `${r.steps} de ${(r.actualRise * 100).toFixed(1)} cm`, strong: true },
    ...reinforcedRows(r),
  ],
  buildLine: (r, c) =>
    makeLine({
      description: `Escalera de concreto armado de ${r.steps} escalones`,
      unit: "m³",
      quantity: Number(r.volume.toFixed(2)),
      total: r.totalCost,
      costTotal: c.totalCost,
      materials: compactMaterials(reinforcedMaterialLines(r, c)),
      notes: `${r.steps} escalones · ${r.volume.toFixed(2)} m³ de concreto · ${r.steelKg.toFixed(0)} kg de acero`,
    }),
};
