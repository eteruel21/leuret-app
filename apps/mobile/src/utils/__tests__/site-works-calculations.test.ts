import { describe, expect, it } from "vitest";

import {
  calculateLawn,
  calculateStormDrainage,
  type LawnInput,
  type StormDrainageInput,
} from "../site-works-calculations";

describe("calculateStormDrainage", () => {
  const base: StormDrainageInput = {
    roofArea: 90, gutterLength: 12, gutterPieceLength: 3, hangerSpacing: 0.6, gutterAccessories: 4,
    downspoutCount: 2, downspoutHeight: 3, downspoutPieceLength: 3, downspoutFittingsPerUnit: 3,
    pipeLength: 20, pipePieceLength: 6.1, pipeFittingsPercentage: 20, trenchWidth: 0.4, trenchDepth: 0.6,
    beddingThickness: 0.1, inspectionBoxes: 2, wastePercentage: 5,
  };
  const prices = {
    gutterPiece: 9, hanger: 1.2, gutterAccessory: 2, downspoutPiece: 8, downspoutFitting: 1.5, pipePiece: 14,
    box: 45, lid: 12, beddingCubicMeter: 30, laborGutterMeter: 3, laborPipeMeter: 4, laborExcavationCubicMeter: 15,
  };

  it("calcula canal, soportes, bajantes, tubería, zanja y cajas", () => {
    const r = calculateStormDrainage(base, prices);
    expect(r.roofAreaPerDownspout).toBeCloseTo(45, 9);
    expect(r.gutterPieces).toBe(Math.ceil((12 * 1.05) / 3));
    expect(r.hangers).toBe(21);
    expect(r.downspoutPieces).toBe(2);
    expect(r.downspoutFittings).toBe(6);
    expect(r.pipePieces).toBe(Math.ceil((20 * 1.05) / 6.1));
    expect(r.excavationVolume).toBeCloseTo(20 * 0.4 * 0.6, 9);
    expect(r.beddingVolume).toBeCloseTo(20 * 0.4 * 0.1, 9);
    expect(r.pipeFittingsCost).toBeCloseTo(r.pipeCost * 0.2, 9);
    expect(r.laborCost).toBeCloseTo((12 + 6) * 3 + 20 * 4 + r.excavationVolume * 15, 9);
    expect(r.totalCost).toBeCloseTo(r.materialsCost + r.laborCost, 9);
  });

  it("bajante más alta que la pieza usa varias y sin nada devuelve cero", () => {
    const r = calculateStormDrainage({ ...base, downspoutHeight: 5 }, prices);
    expect(r.downspoutPieces).toBe(4);
    const empty = calculateStormDrainage(
      { ...base, gutterLength: 0, downspoutCount: 0, pipeLength: 0, inspectionBoxes: 0 },
      prices,
    );
    expect(empty.totalCost).toBe(0);
  });
});

describe("calculateLawn", () => {
  const base: LawnInput = {
    area: 100, soilThickness: 0.1, soilWastePercentage: 10, grassMode: "sod", grassWastePercentage: 5,
    seedKgPerSquareMeter: 0.03, fertilizerKgPerSquareMeter: 0.05, fertilizerBagKg: 25, includeIrrigation: true,
    sprinklerRadius: 4, sprinklerCoverageFactor: 0.6, sprinklersPerZone: 6, mainPipeLength: 15, pipePieceLength: 6,
    pipeFittingsPercentage: 25,
  };
  const prices = {
    sodSquareMeter: 3, seedKg: 12, soilCubicMeter: 20, fertilizerBag: 15, sprinkler: 6, valve: 20, timer: 45,
    pipePiece: 5, laborSquareMeter: 1.5, laborSprinkler: 8,
  };

  it("calcula tierra, grama, abono, aspersores, zonas y tubería", () => {
    const r = calculateLawn(base, prices);
    expect(r.soilVolume).toBeCloseTo(100 * 0.1 * 1.1, 9);
    expect(r.grassArea).toBeCloseTo(105, 9);
    expect(r.fertilizerBags).toBe(1);
    const coverage = Math.PI * 16 * 0.6;
    expect(r.sprinklers).toBe(Math.ceil(100 / coverage));
    expect(r.zones).toBe(Math.ceil(r.sprinklers / 6));
    expect(r.lateralLength).toBeCloseTo(r.sprinklers * 4, 9);
    expect(r.pipePieces).toBe(Math.ceil((r.lateralLength + 15) / 6));
    expect(r.timerCost).toBe(45);
    expect(r.totalCost).toBeCloseTo(r.materialsCost + r.laborCost, 9);
  });

  it("con semilla no compra rollos y sin riego no cuenta aspersores", () => {
    const r = calculateLawn({ ...base, grassMode: "seed", includeIrrigation: false }, prices);
    expect(r.grassArea).toBe(0);
    expect(r.seedKg).toBeCloseTo(100 * 0.03 * 1.05, 9);
    expect(r.sprinklers).toBe(0);
    expect(r.timerCost).toBe(0);
    expect(calculateLawn({ ...base, area: 0 }, prices).totalCost).toBe(0);
  });
});
