import {
  compactMaterials,
  makeLine,
  material,
  type CalculatorConfig,
  type ResultRow,
  type Values,
} from "@/components/calculators/CalculatorScreen";
import {
  calculateFacade,
  type FacadeInput,
  type FacadePrices,
  type FacadeResult,
} from "@/utils/pool-facade-calculations";

const hasFacade = (v: Values) => v.n("wallLength") * v.n("wallHeight") + v.n("extraArea") > 0;
const repairOn = (v: Values) => v.n("repairPercentage") > 0;
const sealerOn = (v: Values) => Boolean(v.flags.includeSealer);
const scaffoldOn = (v: Values) => Boolean(v.flags.includeScaffold);

function inputFrom(v: Values): FacadeInput {
  return {
    wallLength: v.n("wallLength"),
    wallHeight: v.n("wallHeight"),
    openingsArea: v.n("openingsArea"),
    extraArea: v.n("extraArea"),
    repairPercentage: v.n("repairPercentage"),
    repairThickness: v.n("repairThickness"),
    repairWastePercentage: v.n("repairWastePercentage"),
    mixCement: v.n("mixCement"),
    mixSand: v.n("mixSand"),
    cementBagWeight: v.n("cementBagWeight"),
    crackLength: v.n("crackLength"),
    metersPerSealantCartridge: v.n("metersPerSealantCartridge"),
    includeSealer: sealerOn(v),
    sealerCoverage: v.n("sealerCoverage"),
    paintCoats: v.n("paintCoats"),
    paintCoverage: v.n("paintCoverage"),
    paintWastePercentage: v.n("paintWastePercentage"),
    includeScaffold: scaffoldOn(v),
    scaffoldBayLength: v.n("scaffoldBayLength"),
    scaffoldLevelHeight: v.n("scaffoldLevelHeight"),
    scaffoldMonths: v.n("scaffoldMonths"),
  };
}

function pricesFrom(v: Values): FacadePrices {
  return {
    cementBag: v.n("cementPrice"),
    sandCubicMeter: v.n("sandPrice"),
    sealantCartridge: v.n("sealantPrice"),
    sealerGallon: v.n("sealerPrice"),
    paintGallon: v.n("paintPrice"),
    scaffoldSetMonth: v.n("scaffoldPrice"),
    laborPaintSquareMeter: v.n("laborPaintPrice"),
    laborRepairSquareMeter: v.n("laborRepairPrice"),
    laborScaffoldSet: v.n("laborScaffoldPrice"),
  };
}

export const fachadaConfig: CalculatorConfig<FacadeResult> = {
  id: "facade",
  settingsKey: "calculator.fachada",
  title: "Pintura de fachada exterior",
  subtitle: "Reparación de repello, sellado de fisuras, sellador, pintura y alquiler de andamio.",
  icon: "color-palette-outline",
  calculateLabel: "Calcular fachada",
  defaults: {
    wallLength: "", wallHeight: "", openingsArea: "0", extraArea: "0", repairPercentage: "10",
    repairThickness: "0.015", repairWastePercentage: "10", mixCement: "1", mixSand: "4", cementBagWeight: "42.5",
    crackLength: "0", metersPerSealantCartridge: "8", sealerCoverage: "25", paintCoats: "2", paintCoverage: "28",
    paintWastePercentage: "10", scaffoldBayLength: "2", scaffoldLevelHeight: "1.9", scaffoldMonths: "1",
    cementPrice: "", sandPrice: "", sealantPrice: "", sealerPrice: "", paintPrice: "", scaffoldPrice: "",
    laborPaintPrice: "", laborRepairPrice: "", laborScaffoldPrice: "",
  },
  flagDefaults: { includeSealer: true, includeScaffold: false },
  sections: [
    {
      title: "Superficie",
      description: "Largo total de las paredes por pintar (perímetro exterior) y su altura.",
      fields: [
        { key: "wallLength", label: "Largo de paredes", unit: "m" },
        { key: "wallHeight", label: "Altura", unit: "m" },
        { key: "openingsArea", label: "Puertas y ventanas (se descuentan)", unit: "m²" },
        { key: "extraArea", label: "Área extra (columnas, aleros)", unit: "m²" },
      ],
      info: (v) => {
        if (!hasFacade(v)) return null;
        const r = calculateFacade(inputFrom(v), pricesFrom(v));
        return `${r.paintArea.toFixed(1)} m² por pintar.`;
      },
    },
    {
      title: "Reparación de repello",
      description: "Porcentaje de la fachada con repello dañado que hay que reparar con mortero.",
      fields: [
        { key: "repairPercentage", label: "Superficie a reparar", unit: "%", persist: true },
        { key: "repairThickness", label: "Espesor del repello", unit: "m", persist: true },
        { key: "repairWastePercentage", label: "Desperdicio de mortero", unit: "%", persist: true },
        { key: "mixCement", label: "Mezcla: cemento", unit: "parte", persist: true },
        { key: "mixSand", label: "Mezcla: arena", unit: "parte", persist: true },
        { key: "cementBagWeight", label: "Peso del saco de cemento", unit: "kg", persist: true },
        { key: "crackLength", label: "Fisuras por sellar", unit: "m" },
        { key: "metersPerSealantCartridge", label: "Rinde cada cartucho de sellador", unit: "m", persist: true },
      ],
    },
    {
      title: "Sellador y pintura",
      fields: [
        { key: "sealerCoverage", label: "Rendimiento del sellador", unit: "m²/gal", persist: true },
        { key: "paintCoats", label: "Manos de pintura", unit: "manos", persist: true },
        { key: "paintCoverage", label: "Rendimiento de la pintura", unit: "m²/gal", persist: true },
        { key: "paintWastePercentage", label: "Desperdicio de pintura", unit: "%", persist: true },
      ],
      toggles: [{ key: "includeSealer", title: "Incluir sellador" }],
    },
    {
      title: "Andamio",
      description: "Cada cuerpo cubre un tramo de pared y un nivel de altura.",
      fields: [
        { key: "scaffoldBayLength", label: "Largo de cada tramo", unit: "m", persist: true },
        { key: "scaffoldLevelHeight", label: "Altura de cada cuerpo", unit: "m", persist: true },
        { key: "scaffoldMonths", label: "Meses de alquiler", unit: "meses", persist: true },
      ],
      toggles: [{ key: "includeScaffold", title: "Incluir andamio" }],
    },
  ],
  prices: [
    { key: "cementPrice", label: "Cemento", unit: "por saco", kind: "material", keywords: /cemento albanileria|cemento/, showWhen: repairOn },
    { key: "sandPrice", label: "Arena", unit: "por m³", kind: "material", keywords: /arena/, showWhen: repairOn },
    { key: "sealantPrice", label: "Sellador elastomérico", unit: "por cartucho", kind: "material", keywords: /sellador.*(poliuretano|elastomerico)|masilla/, showWhen: (v) => v.n("crackLength") > 0 },
    { key: "sealerPrice", label: "Sellador acrílico", unit: "por galón", kind: "material", keywords: /sellador acrilico/, showWhen: sealerOn },
    { key: "paintPrice", label: "Pintura acrílica exterior", unit: "por galón", kind: "material", keywords: /pintura acrilica.*(exterior|premium)|pintura acrilica/ },
    { key: "scaffoldPrice", label: "Alquiler de andamio", unit: "por cuerpo y mes", kind: "material", keywords: /alquiler.*andamio|andamio/, showWhen: scaffoldOn },
    { key: "laborPaintPrice", label: "Pintura de fachada", unit: "por m²", kind: "labor", keywords: /pintura/ },
    { key: "laborRepairPrice", label: "Reparación de repello", unit: "por m²", kind: "labor", keywords: /repello/, showWhen: repairOn },
    { key: "laborScaffoldPrice", label: "Armado de andamio", unit: "por cuerpo", kind: "labor", keywords: /armado.*andamio|andamio/, showWhen: scaffoldOn },
  ],
  validate: (v) => {
    if (!hasFacade(v)) return "Escribe el largo y la altura de las paredes.";
    if (v.n("paintCoverage") <= 0) return "Escribe el rendimiento de la pintura.";
    if (repairOn(v) && (v.n("mixCement") <= 0 || v.n("mixSand") <= 0)) {
      return "Revisa la mezcla: cemento y arena deben ser mayores que 0.";
    }
    if (sealerOn(v) && v.n("sealerCoverage") <= 0) return "Escribe el rendimiento del sellador.";
    return null;
  },
  compute: (v) => {
    const result = calculateFacade(inputFrom(v), pricesFrom(v));
    if (!result.paintArea) throw new Error("Fachada sin área");
    return result;
  },
  resultRows: (r) => {
    const rows: ResultRow[] = [
      { label: "Área por pintar", value: `${r.paintArea.toFixed(1)} m²`, strong: true },
      { label: "Pintura", value: `${r.paintGallons} galones` },
    ];
    if (r.sealerGallons) rows.push({ label: "Sellador", value: `${r.sealerGallons} galones` });
    if (r.repairArea) {
      rows.push({ label: "Repello a reparar", value: `${r.repairArea.toFixed(1)} m²` });
      rows.push({ label: "Cemento y arena", value: `${r.cementBags} sacos · ${r.sandVolume.toFixed(2)} m³` });
    }
    if (r.sealantCartridges) rows.push({ label: "Sellador de fisuras", value: `${r.sealantCartridges} cartuchos` });
    if (r.scaffoldSets) rows.push({ label: "Andamio", value: `${r.scaffoldSets} cuerpos` });
    return rows;
  },
  buildLine: (r, c, v) =>
    makeLine({
      description: "Pintura de fachada exterior",
      unit: "m²",
      quantity: Number(r.paintArea.toFixed(2)),
      total: r.totalCost,
      costTotal: c.totalCost,
      materials: compactMaterials([
        material("Pintura acrílica exterior", r.paintGallons, "gal.", c.paintCost),
        material("Sellador acrílico", r.sealerGallons, "gal.", c.sealerCost),
        material("Cemento", r.cementBags, "saco", c.cementCost),
        material("Arena", Number(r.sandVolume.toFixed(2)), "m³", c.sandCost),
        material("Sellador elastomérico", r.sealantCartridges, "cartucho", c.sealantCost),
        material("Alquiler de andamio", r.scaffoldSets, "cuerpo", c.scaffoldCost),
      ]),
      notes: scaffoldOn(v) ? `${r.scaffoldSets} cuerpos de andamio` : undefined,
    }),
};
