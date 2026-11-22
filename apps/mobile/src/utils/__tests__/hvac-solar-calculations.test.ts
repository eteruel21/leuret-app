import { describe, expect, it } from "vitest";

import {
  calculateSolar,
  calculateVentilation,
  type SolarInput,
  type VentilationInput,
} from "../hvac-solar-calculations";

describe("calculateVentilation", () => {
  const base: VentilationInput = {
    rooms: 2, area: 20, height: 2.5, airChangesPerHour: 8, fanFlow: 150, ductMeters: 3, ductPieceLength: 3,
    grillesPerFan: 1, cableRun: 6, runWastePercentage: 10,
  };
  const prices = { fan: 40, ductPiece: 8, grille: 5, cableMeter: 0.5, laborFan: 30 };

  it("calcula extractores por caudal requerido", () => {
    const r = calculateVentilation(base, prices);
    expect(r.volume).toBeCloseTo(50, 9);
    expect(r.requiredFlow).toBeCloseTo(400, 9);
    expect(r.fansPerRoom).toBe(3);
    expect(r.fans).toBe(6);
  });

  it("calcula ductos, rejillas, cable y costos", () => {
    const r = calculateVentilation(base, prices);
    expect(r.ductPieces).toBe(Math.ceil((3 * 6) / 3));
    expect(r.grilles).toBe(6);
    expect(r.cableMeters).toBe(Math.ceil(6 * 6 * 2 * 1.1 - 1e-9));
    expect(r.fanCost).toBe(240);
    expect(r.laborCost).toBe(180);
    expect(r.totalCost).toBeCloseTo(r.materialsCost + r.laborCost, 9);
  });

  it("no redondea de más cuando el caudal cabe justo", () => {
    const r = calculateVentilation({ ...base, area: 15, height: 2.5, airChangesPerHour: 8, rooms: 1 }, prices);
    expect(r.requiredFlow).toBeCloseTo(300, 9);
    expect(r.fans).toBe(2);
  });

  it("devuelve ceros sin datos", () => {
    expect(calculateVentilation({ ...base, rooms: 0 }, prices).totalCost).toBe(0);
    expect(calculateVentilation({ ...base, fanFlow: 0 }, prices).fans).toBe(0);
    expect(calculateVentilation({ ...base, area: 0 }, prices).fans).toBe(0);
  });
});

describe("calculateSolar", () => {
  const base: SolarInput = {
    monthlyKwh: 600, sunHours: 4.5, lossPercentage: 20, panelWatts: 550, panelArea: 2.6, availableArea: 0,
    dcAcRatio: 1.2, panelsPerString: 11, runPerString: 15, rows: 2, railMetersPerPanel: 2.3, railPieceLength: 4.2,
    feetPerPanel: 2, acRun: 10, acVoltage: 240, includeBattery: false, criticalKwhPerDay: 5, autonomyDays: 1,
    batteryUsableKwh: 5,
  };
  const prices = {
    panel: 150, inverter: 1500, railPiece: 20, midClamp: 2, endClamp: 2.5, foot: 3, pvCableMeter: 1.2,
    connectorPair: 4, acBreaker: 25, acCableMeter: 2, battery: 1800, laborKwp: 200,
  };

  it("dimensiona paneles, inversor y producción", () => {
    const r = calculateSolar(base, prices);
    expect(r.dailyKwh).toBeCloseTo(20, 9);
    expect(r.requiredKwp).toBeCloseTo(20 / (4.5 * 0.8), 9);
    expect(r.panelsNeeded).toBe(11);
    expect(r.panels).toBe(11);
    expect(r.limitedByArea).toBe(false);
    expect(r.installedKwp).toBeCloseTo(6.05, 9);
    expect(r.coveragePercent).toBeGreaterThanOrEqual(100);
    expect(r.areaNeeded).toBeCloseTo(11 * 2.6, 9);
    expect(r.inverterKw).toBe(5.5);
    expect(r.acBreakerAmps).toBe(30);
  });

  it("calcula cadenas, cables, rieles y abrazaderas", () => {
    const r = calculateSolar(base, prices);
    expect(r.strings).toBe(1);
    expect(r.pvCableMeters).toBe(Math.ceil(2 * 15 * 1.1 - 1e-9));
    expect(r.connectorPairs).toBe(2);
    expect(r.railPieces).toBe(Math.ceil((11 * 2.3 * 1.05) / 4.2 - 1e-9));
    expect(r.midClamps).toBe((11 - 2) * 2);
    expect(r.endClamps).toBe(8);
    expect(r.feet).toBe(22);
    expect(r.laborCost).toBeCloseTo(6.05 * 200, 9);
    expect(r.totalCost).toBeCloseTo(r.materialsCost + r.laborCost, 9);
  });

  it("limita por el área disponible y muestra la cobertura menor", () => {
    const r = calculateSolar({ ...base, availableArea: 20 }, prices);
    expect(r.panels).toBe(7);
    expect(r.limitedByArea).toBe(true);
    expect(r.coveragePercent).toBeLessThan(100);
  });

  it("calcula baterías de respaldo", () => {
    expect(calculateSolar({ ...base, includeBattery: true }, prices).batteries).toBe(1);
    expect(calculateSolar({ ...base, includeBattery: true, criticalKwhPerDay: 6 }, prices).batteries).toBe(2);
    expect(calculateSolar(base, prices).batteries).toBe(0);
  });

  it("devuelve ceros sin consumo", () => {
    expect(calculateSolar({ ...base, monthlyKwh: 0 }, prices).totalCost).toBe(0);
    expect(calculateSolar({ ...base, lossPercentage: 100 }, prices).panels).toBe(0);
  });
});
