import {
  compactMaterials,
  makeLine,
  material,
  type CalculatorConfig,
  type ResultRow,
  type Values,
} from "@/components/calculators/CalculatorScreen";
import {
  calculateSolar,
  type SolarInput,
  type SolarPrices,
  type SolarResult,
} from "@/utils/hvac-solar-calculations";

const hasConsumption = (v: Values) => v.n("monthlyKwh") > 0;
const batteryOn = (v: Values) => Boolean(v.flags.includeBattery);

function inputFrom(v: Values): SolarInput {
  return {
    monthlyKwh: v.n("monthlyKwh"),
    sunHours: v.n("sunHours"),
    lossPercentage: v.n("lossPercentage"),
    panelWatts: v.n("panelWatts"),
    panelArea: v.n("panelArea"),
    availableArea: v.n("availableArea"),
    dcAcRatio: v.n("dcAcRatio"),
    panelsPerString: v.n("panelsPerString"),
    runPerString: v.n("runPerString"),
    rows: v.n("rows"),
    railMetersPerPanel: v.n("railMetersPerPanel"),
    railPieceLength: v.n("railPieceLength"),
    feetPerPanel: v.n("feetPerPanel"),
    acRun: v.n("acRun"),
    acVoltage: v.n("acVoltage"),
    includeBattery: batteryOn(v),
    criticalKwhPerDay: v.n("criticalKwhPerDay"),
    autonomyDays: v.n("autonomyDays"),
    batteryUsableKwh: v.n("batteryUsableKwh"),
  };
}

function pricesFrom(v: Values): SolarPrices {
  return {
    panel: v.n("panelPrice"),
    inverter: v.n("inverterPrice"),
    railPiece: v.n("railPrice"),
    midClamp: v.n("midClampPrice"),
    endClamp: v.n("endClampPrice"),
    foot: v.n("footPrice"),
    pvCableMeter: v.n("pvCablePrice"),
    connectorPair: v.n("connectorPrice"),
    acBreaker: v.n("acBreakerPrice"),
    acCableMeter: v.n("acCablePrice"),
    battery: v.n("batteryPrice"),
    laborKwp: v.n("laborKwpPrice"),
  };
}

export const panelesSolaresConfig: CalculatorConfig<SolarResult> = {
  id: "solar",
  settingsKey: "calculator.paneles-solares",
  title: "Paneles solares",
  subtitle: "Paneles según tu consumo, inversor, estructura de montaje, cableado y baterías opcionales.",
  icon: "sunny-outline",
  calculateLabel: "Calcular sistema solar",
  defaults: {
    monthlyKwh: "", sunHours: "4.5", lossPercentage: "20", panelWatts: "550", panelArea: "2.6", availableArea: "0",
    dcAcRatio: "1.2", panelsPerString: "10", runPerString: "15", rows: "2", railMetersPerPanel: "2.3",
    railPieceLength: "4.2", feetPerPanel: "2", acRun: "10", acVoltage: "240", criticalKwhPerDay: "5",
    autonomyDays: "1", batteryUsableKwh: "5",
    panelPrice: "", inverterPrice: "", railPrice: "", midClampPrice: "", endClampPrice: "", footPrice: "",
    pvCablePrice: "", connectorPrice: "", acBreakerPrice: "", acCablePrice: "", batteryPrice: "", laborKwpPrice: "",
  },
  flagDefaults: { includeBattery: false },
  sections: [
    {
      title: "Consumo y sol",
      description: "El consumo mensual está en la factura de luz. Las horas de sol pico son las horas equivalentes de sol pleno al día.",
      fields: [
        { key: "monthlyKwh", label: "Consumo mensual", unit: "kWh" },
        { key: "sunHours", label: "Horas de sol pico", unit: "h/día", persist: true },
        { key: "lossPercentage", label: "Pérdidas del sistema", unit: "%", persist: true },
      ],
      info: (v) => {
        if (!hasConsumption(v)) return null;
        const r = calculateSolar(inputFrom(v), pricesFrom(v));
        if (!r.panels) return null;
        return `Hace falta un sistema de ${r.requiredKwp.toFixed(2)} kWp.`;
      },
    },
    {
      title: "Paneles y techo",
      fields: [
        { key: "panelWatts", label: "Potencia de cada panel", unit: "W", persist: true },
        { key: "panelArea", label: "Área de cada panel", unit: "m²", persist: true },
        { key: "availableArea", label: "Área disponible en el techo (0 = sin límite)", unit: "m²" },
        { key: "dcAcRatio", label: "Relación paneles/inversor", persist: true },
      ],
    },
    {
      title: "Cableado y montaje",
      fields: [
        { key: "panelsPerString", label: "Paneles por cadena", unit: "und.", persist: true },
        { key: "runPerString", label: "Cable de cada cadena al inversor", unit: "m", persist: true },
        { key: "rows", label: "Filas de paneles", unit: "filas", persist: true },
        { key: "railMetersPerPanel", label: "Riel por panel", unit: "m", persist: true },
        { key: "railPieceLength", label: "Largo de cada riel", unit: "m", persist: true },
        { key: "feetPerPanel", label: "Patas de anclaje por panel", unit: "und.", persist: true },
        { key: "acRun", label: "Cable del inversor al centro de carga", unit: "m", persist: true },
        { key: "acVoltage", label: "Voltaje de salida", unit: "V", persist: true },
      ],
    },
    {
      title: "Baterías",
      description: "Solo si quieres respaldo para cortes de luz.",
      fields: [
        { key: "criticalKwhPerDay", label: "Consumo a respaldar", unit: "kWh/día", persist: true },
        { key: "autonomyDays", label: "Días de autonomía", unit: "días", persist: true },
        { key: "batteryUsableKwh", label: "Energía útil por batería", unit: "kWh", persist: true },
      ],
      toggles: [{ key: "includeBattery", title: "Incluir baterías" }],
    },
  ],
  prices: [
    { key: "panelPrice", label: "Panel solar", unit: "por panel", kind: "material", keywords: /panel solar/ },
    { key: "inverterPrice", label: "Inversor (capacidad calculada)", unit: "por unidad", kind: "material", keywords: /inversor/ },
    { key: "railPrice", label: "Riel de aluminio", unit: "por riel", kind: "material", keywords: /riel.*(aluminio|solar)/ },
    { key: "midClampPrice", label: "Abrazadera intermedia", unit: "por unidad", kind: "material", keywords: /abrazadera.*intermedia|clamp.*intermedi/ },
    { key: "endClampPrice", label: "Abrazadera de extremo", unit: "por unidad", kind: "material", keywords: /abrazadera.*extremo|clamp.*extremo/ },
    { key: "footPrice", label: "Pata de anclaje al techo", unit: "por unidad", kind: "material", keywords: /pata.*(anclaje|techo)|gancho.*techo/ },
    { key: "pvCablePrice", label: "Cable solar 4 mm²", unit: "por m", kind: "material", keywords: /cable.*solar|cable.*fotovoltaic/ },
    { key: "connectorPrice", label: "Conectores MC4 (par)", unit: "por par", kind: "material", keywords: /mc4|conector.*solar/ },
    { key: "acBreakerPrice", label: "Breaker del inversor (amperaje indicado)", unit: "por unidad", kind: "material", keywords: /breaker.*2p|breaker 2 polos/ },
    { key: "acCablePrice", label: "Cable THHN de salida", unit: "por m", kind: "material", keywords: /thhn/ },
    { key: "batteryPrice", label: "Batería de litio", unit: "por batería", kind: "material", keywords: /bateria.*(litio|solar)/, showWhen: batteryOn },
    { key: "laborKwpPrice", label: "Instalación de sistema solar", unit: "por kWp", kind: "labor", keywords: /instalacion.*(solar|fotovoltaic)/ },
  ],
  validate: (v) => {
    if (!hasConsumption(v)) return "Escribe el consumo mensual en kWh.";
    if (v.n("sunHours") <= 0) return "Escribe las horas de sol pico.";
    if (v.n("panelWatts") <= 0) return "Escribe la potencia de cada panel.";
    if (v.n("lossPercentage") >= 100) return "Las pérdidas deben ser menores que 100%.";
    if (v.n("panelsPerString") < 1) return "Escribe cuántos paneles van por cadena.";
    return null;
  },
  compute: (v) => {
    const result = calculateSolar(inputFrom(v), pricesFrom(v));
    if (!result.panels) throw new Error("Solar sin paneles");
    return result;
  },
  resultRows: (r) => {
    const rows: ResultRow[] = [
      { label: "Paneles", value: `${r.panels} (${r.installedKwp.toFixed(2)} kWp)`, strong: true },
      { label: "Producción mensual", value: `${Math.round(r.monthlyProduction)} kWh (${Math.round(r.coveragePercent)}% del consumo)` },
      { label: "Área en el techo", value: `${r.areaNeeded.toFixed(1)} m²` },
      { label: "Inversor", value: `${r.inverterKw.toFixed(1)} kW · breaker de ${r.acBreakerAmps} A` },
      { label: "Cadenas", value: `${r.strings} · ${r.pvCableMeters} m de cable solar · ${r.connectorPairs} pares MC4` },
      { label: "Montaje", value: `${r.railPieces} rieles · ${r.midClamps + r.endClamps} abrazaderas · ${r.feet} patas` },
    ];
    if (r.limitedByArea) {
      rows.push({ label: "Aviso", value: `El techo permite ${r.panels} de ${r.panelsNeeded} paneles necesarios` });
    }
    if (r.batteries) rows.push({ label: "Baterías", value: `${r.batteries} und.` });
    return rows;
  },
  buildLine: (r, c) =>
    makeLine({
      description: "Sistema de paneles solares",
      unit: "kWp",
      quantity: Number(r.installedKwp.toFixed(2)),
      total: r.totalCost,
      costTotal: c.totalCost,
      materials: compactMaterials([
        material("Panel solar", r.panels, "und.", c.panelCost),
        material(`Inversor ${r.inverterKw.toFixed(1)} kW`, 1, "und.", c.inverterCost),
        material("Riel de aluminio", r.railPieces, "riel", c.railCost),
        material("Abrazaderas de panel", r.midClamps + r.endClamps, "und.", c.clampCost),
        material("Pata de anclaje al techo", r.feet, "und.", c.footCost),
        material("Cable solar 4 mm²", r.pvCableMeters, "m", c.pvCableCost),
        material("Conectores MC4", r.connectorPairs, "par", c.connectorCost),
        material(`Breaker 2P ${r.acBreakerAmps} A`, 1, "und.", c.acBreakerCost),
        material("Cable THHN de salida", r.acCableMeters, "m", c.acCableCost),
        material("Batería de litio", r.batteries, "und.", c.batteryCost),
      ]),
      notes: `${r.panels} paneles, ${r.installedKwp.toFixed(2)} kWp`,
    }),
};
