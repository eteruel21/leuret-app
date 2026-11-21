import {
  compactMaterials,
  makeLine,
  material,
  type CalculatorConfig,
  type Values,
} from "@/components/calculators/CalculatorScreen";
import {
  calculateFence,
  type FenceInput,
  type FencePrices,
  type FenceResult,
} from "@/utils/openings-calculations";

const hasFence = (v: Values) => v.n("length") > 0 && v.n("height") > 0;

function inputFrom(v: Values): FenceInput {
  const n = v.n;
  return {
    length: n("length"),
    height: n("height"),
    postSpacing: n("postSpacing"),
    cornerPosts: n("cornerPosts"),
    gates: n("gates"),
    gateWidth: n("gateWidth"),
    embedDepth: n("embedDepth"),
    postPieceLength: n("postPieceLength"),
    railPieceLength: n("railPieceLength"),
    meshRollLength: n("meshRollLength"),
    meshRollHeight: n("meshRollHeight"),
    barbedWireStrands: v.flags.barbedWire ? n("barbedWireStrands") : 0,
    barbedWireRollLength: n("barbedWireRollLength"),
    concretePerPost: n("concretePerPost"),
    cementBagsPerCubicMeter: n("cementBagsPerCubicMeter"),
    wastePercentage: n("wastePercentage"),
  };
}

function pricesFrom(v: Values): FencePrices {
  const n = v.n;
  return {
    postPiece: n("postPrice"),
    railPiece: n("railPrice"),
    meshRoll: n("meshPrice"),
    barbedWireRoll: n("barbedWirePrice"),
    cementBag: n("cementPrice"),
    gate: n("gatePrice"),
    accessoriesPerPost: n("accessoriesPrice"),
    laborMeter: n("laborPrice"),
  };
}

export const cercasConfig: CalculatorConfig<FenceResult> = {
  id: "fence",
  settingsKey: "calculator.cercas",
  title: "Cercas",
  subtitle: "Malla ciclón: postes, tubo superior, malla, alambre de púas y portones.",
  icon: "git-network-outline",
  calculateLabel: "Calcular cerca",
  defaults: {
    length: "", height: "2", postSpacing: "2.50", cornerPosts: "4", gates: "0", gateWidth: "3",
    embedDepth: "0.50", postPieceLength: "6", railPieceLength: "6", meshRollLength: "15",
    meshRollHeight: "1.8", barbedWireStrands: "3", barbedWireRollLength: "300",
    concretePerPost: "0.05", cementBagsPerCubicMeter: "7.5", wastePercentage: "5",
    postPrice: "", railPrice: "", meshPrice: "", barbedWirePrice: "", cementPrice: "",
    gatePrice: "", accessoriesPrice: "", laborPrice: "",
  },
  flagDefaults: { barbedWire: false },
  sections: [
    {
      title: "Medidas de la cerca",
      fields: [
        { key: "length", label: "Largo total del perímetro", unit: "m" },
        { key: "height", label: "Altura de la cerca", unit: "m", persist: true },
        { key: "cornerPosts", label: "Esquinas y arranques", unit: "und." },
        { key: "gates", label: "Portones", unit: "und." },
        { key: "gateWidth", label: "Ancho de cada portón", unit: "m", persist: true },
      ],
    },
    {
      title: "Postes y malla",
      description: "Datos de tu proveedor. El poste se entierra y se funde con concreto.",
      fields: [
        { key: "postSpacing", label: "Separación de postes", unit: "m", persist: true },
        { key: "embedDepth", label: "Poste enterrado", unit: "m", persist: true },
        { key: "postPieceLength", label: "Largo del tubo de poste", unit: "m", persist: true },
        { key: "railPieceLength", label: "Largo del tubo superior", unit: "m", persist: true },
        { key: "meshRollLength", label: "Largo del rollo de malla", unit: "m", persist: true },
        { key: "meshRollHeight", label: "Alto del rollo de malla", unit: "m", persist: true },
        { key: "concretePerPost", label: "Concreto por poste", unit: "m³", persist: true },
        { key: "cementBagsPerCubicMeter", label: "Sacos de cemento por m³", unit: "sacos", persist: true },
        { key: "wastePercentage", label: "Desperdicio", unit: "%", persist: true },
      ],
    },
    {
      title: "Alambre de púas",
      fields: [
        { key: "barbedWireStrands", label: "Hilos de alambre de púas", unit: "hilos", persist: true },
        { key: "barbedWireRollLength", label: "Largo del rollo", unit: "m", persist: true },
      ],
      toggles: [{ key: "barbedWire", title: "Agregar alambre de púas arriba" }],
    },
  ],
  prices: [
    { key: "postPrice", label: "Tubo de poste", unit: "por pieza", kind: "material", keywords: /poste|tubo.*galvaniz/, showWhen: hasFence },
    { key: "railPrice", label: "Tubo superior", unit: "por pieza", kind: "material", keywords: /tubo.*(superior|galvaniz)|riel/ },
    { key: "meshPrice", label: "Malla ciclón", unit: "por rollo", kind: "material", keywords: /ciclon|malla.*(galvaniz|eslabon)/ },
    { key: "barbedWirePrice", label: "Alambre de púas", unit: "por rollo", kind: "material", keywords: /puas/, showWhen: (v) => Boolean(v.flags.barbedWire) },
    { key: "cementPrice", label: "Cemento", unit: "por saco", kind: "material", keywords: /cemento/ },
    { key: "gatePrice", label: "Portón", unit: "por unidad", kind: "material", keywords: /porton/, showWhen: (v) => v.n("gates") > 0 },
    { key: "accessoriesPrice", label: "Accesorios por poste", unit: "por poste", kind: "material", keywords: /accesorio.*poste|tensor|abrazadera/ },
    { key: "laborPrice", label: "Instalación de la cerca", unit: "por metro", kind: "labor", keywords: /cerca|ciclon/ },
  ],
  validate: (v) => {
    if (!hasFence(v)) return "Escribe el largo y la altura de la cerca.";
    if (v.n("postSpacing") <= 0) return "Escribe la separación entre postes.";
    if (v.n("gates") * v.n("gateWidth") >= v.n("length")) return "Los portones no pueden ocupar todo el perímetro.";
    if (v.n("meshRollLength") <= 0 || v.n("meshRollHeight") <= 0) return "Escribe el largo y el alto del rollo de malla.";
    if (v.n("postPieceLength") <= 0 || v.n("railPieceLength") <= 0) return "Escribe el largo de los tubos.";
    return null;
  },
  compute: (v) => calculateFence(inputFrom(v), pricesFrom(v)),
  resultRows: (r) => {
    const rows = [
      { label: "Postes", value: `${r.posts} und. · ${r.postPieces} tubos`, strong: true },
      { label: "Tubo superior", value: `${r.railPieces} piezas` },
      { label: "Malla ciclón", value: `${r.meshRolls} rollos` },
      { label: "Cemento para los postes", value: `${r.cementBags} sacos · ${r.concreteVolume.toFixed(2)} m³` },
    ];
    if (r.barbedWireRolls) rows.push({ label: "Alambre de púas", value: `${r.barbedWireRolls} rollos` });
    if (r.gates) rows.push({ label: "Portones", value: `${r.gates} und.` });
    return rows;
  },
  buildLine: (r, c) =>
    makeLine({
      description: "Cerca de malla ciclón",
      unit: "m",
      quantity: r.fenceLength,
      total: r.totalCost,
      costTotal: c.totalCost,
      materials: compactMaterials([
        material("Tubo de poste", r.postPieces, "und.", c.postCost),
        material("Tubo superior", r.railPieces, "und.", c.railCost),
        material("Malla ciclón", r.meshRolls, "rollo", c.meshCost),
        material("Alambre de púas", r.barbedWireRolls, "rollo", c.barbedWireCost),
        material("Cemento", r.cementBags, "saco", c.cementCost),
        material("Portón", r.gates, "und.", c.gateCost),
      ]),
      notes: `${r.posts} postes · ${r.meshRolls} rollos de malla`,
    }),
};
