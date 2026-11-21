import {
  compactMaterials,
  makeLine,
  material,
  type CalculatorConfig,
  type ResultRow,
  type Values,
} from "@/components/calculators/CalculatorScreen";
import {
  calculatePanel,
  type PanelInput,
  type PanelPrices,
  type PanelResult,
} from "@/utils/ceiling-panel-calculations";

function inputFrom(v: Values): PanelInput {
  const n = v.n;
  return {
    singlePole15: n("singlePole15"),
    singlePole20: n("singlePole20"),
    doublePole30: n("doublePole30"),
    doublePole50: n("doublePole50"),
    reservePercentage: n("reservePercentage"),
    rods: v.flags.includeGrounding ? n("rods") : 0,
    groundCableLength: v.flags.includeGrounding ? n("groundCableLength") : 0,
    cableWastePercentage: n("cableWastePercentage"),
  };
}

function pricesFrom(v: Values): PanelPrices {
  const n = v.n;
  return {
    panel: n("panelPrice"),
    mainBreaker: n("mainBreakerPrice"),
    breaker15: n("breaker15Price"),
    breaker20: n("breaker20Price"),
    breaker2p30: n("breaker2p30Price"),
    breaker2p50: n("breaker2p50Price"),
    rod: n("rodPrice"),
    groundCableMeter: n("groundCablePrice"),
    rodClamp: n("clampPrice"),
    laborPanel: n("laborPanelPrice"),
    laborCircuit: n("laborCircuitPrice"),
    laborGrounding: n("laborGroundingPrice"),
  };
}

const hasCircuits = (v: Values) =>
  v.n("singlePole15") + v.n("singlePole20") + v.n("doublePole30") + v.n("doublePole50") > 0;

export const centroCargaConfig: CalculatorConfig<PanelResult> = {
  id: "panel-grounding",
  settingsKey: "calculator.centro-carga",
  title: "Centro de carga y tierra",
  subtitle: "Tamaño del centro de carga, interruptores, varillas y cable de tierra.",
  icon: "flash-outline",
  calculateLabel: "Calcular centro de carga",
  defaults: {
    singlePole15: "", singlePole20: "", doublePole30: "", doublePole50: "", reservePercentage: "20",
    rods: "1", groundCableLength: "", cableWastePercentage: "10",
    panelPrice: "", mainBreakerPrice: "", breaker15Price: "", breaker20Price: "", breaker2p30Price: "",
    breaker2p50Price: "", rodPrice: "", groundCablePrice: "", clampPrice: "",
    laborPanelPrice: "", laborCircuitPrice: "", laborGroundingPrice: "",
  },
  flagDefaults: { includeGrounding: true },
  sections: [
    {
      title: "Circuitos",
      description: "Cuenta los circuitos que salen del centro de carga, por tipo de interruptor.",
      fields: [
        { key: "singlePole15", label: "Circuitos de 1 polo, 15 A", unit: "und." },
        { key: "singlePole20", label: "Circuitos de 1 polo, 20 A", unit: "und." },
        { key: "doublePole30", label: "Circuitos de 2 polos, 30 A", unit: "und." },
        { key: "doublePole50", label: "Circuitos de 2 polos, 40 o 50 A", unit: "und." },
        { key: "reservePercentage", label: "Espacios de reserva", unit: "%", persist: true },
      ],
      info: (v) => {
        if (!hasCircuits(v)) return null;
        const r = calculatePanel(inputFrom(v), pricesFrom(v));
        return `Usa ${r.spacesUsed} espacios; con reserva, un centro de carga de ${r.panelSpaces}.`;
      },
    },
    {
      title: "Puesta a tierra",
      fields: [
        { key: "rods", label: "Varillas de tierra", unit: "und.", persist: true },
        { key: "groundCableLength", label: "Cable desnudo hasta el centro de carga", unit: "m" },
        { key: "cableWastePercentage", label: "Desperdicio de cable", unit: "%", persist: true },
      ],
      toggles: [{ key: "includeGrounding", title: "Incluir puesta a tierra" }],
    },
  ],
  prices: [
    { key: "panelPrice", label: "Centro de carga", unit: "por unidad", kind: "material", keywords: /centro de carga|panel electrico/, showWhen: hasCircuits },
    { key: "mainBreakerPrice", label: "Interruptor principal", unit: "por unidad", kind: "material", keywords: /principal|main|breaker.*(100|60)/ },
    { key: "breaker15Price", label: "Breaker 1 polo 15 A", unit: "por unidad", kind: "material", keywords: /breaker.*1 polo 15/, showWhen: (v) => v.n("singlePole15") > 0 },
    { key: "breaker20Price", label: "Breaker 1 polo 20 A", unit: "por unidad", kind: "material", keywords: /breaker.*1 polo 20/, showWhen: (v) => v.n("singlePole20") > 0 },
    { key: "breaker2p30Price", label: "Breaker 2 polos 30 A", unit: "por unidad", kind: "material", keywords: /breaker.*2 polos 30/, showWhen: (v) => v.n("doublePole30") > 0 },
    { key: "breaker2p50Price", label: "Breaker 2 polos 40 o 50 A", unit: "por unidad", kind: "material", keywords: /breaker.*2 polos (40|50)/, showWhen: (v) => v.n("doublePole50") > 0 },
    { key: "rodPrice", label: "Varilla de tierra", unit: "por unidad", kind: "material", keywords: /varilla.*tierra|jabalina/, showWhen: (v) => Boolean(v.flags.includeGrounding) },
    { key: "groundCablePrice", label: "Cable de cobre desnudo", unit: "por metro", kind: "material", keywords: /cable.*desnudo|cobre desnudo/, showWhen: (v) => Boolean(v.flags.includeGrounding) },
    { key: "clampPrice", label: "Abrazadera para varilla", unit: "por unidad", kind: "material", keywords: /abrazadera.*(varilla|tierra)|conector.*tierra/, showWhen: (v) => Boolean(v.flags.includeGrounding) },
    { key: "laborPanelPrice", label: "Instalación del centro de carga", unit: "global", kind: "labor", keywords: /instalacion.*centro de carga|centro de carga/ },
    { key: "laborCircuitPrice", label: "Conexión por circuito", unit: "por circuito", kind: "labor", keywords: /circuito/ },
    { key: "laborGroundingPrice", label: "Puesta a tierra", unit: "global", kind: "labor", keywords: /puesta a tierra/, showWhen: (v) => Boolean(v.flags.includeGrounding) },
  ],
  validate: (v) => {
    if (!hasCircuits(v)) return "Escribe al menos un circuito.";
    if (v.n("reservePercentage") > 100) return "La reserva debe estar entre 0% y 100%.";
    if (v.flags.includeGrounding && v.n("rods") > 0 && v.n("groundCableLength") <= 0) {
      return "Escribe los metros de cable de tierra.";
    }
    return null;
  },
  compute: (v) => calculatePanel(inputFrom(v), pricesFrom(v)),
  resultRows: (r) => {
    const rows: ResultRow[] = [
      { label: "Centro de carga", value: `${r.panelSpaces} espacios`, strong: true },
      { label: "Circuitos", value: `${r.circuits} (usa ${r.spacesUsed} espacios, con reserva ${r.spacesNeeded})` },
    ];
    if (r.breaker15) rows.push({ label: "Breaker 1 polo 15 A", value: `${r.breaker15} und.` });
    if (r.breaker20) rows.push({ label: "Breaker 1 polo 20 A", value: `${r.breaker20} und.` });
    if (r.breaker2p30) rows.push({ label: "Breaker 2 polos 30 A", value: `${r.breaker2p30} und.` });
    if (r.breaker2p50) rows.push({ label: "Breaker 2 polos 40 o 50 A", value: `${r.breaker2p50} und.` });
    if (r.rods) rows.push({ label: "Tierra", value: `${r.rods} varillas · ${r.groundCable.toFixed(1)} m de cable` });
    return rows;
  },
  buildLine: (r, c) =>
    makeLine({
      description: `Centro de carga de ${r.panelSpaces} espacios con puesta a tierra`,
      unit: "und.",
      quantity: 1,
      total: r.totalCost,
      costTotal: c.totalCost,
      materials: compactMaterials([
        material("Centro de carga", 1, "und.", c.panelCost),
        material("Interruptor principal", 1, "und.", c.mainBreakerCost),
        material("Breaker 1 polo 15 A", r.breaker15, "und.", c.breaker15Cost),
        material("Breaker 1 polo 20 A", r.breaker20, "und.", c.breaker20Cost),
        material("Breaker 2 polos 30 A", r.breaker2p30, "und.", c.breaker2p30Cost),
        material("Breaker 2 polos 40 o 50 A", r.breaker2p50, "und.", c.breaker2p50Cost),
        material("Varilla de tierra", r.rods, "und.", c.rodCost),
        material("Cable de cobre desnudo", Number(r.groundCable.toFixed(1)), "m", c.cableCost),
        material("Abrazadera para varilla", r.rodClamps, "und.", c.clampCost),
      ]),
      notes: `${r.circuits} circuitos · ${r.rods} varillas de tierra`,
    }),
};
