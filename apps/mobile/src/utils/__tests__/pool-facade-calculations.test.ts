import { describe, expect, it } from "vitest";

import {
  calculateFacade,
  calculatePool,
  type FacadeInput,
  type PoolInput,
} from "../pool-facade-calculations";

describe("calculatePool", () => {
  const base: PoolInput = {
    length: 8, width: 4, shallowDepth: 1.2, deepDepth: 2, wallThickness: 0.2, floorThickness: 0.2, overdig: 0.5,
    swellFactor: 1.25, bedThickness: 0.1, bedLooseFactor: 1.2, bedWastePercentage: 10,
    concreteWastePercentage: 5, mixCement: 1, mixSand: 2, mixGravel: 3, cementBagWeight: 42.5,
    rebarKgPerCubicMeter: 90, rebarPieceKg: 9.1, rebarWastePercentage: 5, includeTile: true,
    tileWastePercentage: 10, adhesiveKgPerSquareMeter: 5, adhesiveBagKg: 20, groutKgPerSquareMeter: 0.5,
    groutBagKg: 2, includeWaterproofing: true, waterproofingCoats: 2, waterproofingCoverage: 4, skimmers: 2,
    returnJets: 4, floorDrains: 1, pipeMeters: 30, pipePieceLength: 6.1, pipeFittingsPercentage: 25,
    includePump: true, includeFilter: true,
  };
  const prices = {
    cementBag: 10, sandCubicMeter: 30, gravelCubicMeter: 35, rebarPiece: 8, tileSquareMeter: 20, adhesiveBag: 12,
    groutBag: 6, waterproofingGallon: 40, skimmer: 50, returnJet: 10, floorDrain: 30, pipePiece: 9, pump: 400,
    filter: 350, laborExcavationCubicMeter: 8, laborShellCubicMeter: 120, laborTileSquareMeter: 15,
    laborEquipment: 200,
  };

  it("calcula agua, excavación, concreto, acero y acabados", () => {
    const r = calculatePool(base, prices);
    expect(r.averageDepth).toBeCloseTo(1.6, 9);
    expect(r.waterVolume).toBeCloseTo(51.2, 9);
    expect(r.excavationVolume).toBeCloseTo(9.4 * 5.4 * 2.3, 9);
    expect(r.haulVolume).toBeCloseTo(9.4 * 5.4 * 2.3 * 1.25, 9);
    expect(r.concreteVolume).toBeCloseTo(8.4 * 4.4 * 0.2 + (8.4 * 4.4 - 32) * 1.6, 9);
    expect(r.finishArea).toBeCloseTo(32 + 24 * 1.6, 9);
    expect(r.tileArea).toBeCloseTo(70.4 * 1.1, 9);
    expect(r.rebarPieces).toBe(Math.ceil((r.concreteVolume * 90 * 1.05) / 9.1));
    expect(r.adhesiveBags).toBe(Math.ceil((70.4 * 5) / 20));
    expect(r.groutBags).toBe(Math.ceil((70.4 * 0.5) / 2));
    expect(r.waterproofingGallons).toBe(Math.ceil((70.4 * 2) / 4));
    expect(r.pipePieces).toBe(Math.ceil((30 * 1.25) / 6.1));
    expect(r.cementBags).toBeGreaterThan(0);
    expect(Number.isInteger(r.cementBags)).toBe(true);
  });

  it("suma materiales y mano de obra", () => {
    const r = calculatePool(base, prices);
    expect(r.equipmentCost).toBeCloseTo(750, 9);
    expect(r.fittingsCost).toBeCloseTo(2 * 50 + 4 * 10 + 30, 9);
    expect(r.laborCost).toBeCloseTo(
      r.excavationVolume * 8 + r.concreteVolume * 120 + r.finishArea * 15 + 200,
      9,
    );
    expect(r.totalCost).toBeCloseTo(r.materialsCost + r.laborCost, 9);
  });

  it("omite revestimiento, impermeabilizante y equipos cuando se desactivan", () => {
    const r = calculatePool(
      { ...base, includeTile: false, includeWaterproofing: false, includePump: false, includeFilter: false },
      prices,
    );
    expect(r.tileArea).toBe(0);
    expect(r.adhesiveBags).toBe(0);
    expect(r.waterproofingGallons).toBe(0);
    expect(r.pump + r.filter).toBe(0);
    expect(r.laborCost).toBeCloseTo(r.excavationVolume * 8 + r.concreteVolume * 120, 9);
  });

  it("devuelve ceros con medidas vacías", () => {
    expect(calculatePool({ ...base, length: 0 }, prices).totalCost).toBe(0);
    expect(calculatePool({ ...base, deepDepth: 0, shallowDepth: 0 }, prices).concreteVolume).toBe(0);
  });
});

describe("calculateFacade", () => {
  const base: FacadeInput = {
    wallLength: 20, wallHeight: 3, openingsArea: 10, extraArea: 0, repairPercentage: 10, repairThickness: 0.015,
    repairWastePercentage: 10, mixCement: 1, mixSand: 4, cementBagWeight: 42.5, crackLength: 20,
    metersPerSealantCartridge: 8, includeSealer: true, sealerCoverage: 25, paintCoats: 2, paintCoverage: 30,
    paintWastePercentage: 10, includeScaffold: true, scaffoldBayLength: 2, scaffoldLevelHeight: 1.9,
    scaffoldMonths: 2,
  };
  const prices = {
    cementBag: 10, sandCubicMeter: 30, sealantCartridge: 5, sealerGallon: 25, paintGallon: 35, scaffoldSetMonth: 6,
    laborPaintSquareMeter: 3, laborRepairSquareMeter: 9, laborScaffoldSet: 4,
  };

  it("calcula área, reparación, sellador, pintura y andamio", () => {
    const r = calculateFacade(base, prices);
    expect(r.paintArea).toBeCloseTo(50, 9);
    expect(r.repairArea).toBeCloseTo(5, 9);
    expect(r.repairVolume).toBeCloseTo(0.075, 9);
    expect(r.cementBags).toBeGreaterThan(0);
    expect(r.sealantCartridges).toBe(3);
    expect(r.sealerGallons).toBe(2);
    expect(r.paintGallons).toBe(Math.ceil((50 * 2 * 1.1) / 30));
    expect(r.scaffoldSets).toBe(10 * 2);
  });

  it("calcula costos y mano de obra", () => {
    const r = calculateFacade(base, prices);
    expect(r.scaffoldCost).toBeCloseTo(20 * 2 * 6, 9);
    expect(r.laborCost).toBeCloseTo(50 * 3 + 5 * 9 + 20 * 4, 9);
    expect(r.totalCost).toBeCloseTo(r.materialsCost + r.laborCost, 9);
  });

  it("sin reparación ni andamio no pide cemento ni arena", () => {
    const r = calculateFacade({ ...base, repairPercentage: 0, includeScaffold: false }, prices);
    expect(r.cementBags).toBe(0);
    expect(r.sandVolume).toBe(0);
    expect(r.scaffoldSets).toBe(0);
  });

  it("acepta un área extra y no baja de cero", () => {
    expect(calculateFacade({ ...base, openingsArea: 100, extraArea: 12 }, prices).paintArea).toBeCloseTo(12, 9);
    expect(calculateFacade({ ...base, wallLength: 0 }, prices).totalCost).toBe(0);
  });
});
