import {
  compactMaterials,
  makeLine,
  material,
  type CalculatorConfig,
  type Values,
} from "@/components/calculators/CalculatorScreen";
import { formatMoney } from "@/utils/format";
import {
  calculatePlumbing,
  type PlumbingInput,
  type PlumbingPrices,
  type PlumbingResult,
} from "@/utils/construction-calculations";

function inputFrom(v: Values): PlumbingInput {
  const n = v.n;
  return {
    toilets: n("toilets"),
    sinks: n("sinks"),
    showers: n("showers"),
    kitchenSinks: n("kitchenSinks"),
    laundry: n("laundry"),
    outdoorTaps: n("outdoorTaps"),
    supplyRoutePerPoint: n("supplyRoutePerPoint"),
    drainRoutePerPoint: n("drainRoutePerPoint"),
    toiletDrainRoute: n("toiletDrainRoute"),
    pipePieceLength: n("pipePieceLength"),
    fittingsPercentage: n("fittingsPercentage"),
    wastePercentage: n("wastePercentage"),
    septicTanks: n("septicTanks"),
    includeFixtures: Boolean(v.flags.includeFixtures),
  };
}

function pricesFrom(v: Values): PlumbingPrices {
  const n = v.n;
  return {
    supplyPipe: n("supplyPipePrice"),
    drainPipe2: n("drainPipe2Price"),
    drainPipe4: n("drainPipe4Price"),
    valve: n("valvePrice"),
    toilet: n("toiletPrice"),
    sink: n("sinkPrice"),
    shower: n("showerPrice"),
    kitchenSink: n("kitchenSinkPrice"),
    laundrySink: n("laundryPrice"),
    septicTank: n("septicPrice"),
    supplies: n("suppliesPrice"),
    laborPoint: n("laborPrice"),
  };
}

const points = (v: Values) =>
  v.n("toilets") + v.n("sinks") + v.n("showers") + v.n("kitchenSinks") + v.n("laundry") + v.n("outdoorTaps");
const fixtures = (v: Values) => Boolean(v.flags.includeFixtures);

export const plomeriaConfig: CalculatorConfig<PlumbingResult> = {
  id: "plumbing",
  settingsKey: "calculator.plomeria",
  title: "Plomería",
  subtitle: "Tubería de agua y drenaje, accesorios, aparatos y mano de obra.",
  icon: "water-outline",
  calculateLabel: "Calcular plomería",
  defaults: {
    toilets: "", sinks: "", showers: "", kitchenSinks: "", laundry: "", outdoorTaps: "", septicTanks: "",
    supplyRoutePerPoint: "6", drainRoutePerPoint: "4", toiletDrainRoute: "3",
    pipePieceLength: "6.10", fittingsPercentage: "30", wastePercentage: "10",
    supplyPipePrice: "", drainPipe2Price: "", drainPipe4Price: "", valvePrice: "",
    toiletPrice: "", sinkPrice: "", showerPrice: "", kitchenSinkPrice: "", laundryPrice: "",
    septicPrice: "", suppliesPrice: "", laborPrice: "",
  },
  flagDefaults: { includeFixtures: false },
  sections: [
    {
      title: "Aparatos y puntos",
      description: "Cuántos hay de cada uno. Los que no lleve la obra se dejan vacíos.",
      fields: [
        { key: "toilets", label: "Inodoros", unit: "und." },
        { key: "sinks", label: "Lavamanos", unit: "und." },
        { key: "showers", label: "Duchas", unit: "und." },
        { key: "kitchenSinks", label: "Fregaderos de cocina", unit: "und." },
        { key: "laundry", label: "Lavadero o lavadora", unit: "und." },
        { key: "outdoorTaps", label: "Llaves exteriores", unit: "und." },
        { key: "septicTanks", label: "Tanque séptico", unit: "und." },
      ],
      toggles: [
        {
          key: "includeFixtures",
          title: "Incluir los aparatos",
          subtitle: "Apágalo si el cliente los compra y tú solo instalas.",
        },
      ],
      info: (v) => (points(v) ? `${points(v)} puntos de agua.` : null),
    },
    {
      title: "Recorridos y tubería",
      description: "Distancia promedio de la tubería hasta cada punto.",
      fields: [
        { key: "supplyRoutePerPoint", label: "Agua potable por punto", unit: "m", persist: true },
        { key: "drainRoutePerPoint", label: "Drenaje de 2\" por punto", unit: "m", persist: true },
        { key: "toiletDrainRoute", label: "Drenaje de 4\" por inodoro", unit: "m", persist: true },
        { key: "pipePieceLength", label: "Largo del tubo", unit: "m", persist: true },
        { key: "fittingsPercentage", label: "Accesorios (codos, tees, uniones)", unit: "% de la tubería", persist: true },
        { key: "wastePercentage", label: "Desperdicio", unit: "%", persist: true },
      ],
    },
  ],
  prices: [
    { key: "supplyPipePrice", label: "Tubo de agua 1/2\"", unit: "por tubo", kind: "material", keywords: /pvc.*(presion|sdr 13|1\/2)|tubo.*1\/2/, showWhen: (v) => points(v) > 0 },
    { key: "drainPipe2Price", label: "Tubo de drenaje 2\"", unit: "por tubo", kind: "material", keywords: /pvc.*2"|tubo.*2"/, showWhen: (v) => v.n("sinks") + v.n("showers") + v.n("kitchenSinks") + v.n("laundry") > 0 },
    { key: "drainPipe4Price", label: "Tubo de drenaje 4\"", unit: "por tubo", kind: "material", keywords: /pvc.*4"|tubo.*4"/, showWhen: (v) => v.n("toilets") > 0 },
    { key: "valvePrice", label: "Llave de paso o angular", unit: "por unidad", kind: "material", keywords: /llave de paso|angular|valvula/, showWhen: (v) => points(v) - v.n("outdoorTaps") > 0 },
    { key: "toiletPrice", label: "Inodoro", unit: "por unidad", kind: "material", keywords: /inodoro|sanitario/, showWhen: (v) => fixtures(v) && v.n("toilets") > 0 },
    { key: "sinkPrice", label: "Lavamanos", unit: "por unidad", kind: "material", keywords: /lavamanos/, showWhen: (v) => fixtures(v) && v.n("sinks") > 0 },
    { key: "showerPrice", label: "Ducha", unit: "por unidad", kind: "material", keywords: /ducha|regadera/, showWhen: (v) => fixtures(v) && v.n("showers") > 0 },
    { key: "kitchenSinkPrice", label: "Fregadero", unit: "por unidad", kind: "material", keywords: /fregadero|lavaplatos/, showWhen: (v) => fixtures(v) && v.n("kitchenSinks") > 0 },
    { key: "laundryPrice", label: "Lavadero", unit: "por unidad", kind: "material", keywords: /lavadero|lavanderia/, showWhen: (v) => fixtures(v) && v.n("laundry") > 0 },
    { key: "septicPrice", label: "Tanque séptico", unit: "por unidad", kind: "material", keywords: /tanque septico|septico/, showWhen: (v) => v.n("septicTanks") > 0 },
    { key: "suppliesPrice", label: "Pegamento y cinta", unit: "global", kind: "material", keywords: /pegamento|teflon|cinta/ },
    { key: "laborPrice", label: "Mano de obra", unit: "por punto", kind: "labor", keywords: /plomer|fontaner/, showWhen: (v) => points(v) > 0 },
  ],
  validate: (v) => {
    if (points(v) <= 0 && v.n("septicTanks") <= 0) return "Escribe al menos un aparato, una llave exterior o un tanque séptico.";
    if (points(v) > 0 && v.n("supplyRoutePerPoint") <= 0) return "Escribe el recorrido promedio del agua potable por punto.";
    if (v.n("pipePieceLength") <= 0) return "Escribe el largo del tubo (6.10 m es uno de 20 pies).";
    if (v.n("wastePercentage") > 100) return "El desperdicio debe estar entre 0% y 100%.";
    return null;
  },
  compute: (v) => calculatePlumbing(inputFrom(v), pricesFrom(v)),
  resultRows: (r) => {
    const rows = [
      { label: "Puntos de agua", value: `${r.supplyPoints}`, strong: true },
      { label: "Tubo de agua 1/2\"", value: `${r.supplyPieces} und. · ${r.supplyMeters.toFixed(1)} m` },
    ];
    if (r.drain2Pieces) rows.push({ label: "Tubo de drenaje 2\"", value: `${r.drain2Pieces} und. · ${r.drain2Meters.toFixed(1)} m` });
    if (r.drain4Pieces) rows.push({ label: "Tubo de drenaje 4\"", value: `${r.drain4Pieces} und. · ${r.drain4Meters.toFixed(1)} m` });
    rows.push({ label: "Accesorios", value: formatMoney(r.fittingsCost) });
    if (r.valves) rows.push({ label: "Llaves de paso o angulares", value: `${r.valves} und.` });
    if (r.septicTanks) rows.push({ label: "Tanque séptico", value: `${r.septicTanks} und.` });
    return rows;
  },
  buildLine: (r, c, v) =>
    makeLine({
      description: v.flags.includeFixtures
        ? "Instalación de plomería con aparatos sanitarios"
        : "Instalación de plomería (agua y drenaje)",
      unit: r.supplyPoints > 0 ? "punto" : "und.",
      quantity: r.supplyPoints > 0 ? r.supplyPoints : r.septicTanks,
      total: r.totalCost,
      costTotal: c.totalCost,
      materials: compactMaterials([
        material("Tubo de agua 1/2\"", r.supplyPieces, "und.", c.supplyCost),
        material("Tubo de drenaje 2\"", r.drain2Pieces, "und.", c.drain2Cost),
        material("Tubo de drenaje 4\"", r.drain4Pieces, "und.", c.drain4Cost),
        material("Accesorios de PVC", r.fittingsCost > 0 ? 1 : 0, "global", c.fittingsCost),
        material("Llaves de paso o angulares", r.valves, "und.", c.valveCost),
        material("Aparatos sanitarios", r.fixturesCost > 0 ? 1 : 0, "global", c.fixturesCost),
        material("Tanque séptico", r.septicTanks, "und.", c.septicCost),
      ]),
      notes: `${r.supplyPoints} puntos de agua · ${r.supplyPieces + r.drain2Pieces + r.drain4Pieces} tubos`,
    }),
};
