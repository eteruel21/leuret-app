import {
  compactMaterials,
  makeLine,
  material,
  type CalculatorConfig,
  type ResultRow,
  type Values,
} from "@/components/calculators/CalculatorScreen";
import {
  calculatePool,
  type PoolInput,
  type PoolPrices,
  type PoolResult,
} from "@/utils/pool-facade-calculations";

const hasPool = (v: Values) => v.n("length") > 0 && v.n("width") > 0 && v.n("deepDepth") > 0;
const tileOn = (v: Values) => Boolean(v.flags.includeTile);
const waterproofOn = (v: Values) => Boolean(v.flags.includeWaterproofing);
const pumpOn = (v: Values) => Boolean(v.flags.includePump);
const filterOn = (v: Values) => Boolean(v.flags.includeFilter);

function inputFrom(v: Values): PoolInput {
  return {
    length: v.n("length"),
    width: v.n("width"),
    shallowDepth: v.n("shallowDepth"),
    deepDepth: v.n("deepDepth"),
    wallThickness: v.n("wallThickness"),
    floorThickness: v.n("floorThickness"),
    overdig: v.n("overdig"),
    swellFactor: v.n("swellFactor"),
    bedThickness: v.n("bedThickness"),
    bedLooseFactor: v.n("bedLooseFactor"),
    bedWastePercentage: v.n("bedWastePercentage"),
    concreteWastePercentage: v.n("concreteWastePercentage"),
    mixCement: v.n("mixCement"),
    mixSand: v.n("mixSand"),
    mixGravel: v.n("mixGravel"),
    cementBagWeight: v.n("cementBagWeight"),
    rebarKgPerCubicMeter: v.n("rebarKgPerCubicMeter"),
    rebarPieceKg: v.n("rebarPieceKg"),
    rebarWastePercentage: v.n("rebarWastePercentage"),
    includeTile: tileOn(v),
    tileWastePercentage: v.n("tileWastePercentage"),
    adhesiveKgPerSquareMeter: v.n("adhesiveKgPerSquareMeter"),
    adhesiveBagKg: v.n("adhesiveBagKg"),
    groutKgPerSquareMeter: v.n("groutKgPerSquareMeter"),
    groutBagKg: v.n("groutBagKg"),
    includeWaterproofing: waterproofOn(v),
    waterproofingCoats: v.n("waterproofingCoats"),
    waterproofingCoverage: v.n("waterproofingCoverage"),
    skimmers: v.n("skimmers"),
    returnJets: v.n("returnJets"),
    floorDrains: v.n("floorDrains"),
    pipeMeters: v.n("pipeMeters"),
    pipePieceLength: v.n("pipePieceLength"),
    pipeFittingsPercentage: v.n("pipeFittingsPercentage"),
    includePump: pumpOn(v),
    includeFilter: filterOn(v),
  };
}

function pricesFrom(v: Values): PoolPrices {
  return {
    cementBag: v.n("cementPrice"),
    sandCubicMeter: v.n("sandPrice"),
    gravelCubicMeter: v.n("gravelPrice"),
    rebarPiece: v.n("rebarPrice"),
    tileSquareMeter: v.n("tilePrice"),
    adhesiveBag: v.n("adhesivePrice"),
    groutBag: v.n("groutPrice"),
    waterproofingGallon: v.n("waterproofingPrice"),
    skimmer: v.n("skimmerPrice"),
    returnJet: v.n("returnJetPrice"),
    floorDrain: v.n("floorDrainPrice"),
    pipePiece: v.n("pipePrice"),
    pump: v.n("pumpPrice"),
    filter: v.n("filterPrice"),
    laborExcavationCubicMeter: v.n("laborExcavationPrice"),
    laborShellCubicMeter: v.n("laborShellPrice"),
    laborTileSquareMeter: v.n("laborTilePrice"),
    laborEquipment: v.n("laborEquipmentPrice"),
  };
}

export const piscinaConfig: CalculatorConfig<PoolResult> = {
  id: "pool",
  settingsKey: "calculator.piscina",
  title: "Piscina de concreto",
  subtitle: "Excavación, vaso de concreto reforzado, revestimiento, impermeabilizante y equipo de filtración.",
  icon: "water-outline",
  calculateLabel: "Calcular piscina",
  defaults: {
    length: "", width: "", shallowDepth: "1.2", deepDepth: "1.8", wallThickness: "0.20", floorThickness: "0.20",
    overdig: "0.5", swellFactor: "1.25", bedThickness: "0.10", bedLooseFactor: "1.2", bedWastePercentage: "10",
    concreteWastePercentage: "5", mixCement: "1", mixSand: "2", mixGravel: "3", cementBagWeight: "42.5",
    rebarKgPerCubicMeter: "90", rebarPieceKg: "9.1", rebarWastePercentage: "5",
    tileWastePercentage: "10", adhesiveKgPerSquareMeter: "5", adhesiveBagKg: "20", groutKgPerSquareMeter: "0.5",
    groutBagKg: "2", waterproofingCoats: "2", waterproofingCoverage: "3",
    skimmers: "2", returnJets: "4", floorDrains: "1", pipeMeters: "30", pipePieceLength: "6.1",
    pipeFittingsPercentage: "25",
    cementPrice: "", sandPrice: "", gravelPrice: "", rebarPrice: "", tilePrice: "", adhesivePrice: "",
    groutPrice: "", waterproofingPrice: "", skimmerPrice: "", returnJetPrice: "", floorDrainPrice: "",
    pipePrice: "", pumpPrice: "", filterPrice: "", laborExcavationPrice: "", laborShellPrice: "",
    laborTilePrice: "", laborEquipmentPrice: "",
  },
  flagDefaults: { includeTile: true, includeWaterproofing: true, includePump: true, includeFilter: true },
  sections: [
    {
      title: "Vaso de la piscina",
      description: "Medidas interiores. La profundidad promedio sale de la parte baja y la parte honda.",
      fields: [
        { key: "length", label: "Largo", unit: "m" },
        { key: "width", label: "Ancho", unit: "m" },
        { key: "shallowDepth", label: "Profundidad parte baja", unit: "m", persist: true },
        { key: "deepDepth", label: "Profundidad parte honda", unit: "m", persist: true },
        { key: "wallThickness", label: "Espesor de paredes", unit: "m", persist: true },
        { key: "floorThickness", label: "Espesor del fondo", unit: "m", persist: true },
      ],
      info: (v) => {
        if (!hasPool(v)) return null;
        const r = calculatePool(inputFrom(v), pricesFrom(v));
        return `${r.waterVolume.toFixed(1)} m³ de agua (${Math.round(r.waterVolume * 1000).toLocaleString("es-PA")} litros).`;
      },
    },
    {
      title: "Excavación y cama de piedra",
      fields: [
        { key: "overdig", label: "Holgura alrededor del vaso", unit: "m", persist: true },
        { key: "swellFactor", label: "Factor de esponjamiento", persist: true },
        { key: "bedThickness", label: "Cama de piedra", unit: "m", persist: true },
        { key: "bedLooseFactor", label: "Factor suelto de la piedra", persist: true },
        { key: "bedWastePercentage", label: "Desperdicio de piedra", unit: "%", persist: true },
      ],
    },
    {
      title: "Concreto y acero",
      fields: [
        { key: "mixCement", label: "Mezcla: cemento", unit: "parte", persist: true },
        { key: "mixSand", label: "Mezcla: arena", unit: "parte", persist: true },
        { key: "mixGravel", label: "Mezcla: piedra", unit: "parte", persist: true },
        { key: "cementBagWeight", label: "Peso del saco de cemento", unit: "kg", persist: true },
        { key: "concreteWastePercentage", label: "Desperdicio de concreto", unit: "%", persist: true },
        { key: "rebarKgPerCubicMeter", label: "Acero por m³ de concreto", unit: "kg", persist: true },
        { key: "rebarPieceKg", label: "Peso de cada varilla", unit: "kg", persist: true },
        { key: "rebarWastePercentage", label: "Desperdicio de acero", unit: "%", persist: true },
      ],
    },
    {
      title: "Revestimiento",
      description: "Gresite, azulejo o porcelanato en el fondo y las paredes.",
      fields: [
        { key: "tileWastePercentage", label: "Desperdicio de revestimiento", unit: "%", persist: true },
        { key: "adhesiveKgPerSquareMeter", label: "Pegamento por m²", unit: "kg", persist: true },
        { key: "adhesiveBagKg", label: "Peso del saco de pegamento", unit: "kg", persist: true },
        { key: "groutKgPerSquareMeter", label: "Fragua por m²", unit: "kg", persist: true },
        { key: "groutBagKg", label: "Peso de la bolsa de fragua", unit: "kg", persist: true },
      ],
      toggles: [{ key: "includeTile", title: "Incluir revestimiento" }],
    },
    {
      title: "Impermeabilizante",
      fields: [
        { key: "waterproofingCoats", label: "Manos", unit: "manos", persist: true },
        { key: "waterproofingCoverage", label: "Rendimiento por mano", unit: "m²/gal", persist: true },
      ],
      toggles: [{ key: "includeWaterproofing", title: "Incluir impermeabilizante" }],
    },
    {
      title: "Hidráulica y equipo",
      fields: [
        { key: "skimmers", label: "Skimmers (desnatadores)", unit: "und.", persist: true },
        { key: "returnJets", label: "Boquillas de retorno", unit: "und.", persist: true },
        { key: "floorDrains", label: "Desagües de fondo", unit: "und.", persist: true },
        { key: "pipeMeters", label: "Tubería de circulación", unit: "m" },
        { key: "pipePieceLength", label: "Largo de cada tubo", unit: "m", persist: true },
        { key: "pipeFittingsPercentage", label: "Accesorios (% del tubo)", unit: "%", persist: true },
      ],
      toggles: [
        { key: "includePump", title: "Incluir bomba" },
        { key: "includeFilter", title: "Incluir filtro" },
      ],
    },
  ],
  prices: [
    { key: "cementPrice", label: "Cemento", unit: "por saco", kind: "material", keywords: /cemento portland|cemento/ },
    { key: "sandPrice", label: "Arena", unit: "por m³", kind: "material", keywords: /arena/ },
    { key: "gravelPrice", label: "Piedra o grava", unit: "por m³", kind: "material", keywords: /piedra|grava/ },
    { key: "rebarPrice", label: "Varilla de acero 1/2\"", unit: "por varilla", kind: "material", keywords: /varilla.*1\/2|varilla 1_2/ },
    { key: "tilePrice", label: "Gresite o revestimiento de piscina", unit: "por m²", kind: "material", keywords: /gresite|mosaico.*piscina|revestimiento.*piscina/, showWhen: tileOn },
    { key: "adhesivePrice", label: "Pegamento para piscina", unit: "por saco", kind: "material", keywords: /pegamento.*(piscina|porcelanato)/, showWhen: tileOn },
    { key: "groutPrice", label: "Fragua para piscina", unit: "por bolsa", kind: "material", keywords: /fragua.*piscina|fragua/, showWhen: tileOn },
    { key: "waterproofingPrice", label: "Impermeabilizante cementicio", unit: "por galón", kind: "material", keywords: /impermeabilizante.*(cementicio|piscina)/, showWhen: waterproofOn },
    { key: "skimmerPrice", label: "Skimmer", unit: "por unidad", kind: "material", keywords: /skimmer|desnatador/ },
    { key: "returnJetPrice", label: "Boquilla de retorno", unit: "por unidad", kind: "material", keywords: /boquilla.*retorno|retorno.*piscina/ },
    { key: "floorDrainPrice", label: "Desagüe de fondo", unit: "por unidad", kind: "material", keywords: /desague.*fondo|drenaje.*fondo/ },
    { key: "pipePrice", label: "Tubo PVC de circulación 2\"", unit: "por tubo", kind: "material", keywords: /tubo pvc 2.*sch40|pvc.*2.*presion/ },
    { key: "pumpPrice", label: "Bomba de piscina", unit: "por unidad", kind: "material", keywords: /bomba.*piscina/, showWhen: pumpOn },
    { key: "filterPrice", label: "Filtro de arena", unit: "por unidad", kind: "material", keywords: /filtro.*(arena|piscina)/, showWhen: filterOn },
    { key: "laborExcavationPrice", label: "Excavación", unit: "por m³", kind: "labor", keywords: /excavacion/ },
    { key: "laborShellPrice", label: "Vaso de concreto armado", unit: "por m³", kind: "labor", keywords: /vaso.*piscina|piscina.*concreto|concreto armado/ },
    { key: "laborTilePrice", label: "Colocación de revestimiento", unit: "por m²", kind: "labor", keywords: /gresite|revestimiento.*piscina|ceramica|enchape/, showWhen: tileOn },
    { key: "laborEquipmentPrice", label: "Instalación de equipo de filtración", unit: "global", kind: "labor", keywords: /instalacion.*(equipo|filtracion).*piscina|equipo.*piscina/, showWhen: (v) => pumpOn(v) || filterOn(v) },
  ],
  validate: (v) => {
    if (!hasPool(v)) return "Escribe el largo, el ancho y la profundidad de la piscina.";
    if (v.n("shallowDepth") > v.n("deepDepth")) return "La parte baja no puede ser más honda que la parte honda.";
    if (v.n("wallThickness") <= 0 || v.n("floorThickness") <= 0) return "Escribe el espesor de paredes y fondo.";
    if (v.n("mixCement") <= 0 || v.n("mixSand") <= 0) return "Revisa la mezcla: cemento y arena deben ser mayores que 0.";
    return null;
  },
  compute: (v) => {
    const result = calculatePool(inputFrom(v), pricesFrom(v));
    if (!result.concreteVolume) throw new Error("Piscina sin concreto");
    return result;
  },
  resultRows: (r) => {
    const rows: ResultRow[] = [
      { label: "Agua", value: `${r.waterVolume.toFixed(1)} m³`, strong: true },
      { label: "Excavación", value: `${r.excavationVolume.toFixed(1)} m³ (${r.haulVolume.toFixed(1)} m³ a botar)` },
      { label: "Concreto del vaso", value: `${r.concreteVolume.toFixed(2)} m³` },
      { label: "Cemento", value: `${r.cementBags} sacos` },
      { label: "Arena", value: `${r.sandVolume.toFixed(2)} m³` },
      { label: "Piedra (concreto)", value: `${r.gravelVolume.toFixed(2)} m³` },
      { label: "Cama de piedra", value: `${r.bedVolume.toFixed(2)} m³` },
      { label: "Acero de refuerzo", value: `${r.rebarPieces} varillas (${r.rebarKg.toFixed(0)} kg)` },
    ];
    if (r.tileArea) {
      rows.push({ label: "Revestimiento", value: `${r.tileArea.toFixed(1)} m²` });
      rows.push({ label: "Pegamento y fragua", value: `${r.adhesiveBags} sacos · ${r.groutBags} bolsas` });
    }
    if (r.waterproofingGallons) rows.push({ label: "Impermeabilizante", value: `${r.waterproofingGallons} galones` });
    rows.push({
      label: "Hidráulica",
      value: `${r.skimmers} skimmers · ${r.returnJets} retornos · ${r.floorDrains} desagües · ${r.pipePieces} tubos`,
    });
    return rows;
  },
  buildLine: (r, c, v) =>
    makeLine({
      description: "Piscina de concreto",
      unit: "global",
      quantity: 1,
      total: r.totalCost,
      costTotal: c.totalCost,
      materials: compactMaterials([
        material("Cemento", r.cementBags, "saco", c.cementCost),
        material("Arena", Number(r.sandVolume.toFixed(2)), "m³", c.sandCost),
        material("Piedra o grava", Number((r.gravelVolume + r.bedVolume).toFixed(2)), "m³", c.gravelCost + c.bedCost),
        material("Varilla de acero 1/2\"", r.rebarPieces, "varilla", c.rebarCost),
        material("Revestimiento de piscina", Number(r.tileArea.toFixed(1)), "m²", c.tileCost),
        material("Pegamento para piscina", r.adhesiveBags, "saco", c.adhesiveCost),
        material("Fragua para piscina", r.groutBags, "bolsa", c.groutCost),
        material("Impermeabilizante cementicio", r.waterproofingGallons, "gal.", c.waterproofingCost),
        material("Skimmers, retornos y desagües", r.skimmers + r.returnJets + r.floorDrains, "und.", c.fittingsCost),
        material("Tubo PVC de circulación", r.pipePieces, "tubo", c.pipeCost),
        material("Bomba y filtro", r.pump + r.filter, "und.", c.equipmentCost),
      ]),
      notes: `${v.n("length")} x ${v.n("width")} m, ${r.waterVolume.toFixed(1)} m³ de agua`,
    }),
};
