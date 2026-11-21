import {
  compactMaterials,
  makeLine,
  material,
  type CalculatorConfig,
  type Values,
} from "@/components/calculators/CalculatorScreen";
import {
  calculateWaterproofing,
  type WaterproofingInput,
  type WaterproofingPrices,
  type WaterproofingResult,
} from "@/utils/construction-calculations";

function inputFrom(v: Values): WaterproofingInput {
  const n = v.n;
  return {
    area: n("area"),
    perimeter: n("perimeter"),
    upturnHeight: n("upturnHeight"),
    coats: n("coats"),
    coveragePerGallonPerCoat: n("coverage"),
    primerEnabled: Boolean(v.flags.primer),
    primerCoveragePerGallon: n("primerCoverage"),
    meshEnabled: Boolean(v.flags.mesh),
    meshRollCoverage: n("meshRollCoverage"),
    wastePercentage: n("wastePercentage"),
  };
}

function pricesFrom(v: Values): WaterproofingPrices {
  const n = v.n;
  return {
    productGallon: n("productPrice"),
    primerGallon: n("primerPrice"),
    meshRoll: n("meshPrice"),
    supplies: n("suppliesPrice"),
    laborSquareMeter: n("laborPrice"),
  };
}

export const impermeabilizacionConfig: CalculatorConfig<WaterproofingResult> = {
  id: "waterproofing",
  settingsKey: "calculator.impermeabilizacion",
  title: "Impermeabilización",
  subtitle: "Losas y techos: galones, imprimante, malla y mano de obra.",
  icon: "umbrella-outline",
  calculateLabel: "Calcular impermeabilización",
  defaults: {
    area: "", perimeter: "", upturnHeight: "0.30", coats: "2", coverage: "5",
    primerCoverage: "8", meshRollCoverage: "50", wastePercentage: "10",
    productPrice: "", primerPrice: "", meshPrice: "", suppliesPrice: "", laborPrice: "",
  },
  flagDefaults: { primer: true, mesh: false },
  sections: [
    {
      title: "Superficie",
      description: "El borde que sube por los muros (rodapié) también se impermeabiliza.",
      fields: [
        { key: "area", label: "Área de la losa o techo", unit: "m²" },
        { key: "perimeter", label: "Perímetro de muros", unit: "m" },
        { key: "upturnHeight", label: "Altura que sube por el muro", unit: "m", persist: true },
      ],
      info: (v) =>
        v.n("area") > 0
          ? `Área a tratar: ${(v.n("area") + v.n("perimeter") * v.n("upturnHeight")).toFixed(2)} m².`
          : null,
    },
    {
      title: "Aplicación",
      description: "El rendimiento es de referencia: confírmalo con la ficha técnica del producto.",
      fields: [
        { key: "coats", label: "Manos", unit: "manos", persist: true },
        { key: "coverage", label: "Rendimiento por galón y por mano", unit: "m²", persist: true },
        { key: "primerCoverage", label: "Rendimiento del imprimante", unit: "m²", persist: true },
        { key: "meshRollCoverage", label: "Cobertura del rollo de malla", unit: "m²", persist: true },
        { key: "wastePercentage", label: "Desperdicio", unit: "%", persist: true },
      ],
      toggles: [
        { key: "primer", title: "Aplicar imprimante", subtitle: "Una mano antes del impermeabilizante." },
        { key: "mesh", title: "Reforzar con malla", subtitle: "Recomendado en techos con fisuras o juntas." },
      ],
    },
  ],
  prices: [
    { key: "productPrice", label: "Impermeabilizante", unit: "por galón", kind: "material", keywords: /impermeabil|membrana|acrilic/ },
    { key: "primerPrice", label: "Imprimante", unit: "por galón", kind: "material", keywords: /imprimante|sellador|primer/, showWhen: (v) => Boolean(v.flags.primer) },
    { key: "meshPrice", label: "Malla de refuerzo", unit: "por rollo", kind: "material", keywords: /malla|refuerzo|poliester/, showWhen: (v) => Boolean(v.flags.mesh) },
    { key: "suppliesPrice", label: "Cepillos y rodillos", unit: "global", kind: "material", keywords: /cepillo|rodillo|brocha/ },
    { key: "laborPrice", label: "Mano de obra", unit: "por m²", kind: "labor", keywords: /impermeabil/ },
  ],
  validate: (v) => {
    if (v.n("area") <= 0) return "Escribe el área a impermeabilizar.";
    if (v.n("coverage") <= 0) return "Escribe el rendimiento del producto por galón y por mano.";
    if (v.flags.primer && v.n("primerCoverage") <= 0) return "Escribe el rendimiento del imprimante.";
    if (v.flags.mesh && v.n("meshRollCoverage") <= 0) return "Escribe la cobertura del rollo de malla.";
    if (v.n("wastePercentage") > 100) return "El desperdicio debe estar entre 0% y 100%.";
    return null;
  },
  compute: (v) => calculateWaterproofing(inputFrom(v), pricesFrom(v)),
  resultRows: (r) => {
    const rows = [
      { label: "Área a tratar", value: `${r.treatedArea.toFixed(2)} m²`, strong: true },
      { label: "Impermeabilizante", value: `${r.productGallonsExact.toFixed(2)} gal · comprar ${r.productGallonsToBuy}` },
    ];
    if (r.primerGallonsToBuy) rows.push({ label: "Imprimante", value: `${r.primerGallonsExact.toFixed(2)} gal · comprar ${r.primerGallonsToBuy}` });
    if (r.meshRolls) rows.push({ label: "Malla de refuerzo", value: `${r.meshRolls} rollos` });
    return rows;
  },
  buildLine: (r, c, v) =>
    makeLine({
      description: `Impermeabilización de losa o techo (${Math.max(Math.round(v.n("coats")), 1)} manos)`,
      unit: "m²",
      quantity: r.treatedArea,
      total: r.totalCost,
      costTotal: c.totalCost,
      materials: compactMaterials([
        material("Impermeabilizante", r.productGallonsToBuy, "gal", c.productCost),
        material("Imprimante", r.primerGallonsToBuy, "gal", c.primerCost),
        material("Malla de refuerzo", r.meshRolls, "rollo", c.meshCost),
      ]),
      notes: `${r.productGallonsToBuy} galones de impermeabilizante`,
    }),
};
