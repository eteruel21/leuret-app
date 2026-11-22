import {
  compactMaterials,
  makeLine,
  material,
  type CalculatorConfig,
  type ResultRow,
  type Values,
} from "@/components/calculators/CalculatorScreen";
import {
  calculateWalkway,
  type WalkwayInput,
  type WalkwayPrices,
  type WalkwayResult,
} from "@/utils/exterior-works-calculations";

const hasWalkway = (v: Values) => v.n("length") * v.n("width") + v.n("extraArea") > 0;

function inputFrom(v: Values): WalkwayInput {
  return {
    length: v.n("length"),
    width: v.n("width"),
    extraArea: v.n("extraArea"),
    thickness: v.n("thickness"),
    baseThickness: v.flags.includeBase ? v.n("baseThickness") : 0,
    baseLooseFactor: v.n("baseLooseFactor"),
    baseWastePercentage: v.n("baseWastePercentage"),
    mixCement: v.n("mixCement"),
    mixSand: v.n("mixSand"),
    mixGravel: v.n("mixGravel"),
    cementBagWeight: v.n("cementBagWeight"),
    concreteWastePercentage: v.n("concreteWastePercentage"),
    includeMesh: Boolean(v.flags.includeMesh),
    meshSheetArea: v.n("meshSheetArea"),
    meshLapPercentage: v.n("meshLapPercentage"),
    jointSpacing: v.flags.includeJoints ? v.n("jointSpacing") : 0,
    metersPerSealantCartridge: v.n("metersPerSealantCartridge"),
    includeSealer: Boolean(v.flags.includeSealer),
    sealerCoverage: v.n("sealerCoverage"),
  };
}

function pricesFrom(v: Values): WalkwayPrices {
  return {
    cementBag: v.n("cementPrice"),
    sandCubicMeter: v.n("sandPrice"),
    gravelCubicMeter: v.n("gravelPrice"),
    baseCubicMeter: v.n("basePrice"),
    meshSheet: v.n("meshPrice"),
    sealantCartridge: v.n("sealantPrice"),
    sealerGallon: v.n("sealerPrice"),
    laborSquareMeter: v.n("laborPrice"),
  };
}

export const aceraConfig: CalculatorConfig<WalkwayResult> = {
  id: "walkway",
  settingsKey: "calculator.acera",
  title: "Aceras y pisos exteriores",
  subtitle: "Concreto, base compactada, malla, juntas de dilatación y sellador.",
  icon: "footsteps-outline",
  calculateLabel: "Calcular acera",
  defaults: {
    length: "", width: "", extraArea: "0", thickness: "0.10", baseThickness: "0.10", baseLooseFactor: "1.25",
    baseWastePercentage: "5", mixCement: "1", mixSand: "2", mixGravel: "3", cementBagWeight: "42.5",
    concreteWastePercentage: "5", meshSheetArea: "14.1", meshLapPercentage: "10", jointSpacing: "2",
    metersPerSealantCartridge: "5", sealerCoverage: "20",
    cementPrice: "", sandPrice: "", gravelPrice: "", basePrice: "", meshPrice: "", sealantPrice: "",
    sealerPrice: "", laborPrice: "",
  },
  flagDefaults: { includeBase: true, includeMesh: true, includeJoints: true, includeSealer: false },
  sections: [
    {
      title: "Medidas",
      fields: [
        { key: "length", label: "Largo", unit: "m" },
        { key: "width", label: "Ancho", unit: "m" },
        { key: "extraArea", label: "Otras áreas", unit: "m²" },
        { key: "thickness", label: "Espesor del concreto", unit: "m", persist: true },
      ],
      info: (v) => {
        if (!hasWalkway(v) || v.n("thickness") <= 0) return null;
        const r = calculateWalkway(inputFrom(v), pricesFrom(v));
        return r.area ? `${r.area.toFixed(2)} m² · ${r.volume.toFixed(2)} m³ de concreto.` : null;
      },
    },
    {
      title: "Concreto",
      fields: [
        { key: "mixCement", label: "Mezcla: cemento", unit: "parte", persist: true },
        { key: "mixSand", label: "Mezcla: arena", unit: "partes", persist: true },
        { key: "mixGravel", label: "Mezcla: piedra", unit: "partes", persist: true },
        { key: "cementBagWeight", label: "Peso del saco de cemento", unit: "kg", persist: true },
        { key: "concreteWastePercentage", label: "Desperdicio de concreto", unit: "%", persist: true },
      ],
    },
    {
      title: "Base compactada",
      fields: [
        { key: "baseThickness", label: "Espesor de la base", unit: "m", persist: true },
        { key: "baseLooseFactor", label: "Factor suelto / compactado", persist: true },
        { key: "baseWastePercentage", label: "Desperdicio de base", unit: "%", persist: true },
      ],
      toggles: [{ key: "includeBase", title: "Incluir base de material selecto" }],
    },
    {
      title: "Malla y juntas",
      fields: [
        { key: "meshSheetArea", label: "Área de la lámina de malla", unit: "m²", persist: true },
        { key: "meshLapPercentage", label: "Traslape de malla", unit: "%", persist: true },
        { key: "jointSpacing", label: "Separación de juntas", unit: "m", persist: true },
        { key: "metersPerSealantCartridge", label: "Metros por cartucho de sellador", unit: "m", persist: true },
      ],
      toggles: [
        { key: "includeMesh", title: "Incluir malla electrosoldada" },
        { key: "includeJoints", title: "Incluir juntas de dilatación y sellador" },
      ],
    },
    {
      title: "Sellador de superficie",
      fields: [{ key: "sealerCoverage", label: "Rendimiento por galón", unit: "m²", persist: true }],
      toggles: [{ key: "includeSealer", title: "Incluir sellador acrílico" }],
    },
  ],
  prices: [
    { key: "cementPrice", label: "Cemento", unit: "por saco", kind: "material", keywords: /cemento/, showWhen: hasWalkway },
    { key: "sandPrice", label: "Arena", unit: "por m³", kind: "material", keywords: /arena/ },
    { key: "gravelPrice", label: "Piedra", unit: "por m³", kind: "material", keywords: /piedra|gravilla|grava/ },
    { key: "basePrice", label: "Material selecto", unit: "por m³", kind: "material", keywords: /material selecto/, showWhen: (v) => Boolean(v.flags.includeBase) },
    { key: "meshPrice", label: "Malla electrosoldada", unit: "por lámina", kind: "material", keywords: /malla electrosoldada/, showWhen: (v) => Boolean(v.flags.includeMesh) },
    { key: "sealantPrice", label: "Sellador de juntas", unit: "por cartucho", kind: "material", keywords: /sellador.*(poliuretano|junta)|poliuretano/, showWhen: (v) => Boolean(v.flags.includeJoints) },
    { key: "sealerPrice", label: "Sellador acrílico", unit: "por galón", kind: "material", keywords: /sellador acrilico/, showWhen: (v) => Boolean(v.flags.includeSealer) },
    { key: "laborPrice", label: "Colado y acabado de acera", unit: "por m²", kind: "labor", keywords: /acera|acabado.*(escobill|concreto)/ },
  ],
  validate: (v) => {
    if (!hasWalkway(v)) return "Escribe el largo y el ancho de la acera.";
    if (v.n("thickness") <= 0) return "Escribe el espesor del concreto.";
    if (v.n("mixCement") <= 0 || v.n("mixSand") <= 0) return "Revisa la mezcla: cemento y arena deben ser mayores que 0.";
    if (v.flags.includeMesh && v.n("meshSheetArea") <= 0) return "Escribe el área de la lámina de malla.";
    if (v.flags.includeJoints && v.n("metersPerSealantCartridge") <= 0) return "Escribe los metros por cartucho de sellador.";
    if (v.flags.includeSealer && v.n("sealerCoverage") <= 0) return "Escribe el rendimiento del sellador.";
    return null;
  },
  compute: (v) => {
    const result = calculateWalkway(inputFrom(v), pricesFrom(v));
    if (!result.area) throw new Error("Acera sin área");
    return result;
  },
  resultRows: (r) => {
    const rows: ResultRow[] = [
      { label: "Área", value: `${r.area.toFixed(2)} m²`, strong: true },
      { label: "Concreto", value: `${r.volume.toFixed(2)} m³` },
      { label: "Cemento", value: `${r.cementBagsToBuy} sacos` },
      { label: "Arena", value: `${r.sandVolume.toFixed(2)} m³` },
      { label: "Piedra", value: `${r.gravelVolume.toFixed(2)} m³` },
    ];
    if (r.baseVolume) rows.push({ label: "Material selecto (suelto)", value: `${r.baseVolume.toFixed(2)} m³` });
    if (r.meshSheets) rows.push({ label: "Malla electrosoldada", value: `${r.meshSheets} láminas` });
    if (r.jointLength) rows.push({ label: "Juntas", value: `${r.jointLength.toFixed(1)} m · ${r.sealantCartridges} cartuchos` });
    if (r.sealerGallons) rows.push({ label: "Sellador acrílico", value: `${r.sealerGallons} galones` });
    return rows;
  },
  buildLine: (r, c) =>
    makeLine({
      description: "Acera o piso exterior de concreto",
      unit: "m²",
      quantity: Number(r.area.toFixed(2)),
      total: r.totalCost,
      costTotal: c.totalCost,
      materials: compactMaterials([
        material("Cemento", r.cementBagsToBuy, "saco", c.cementCost),
        material("Arena", Number(r.sandVolume.toFixed(2)), "m³", c.sandCost),
        material("Piedra", Number(r.gravelVolume.toFixed(2)), "m³", c.gravelCost),
        material("Material selecto", Number(r.baseVolume.toFixed(2)), "m³", c.baseCost),
        material("Malla electrosoldada", r.meshSheets, "lám.", c.meshCost),
        material("Sellador de juntas", r.sealantCartridges, "cartucho", c.sealantCost),
        material("Sellador acrílico", r.sealerGallons, "gal.", c.sealerCost),
      ]),
      notes: `${r.area.toFixed(2)} m² · ${r.volume.toFixed(2)} m³ de concreto`,
    }),
};
