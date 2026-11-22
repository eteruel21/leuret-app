import { describe, expect, it } from "vitest";

import {
  calculateLighting,
  calculatePergola,
  type LightingInput,
  type PergolaInput,
} from "../carpentry-lighting-calculations";

describe("calculatePergola", () => {
  const base: PergolaInput = {
    length: 4, width: 3, height: 2.5, postCount: 4, postEmbed: 0.1, beamLines: 2, rafterSpacing: 0.5,
    overhang: 0.3, includeSlats: true, slatSpacing: 0.15, postPieceLength: 3.66, beamPieceLength: 3.66,
    rafterPieceLength: 3.66, slatPieceLength: 3.66, wastePercentage: 10, jointsPerRafter: 2, screwsPerSlat: 1,
    screwsPerBox: 100, includeFinish: true, surfacePerMeter: 0.3, finishCoats: 2, finishCoverage: 30,
  };
  const prices = {
    postPiece: 25, beamPiece: 30, rafterPiece: 12, slatPiece: 3, postBase: 8, hardware: 1.5, screwBox: 9,
    finishGallon: 32, laborSquareMeter: 10,
  };

  it("calcula postes, vigas, viguetas, listones, herrajes y barniz", () => {
    const r = calculatePergola(base, prices);
    expect(r.postMeters).toBeCloseTo(4 * 2.6, 9);
    expect(r.beamMeters).toBeCloseTo(8, 9);
    expect(r.rafters).toBe(9);
    expect(r.rafterMeters).toBeCloseTo(9 * 3.6, 9);
    expect(r.slats).toBe(21);
    expect(r.slatMeters).toBeCloseTo(84, 9);
    expect(r.postPieces).toBe(Math.ceil((10.4 * 1.1) / 3.66));
    expect(r.hardwareSets).toBe(4 * 2 + 9 * 2);
    expect(r.screwBoxes).toBe(Math.ceil((21 * 1 * 9) / 100));
    const total = 10.4 + 8 + 32.4 + 84;
    expect(r.finishGallons).toBe(Math.ceil((total * 0.3 * 2) / 30));
    expect(r.laborCost).toBeCloseTo(120, 9);
    expect(r.totalCost).toBeCloseTo(r.materialsCost + r.laborCost, 9);
  });

  it("sin listones ni barniz no los cuenta; sin medidas devuelve cero", () => {
    const r = calculatePergola({ ...base, includeSlats: false, includeFinish: false }, prices);
    expect(r.slats).toBe(0);
    expect(r.slatPieces).toBe(0);
    expect(r.finishGallons).toBe(0);
    expect(calculatePergola({ ...base, postCount: 0 }, prices).totalCost).toBe(0);
  });
});

describe("calculateLighting", () => {
  const base: LightingInput = {
    lightPoints: 8, switches: 4, outlets: 10, runPerPoint: 6, conductorsPerRun: 3, conduitPieceLength: 3.05,
    conduitFittingsPercentage: 20, cableWastePercentage: 10, lightsPerCircuit: 10, outletsPerCircuit: 8,
    roomArea: 20, luxLevel: 200, lumensPerLuminaire: 1200, utilizationFactor: 0.5,
  };
  const prices = {
    luminaire: 8, switchUnit: 2, outletUnit: 2.5, lightBox: 1, deviceBox: 1, plate: 0.8, lightingCableMeter: 0.4,
    outletCableMeter: 0.6, conduitPiece: 1.8, breakerLighting: 6, breakerOutlets: 7, laborPoint: 12,
  };

  it("calcula tubo, cable, circuitos, cajas y luminarias sugeridas", () => {
    const r = calculateLighting(base, prices);
    expect(r.points).toBe(22);
    expect(r.conduitMeters).toBeCloseTo(132, 9);
    expect(r.conduitPieces).toBe(Math.ceil(132 / 3.05));
    expect(r.lightingCableMeters).toBeCloseTo(12 * 6 * 3 * 1.1, 9);
    expect(r.outletCableMeters).toBeCloseTo(10 * 6 * 3 * 1.1, 9);
    expect(r.lightingCircuits).toBe(1);
    expect(r.outletCircuits).toBe(2);
    expect(r.lightBoxes).toBe(8);
    expect(r.deviceBoxes).toBe(14);
    expect(r.suggestedLuminaires).toBe(Math.ceil((20 * 200) / 0.5 / 1200));
    expect(r.laborCost).toBeCloseTo(264, 9);
    expect(r.totalCost).toBeCloseTo(r.materialsCost + r.laborCost, 9);
  });

  it("sin puntos devuelve cero y sin área no sugiere luminarias", () => {
    expect(calculateLighting({ ...base, lightPoints: 0, switches: 0, outlets: 0 }, prices).totalCost).toBe(0);
    expect(calculateLighting({ ...base, roomArea: 0 }, prices).suggestedLuminaires).toBe(0);
  });
});
