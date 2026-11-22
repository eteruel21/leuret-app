/**
 * Ventilación y extracción, y sistema de paneles solares.
 * Funciones puras: cantidades a comprar redondeadas hacia arriba y costos.
 */

function sanitize(value: number): number {
  if (!Number.isFinite(value) || value < 0) return 0;
  return value;
}

function pct(value: number): number {
  return Math.min(sanitize(value), 100) / 100;
}

const EPS = 1e-9;
const up = (x: number) => Math.ceil(x - EPS) || 0;

// ---------------------------------------------------------------------------
// Ventilación y extracción
// ---------------------------------------------------------------------------

export type VentilationInput = {
  /** Ambientes iguales por ventilar. */
  rooms: number;
  area: number;
  height: number;
  airChangesPerHour: number;
  /** Caudal de cada extractor, en m³/h. */
  fanFlow: number;
  ductMeters: number;
  ductPieceLength: number;
  grillesPerFan: number;
  cableRun: number;
  runWastePercentage: number;
};

export type VentilationPrices = {
  fan: number;
  ductPiece: number;
  grille: number;
  cableMeter: number;
  laborFan: number;
};

export type VentilationResult = {
  volume: number;
  requiredFlow: number;
  fansPerRoom: number;
  fans: number;
  ductPieces: number;
  grilles: number;
  cableMeters: number;
  fanCost: number;
  ductCost: number;
  grilleCost: number;
  cableCost: number;
  materialsCost: number;
  laborCost: number;
  totalCost: number;
};

export function emptyVentilationResult(): VentilationResult {
  return {
    volume: 0, requiredFlow: 0, fansPerRoom: 0, fans: 0, ductPieces: 0, grilles: 0, cableMeters: 0, fanCost: 0,
    ductCost: 0, grilleCost: 0, cableCost: 0, materialsCost: 0, laborCost: 0, totalCost: 0,
  };
}

export function calculateVentilation(input: VentilationInput, prices: VentilationPrices): VentilationResult {
  const rooms = Math.max(Math.round(sanitize(input.rooms)), 0);
  const volume = sanitize(input.area) * sanitize(input.height);
  const requiredFlow = volume * sanitize(input.airChangesPerHour);
  const fanFlow = sanitize(input.fanFlow);
  if (!rooms || !requiredFlow || !fanFlow) return emptyVentilationResult();

  const fansPerRoom = up(requiredFlow / fanFlow);
  const fans = fansPerRoom * rooms;
  const ductLength = sanitize(input.ductPieceLength);
  const ductPieces = ductLength ? up((sanitize(input.ductMeters) * fans) / ductLength) : 0;
  const grilles = fans * Math.round(sanitize(input.grillesPerFan));
  const cableMeters = up(fans * sanitize(input.cableRun) * 2 * (1 + pct(input.runWastePercentage)));

  const fanCost = fans * sanitize(prices.fan);
  const ductCost = ductPieces * sanitize(prices.ductPiece);
  const grilleCost = grilles * sanitize(prices.grille);
  const cableCost = cableMeters * sanitize(prices.cableMeter);
  const materialsCost = fanCost + ductCost + grilleCost + cableCost;
  const laborCost = fans * sanitize(prices.laborFan);

  return {
    volume, requiredFlow, fansPerRoom, fans, ductPieces, grilles, cableMeters, fanCost, ductCost, grilleCost,
    cableCost, materialsCost, laborCost, totalCost: materialsCost + laborCost,
  };
}

// ---------------------------------------------------------------------------
// Paneles solares
// ---------------------------------------------------------------------------

const STANDARD_BREAKERS = [15, 20, 30, 40, 50, 60, 70, 80, 100, 125, 150] as const;

export type SolarInput = {
  monthlyKwh: number;
  sunHours: number;
  lossPercentage: number;
  panelWatts: number;
  panelArea: number;
  /** Área disponible en el techo; 0 = sin límite. */
  availableArea: number;
  dcAcRatio: number;
  panelsPerString: number;
  runPerString: number;
  rows: number;
  railMetersPerPanel: number;
  railPieceLength: number;
  feetPerPanel: number;
  acRun: number;
  acVoltage: number;
  includeBattery: boolean;
  criticalKwhPerDay: number;
  autonomyDays: number;
  batteryUsableKwh: number;
};

export type SolarPrices = {
  panel: number;
  inverter: number;
  railPiece: number;
  midClamp: number;
  endClamp: number;
  foot: number;
  pvCableMeter: number;
  connectorPair: number;
  acBreaker: number;
  acCableMeter: number;
  battery: number;
  laborKwp: number;
};

export type SolarResult = {
  dailyKwh: number;
  requiredKwp: number;
  panelsNeeded: number;
  panels: number;
  limitedByArea: boolean;
  installedKwp: number;
  monthlyProduction: number;
  coveragePercent: number;
  areaNeeded: number;
  inverterKw: number;
  strings: number;
  pvCableMeters: number;
  connectorPairs: number;
  railPieces: number;
  midClamps: number;
  endClamps: number;
  feet: number;
  acBreakerAmps: number;
  acCableMeters: number;
  batteries: number;
  panelCost: number;
  inverterCost: number;
  railCost: number;
  clampCost: number;
  footCost: number;
  pvCableCost: number;
  connectorCost: number;
  acBreakerCost: number;
  acCableCost: number;
  batteryCost: number;
  materialsCost: number;
  laborCost: number;
  totalCost: number;
};

export function emptySolarResult(): SolarResult {
  return {
    dailyKwh: 0, requiredKwp: 0, panelsNeeded: 0, panels: 0, limitedByArea: false, installedKwp: 0,
    monthlyProduction: 0, coveragePercent: 0, areaNeeded: 0, inverterKw: 0, strings: 0, pvCableMeters: 0,
    connectorPairs: 0, railPieces: 0, midClamps: 0, endClamps: 0, feet: 0, acBreakerAmps: 0, acCableMeters: 0,
    batteries: 0, panelCost: 0, inverterCost: 0, railCost: 0, clampCost: 0, footCost: 0, pvCableCost: 0,
    connectorCost: 0, acBreakerCost: 0, acCableCost: 0, batteryCost: 0, materialsCost: 0, laborCost: 0, totalCost: 0,
  };
}

export function calculateSolar(input: SolarInput, prices: SolarPrices): SolarResult {
  const monthlyKwh = sanitize(input.monthlyKwh);
  const sunHours = sanitize(input.sunHours);
  const panelWatts = sanitize(input.panelWatts);
  if (!monthlyKwh || !sunHours || !panelWatts) return emptySolarResult();

  const efficiency = 1 - pct(input.lossPercentage);
  if (efficiency <= 0) return emptySolarResult();

  const dailyKwh = monthlyKwh / 30;
  const requiredKwp = dailyKwh / (sunHours * efficiency);
  const panelsNeeded = up((requiredKwp * 1000) / panelWatts);

  const panelArea = sanitize(input.panelArea);
  const available = sanitize(input.availableArea);
  const maxPanels = available && panelArea ? Math.floor(available / panelArea + EPS) : Infinity;
  const panels = Math.min(panelsNeeded, maxPanels);
  if (!panels) return emptySolarResult();
  const limitedByArea = panels < panelsNeeded;

  const installedKwp = (panels * panelWatts) / 1000;
  const monthlyProduction = installedKwp * sunHours * efficiency * 30;
  const coveragePercent = (monthlyProduction / monthlyKwh) * 100;
  const areaNeeded = panels * panelArea;

  const ratio = sanitize(input.dcAcRatio) || 1;
  const inverterKw = Math.ceil((installedKwp / ratio) * 2 - EPS) / 2;

  const perString = Math.max(Math.round(sanitize(input.panelsPerString)), 1);
  const strings = up(panels / perString);
  const pvCableMeters = up(strings * 2 * sanitize(input.runPerString) * 1.1);
  const connectorPairs = strings * 2;

  const rows = Math.min(Math.max(Math.round(sanitize(input.rows)), 1), panels);
  const railLength = sanitize(input.railPieceLength);
  const railPieces = railLength ? up((panels * sanitize(input.railMetersPerPanel) * 1.05) / railLength) : 0;
  const midClamps = Math.max(panels - rows, 0) * 2;
  const endClamps = rows * 4;
  const feet = panels * Math.round(sanitize(input.feetPerPanel));

  const voltage = sanitize(input.acVoltage) || 240;
  const acAmps = ((inverterKw * 1000) / voltage) * 1.25;
  const acBreakerAmps = STANDARD_BREAKERS.find((amps) => amps >= acAmps - EPS) ?? up(acAmps);
  const acCableMeters = up(sanitize(input.acRun) * 3 * 1.1);

  const batteryKwh = sanitize(input.batteryUsableKwh);
  const batteries =
    input.includeBattery && batteryKwh
      ? up((sanitize(input.criticalKwhPerDay) * Math.max(sanitize(input.autonomyDays), 1)) / batteryKwh)
      : 0;

  const panelCost = panels * sanitize(prices.panel);
  const inverterCost = sanitize(prices.inverter);
  const railCost = railPieces * sanitize(prices.railPiece);
  const clampCost = midClamps * sanitize(prices.midClamp) + endClamps * sanitize(prices.endClamp);
  const footCost = feet * sanitize(prices.foot);
  const pvCableCost = pvCableMeters * sanitize(prices.pvCableMeter);
  const connectorCost = connectorPairs * sanitize(prices.connectorPair);
  const acBreakerCost = sanitize(prices.acBreaker);
  const acCableCost = acCableMeters * sanitize(prices.acCableMeter);
  const batteryCost = batteries * sanitize(prices.battery);
  const materialsCost =
    panelCost + inverterCost + railCost + clampCost + footCost + pvCableCost + connectorCost + acBreakerCost +
    acCableCost + batteryCost;
  const laborCost = installedKwp * sanitize(prices.laborKwp);

  return {
    dailyKwh, requiredKwp, panelsNeeded, panels, limitedByArea, installedKwp, monthlyProduction, coveragePercent,
    areaNeeded, inverterKw, strings, pvCableMeters, connectorPairs, railPieces, midClamps, endClamps, feet,
    acBreakerAmps, acCableMeters, batteries, panelCost, inverterCost, railCost, clampCost, footCost, pvCableCost,
    connectorCost, acBreakerCost, acCableCost, batteryCost, materialsCost, laborCost,
    totalCost: materialsCost + laborCost,
  };
}
