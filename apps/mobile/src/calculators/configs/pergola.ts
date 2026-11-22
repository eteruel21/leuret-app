import {
  compactMaterials,
  makeLine,
  material,
  type CalculatorConfig,
  type ResultRow,
  type Values,
} from "@/components/calculators/CalculatorScreen";
import {
  calculatePergola,
  type PergolaInput,
  type PergolaPrices,
  type PergolaResult,
} from "@/utils/carpentry-lighting-calculations";

const hasPergola = (v: Values) => v.n("length") > 0 && v.n("width") > 0 && v.n("postCount") > 0;

function inputFrom(v: Values): PergolaInput {
  return {
    length: v.n("length"),
    width: v.n("width"),
    height: v.n("height"),
    postCount: v.n("postCount"),
    postEmbed: v.n("postEmbed"),
    beamLines: v.n("beamLines"),
    rafterSpacing: v.n("rafterSpacing"),
    overhang: v.n("overhang"),
    includeSlats: Boolean(v.flags.includeSlats),
    slatSpacing: v.n("slatSpacing"),
    postPieceLength: v.n("postPieceLength"),
    beamPieceLength: v.n("beamPieceLength"),
    rafterPieceLength: v.n("rafterPieceLength"),
    slatPieceLength: v.n("slatPieceLength"),
    wastePercentage: v.n("wastePercentage"),
    jointsPerRafter: v.n("jointsPerRafter"),
    screwsPerSlat: v.n("screwsPerSlat"),
    screwsPerBox: v.n("screwsPerBox"),
    includeFinish: Boolean(v.flags.includeFinish),
    surfacePerMeter: v.n("surfacePerMeter"),
    finishCoats: v.n("finishCoats"),
    finishCoverage: v.n("finishCoverage"),
  };
}

function pricesFrom(v: Values): PergolaPrices {
  return {
    postPiece: v.n("postPrice"),
    beamPiece: v.n("beamPrice"),
    rafterPiece: v.n("rafterPrice"),
    slatPiece: v.n("slatPrice"),
    postBase: v.n("basePrice"),
    hardware: v.n("hardwarePrice"),
    screwBox: v.n("screwPrice"),
    finishGallon: v.n("finishPrice"),
    laborSquareMeter: v.n("laborPrice"),
  };
}

export const pergolaConfig: CalculatorConfig<PergolaResult> = {
  id: "pergola",
  settingsKey: "calculator.pergola",
  title: "Pérgola de madera",
  subtitle: "Postes, vigas, viguetas y listones de madera con herrajes y barniz.",
  icon: "home-outline",
  calculateLabel: "Calcular pérgola",
  defaults: {
    length: "", width: "", height: "2.50", postCount: "4", postEmbed: "0.10", beamLines: "2",
    rafterSpacing: "0.50", overhang: "0.30", slatSpacing: "0.15", postPieceLength: "3.66",
    beamPieceLength: "3.66", rafterPieceLength: "3.05", slatPieceLength: "3.66", wastePercentage: "10",
    jointsPerRafter: "2", screwsPerSlat: "1", screwsPerBox: "100", surfacePerMeter: "0.30", finishCoats: "2",
    finishCoverage: "30",
    postPrice: "", beamPrice: "", rafterPrice: "", slatPrice: "", basePrice: "", hardwarePrice: "",
    screwPrice: "", finishPrice: "", laborPrice: "",
  },
  flagDefaults: { includeSlats: true, includeFinish: true },
  sections: [
    {
      title: "Medidas",
      description: "Los postes van en las esquinas y cada tanto a lo largo; escribe cuántos serán según tu diseño.",
      fields: [
        { key: "length", label: "Largo (dirección de las vigas)", unit: "m" },
        { key: "width", label: "Ancho (dirección de las viguetas)", unit: "m" },
        { key: "height", label: "Altura libre", unit: "m", persist: true },
        { key: "postCount", label: "Postes", unit: "und." },
        { key: "postEmbed", label: "Largo extra del poste", unit: "m", persist: true },
        { key: "beamLines", label: "Líneas de viga principal", unit: "und.", persist: true },
        { key: "rafterSpacing", label: "Separación de viguetas", unit: "m", persist: true },
        { key: "overhang", label: "Voladizo de viguetas por lado", unit: "m", persist: true },
      ],
      info: (v) => {
        if (!hasPergola(v) || v.n("rafterSpacing") <= 0) return null;
        const r = calculatePergola(inputFrom(v), pricesFrom(v));
        return r.area ? `${r.area.toFixed(1)} m² · ${r.rafters} viguetas.` : null;
      },
    },
    {
      title: "Listones de cubierta",
      fields: [{ key: "slatSpacing", label: "Separación de listones", unit: "m", persist: true }],
      toggles: [{ key: "includeSlats", title: "Incluir listones sobre las viguetas" }],
    },
    {
      title: "Madera comprada",
      fields: [
        { key: "postPieceLength", label: "Largo de poste", unit: "m", persist: true },
        { key: "beamPieceLength", label: "Largo de viga", unit: "m", persist: true },
        { key: "rafterPieceLength", label: "Largo de vigueta", unit: "m", persist: true },
        { key: "slatPieceLength", label: "Largo de listón", unit: "m", persist: true },
        { key: "wastePercentage", label: "Desperdicio de corte", unit: "%", persist: true },
      ],
    },
    {
      title: "Herrajes y tornillos",
      fields: [
        { key: "jointsPerRafter", label: "Herrajes por vigueta", unit: "und.", persist: true },
        { key: "screwsPerSlat", label: "Tornillos por listón y vigueta", unit: "und.", persist: true },
        { key: "screwsPerBox", label: "Tornillos por caja", unit: "und.", persist: true },
      ],
    },
    {
      title: "Barniz",
      fields: [
        { key: "surfacePerMeter", label: "Superficie por metro de madera", unit: "m²", persist: true },
        { key: "finishCoats", label: "Manos", unit: "manos", persist: true },
        { key: "finishCoverage", label: "Rendimiento por galón", unit: "m²", persist: true },
      ],
      toggles: [{ key: "includeFinish", title: "Incluir barniz o protector" }],
    },
  ],
  prices: [
    { key: "postPrice", label: "Poste de madera", unit: "por pieza", kind: "material", keywords: /poste.*madera|4x4/, showWhen: hasPergola },
    { key: "beamPrice", label: "Viga de madera", unit: "por pieza", kind: "material", keywords: /viga.*madera|2x8/ },
    { key: "rafterPrice", label: "Vigueta de madera", unit: "por pieza", kind: "material", keywords: /pinotea|2x4/ },
    { key: "slatPrice", label: "Listón de madera", unit: "por pieza", kind: "material", keywords: /liston.*madera|1x2/, showWhen: (v) => Boolean(v.flags.includeSlats) },
    { key: "basePrice", label: "Base metálica de poste", unit: "por unidad", kind: "material", keywords: /base.*poste/ },
    { key: "hardwarePrice", label: "Herraje de unión", unit: "por unidad", kind: "material", keywords: /herraje.*(union|madera)|angulo.*madera/ },
    { key: "screwPrice", label: "Tornillos para madera", unit: "por caja", kind: "material", keywords: /tornillo.*(estructural|madera)/, showWhen: (v) => Boolean(v.flags.includeSlats) },
    { key: "finishPrice", label: "Barniz protector", unit: "por galón", kind: "material", keywords: /barniz/, showWhen: (v) => Boolean(v.flags.includeFinish) },
    { key: "laborPrice", label: "Armado de pérgola", unit: "por m²", kind: "labor", keywords: /pergola/ },
  ],
  validate: (v) => {
    if (!hasPergola(v)) return "Escribe el largo, el ancho y los postes de la pérgola.";
    if (v.n("rafterSpacing") <= 0) return "Escribe la separación de viguetas.";
    if (v.n("postPieceLength") <= 0 || v.n("beamPieceLength") <= 0 || v.n("rafterPieceLength") <= 0) {
      return "Escribe el largo de la madera del poste, la viga y la vigueta.";
    }
    if (v.flags.includeSlats && (v.n("slatSpacing") <= 0 || v.n("slatPieceLength") <= 0)) {
      return "Escribe la separación y el largo de los listones.";
    }
    if (v.flags.includeFinish && v.n("finishCoverage") <= 0) return "Escribe el rendimiento del barniz.";
    return null;
  },
  compute: (v) => {
    const result = calculatePergola(inputFrom(v), pricesFrom(v));
    if (!result.area) throw new Error("Pérgola sin medidas");
    return result;
  },
  resultRows: (r) => {
    const rows: ResultRow[] = [
      { label: "Área cubierta", value: `${r.area.toFixed(1)} m²`, strong: true },
      { label: "Postes", value: `${r.postBases} · ${r.postPieces} piezas` },
      { label: "Vigas", value: `${r.beamMeters.toFixed(1)} m · ${r.beamPieces} piezas` },
      { label: "Viguetas", value: `${r.rafters} · ${r.rafterPieces} piezas` },
    ];
    if (r.slats) rows.push({ label: "Listones", value: `${r.slats} · ${r.slatPieces} piezas` });
    rows.push({ label: "Herrajes", value: `${r.hardwareSets} unidades` });
    if (r.screwBoxes) rows.push({ label: "Tornillos", value: `${r.screwBoxes} cajas` });
    if (r.finishGallons) rows.push({ label: "Barniz", value: `${r.finishGallons} galones` });
    return rows;
  },
  buildLine: (r, c) =>
    makeLine({
      description: "Pérgola de madera",
      unit: "m²",
      quantity: Number(r.area.toFixed(2)),
      total: r.totalCost,
      costTotal: c.totalCost,
      materials: compactMaterials([
        material("Poste de madera", r.postPieces, "pieza", c.postCost),
        material("Viga de madera", r.beamPieces, "pieza", c.beamCost),
        material("Vigueta de madera", r.rafterPieces, "pieza", c.rafterCost),
        material("Listón de madera", r.slatPieces, "pieza", c.slatCost),
        material("Base metálica de poste", r.postBases, "und.", c.baseCost),
        material("Herraje de unión", r.hardwareSets, "und.", c.hardwareCost),
        material("Tornillos para madera", r.screwBoxes, "caja", c.screwCost),
        material("Barniz protector", r.finishGallons, "gal.", c.finishCost),
      ]),
      notes: `${r.postBases} postes · ${r.rafters} viguetas`,
    }),
};
