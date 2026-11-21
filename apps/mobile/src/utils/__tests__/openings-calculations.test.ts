import { describe, expect, it } from "vitest";

import {
  calculateFence,
  calculateOpenings,
  type FenceInput,
  type OpeningsInput,
} from "../openings-calculations";

describe("calculateFence", () => {
  const base: FenceInput = {
    length: 50, height: 2, postSpacing: 2.5, cornerPosts: 4, gates: 1, gateWidth: 3,
    embedDepth: 0.5, postPieceLength: 6, railPieceLength: 6, meshRollLength: 15, meshRollHeight: 1.8,
    barbedWireStrands: 3, barbedWireRollLength: 300, concretePerPost: 0.05,
    cementBagsPerCubicMeter: 7.5, wastePercentage: 5,
  };
  const prices = {
    postPiece: 22, railPiece: 15, meshRoll: 95, barbedWireRoll: 40, cementBag: 8.4, gate: 180,
    accessoriesPerPost: 2, laborMeter: 6,
  };

  it("calcula postes, malla, tubos y concreto", () => {
    const r = calculateFence(base, prices);
    // 47 m de malla corrida: 19 postes de línea - 1 = 18, + 4 esquinas + 2 del portón.
    expect(r.posts).toBe(Math.ceil(47 / 2.5) - 1 + 4 + 2);
    // 2.5 m por poste → 2 postes por tubo de 6 m.
    expect(r.postPieces).toBe(Math.ceil(r.posts / 2));
    expect(r.railPieces).toBe(Math.ceil((47 * 1.05) / 6));
    // 2 m de altura con rollo de 1.8 m → dos filas.
    expect(r.meshRolls).toBe(Math.ceil(((47 * 1.05) / 15) * 2));
    expect(r.barbedWireRolls).toBe(Math.ceil((47 * 3 * 1.05) / 300));
    expect(r.cementBags).toBe(Math.ceil(r.posts * 0.05 * 7.5));
    expect(r.laborCost).toBeCloseTo(50 * 6, 9);
    expect(r.totalCost).toBeCloseTo(r.materialsCost + r.laborCost, 9);
  });

  it("sin medidas devuelve cero", () => {
    expect(calculateFence({ ...base, length: 0 }, prices).totalCost).toBe(0);
  });
});

describe("calculateOpenings", () => {
  const base: OpeningsInput = {
    doorCount: 3, doorWidth: 0.9, doorHeight: 2.1, windowCount: 4, windowWidth: 1.2, windowHeight: 1,
    sealantMetersPerCartridge: 8, hingesPerDoor: 3, locksPerDoor: 1, includeGlass: true,
    glassWastePercentage: 10,
  };
  const prices = {
    door: 120, window: 90, hinge: 2, lock: 25, glassSquareMeter: 30, sealantCartridge: 6,
    laborDoor: 30, laborWindow: 25,
  };

  it("suma áreas, herrajes, vidrio y sellador", () => {
    const r = calculateOpenings(base, prices);
    expect(r.doorArea).toBeCloseTo(3 * 0.9 * 2.1, 9);
    expect(r.windowArea).toBeCloseTo(4 * 1.2, 9);
    expect(r.hinges).toBe(9);
    expect(r.locks).toBe(3);
    expect(r.glassArea).toBeCloseTo(4.8 * 1.1, 9);
    expect(r.sealantCartridges).toBe(Math.ceil((4 * 2 * 2.2) / 8));
    expect(r.laborCost).toBeCloseTo(3 * 30 + 4 * 25, 9);
  });

  it("sin vidrio no suma vidrio", () => {
    expect(calculateOpenings({ ...base, includeGlass: false }, prices).glassCost).toBe(0);
  });

  it("sin puertas ni ventanas devuelve cero", () => {
    expect(calculateOpenings({ ...base, doorCount: 0, windowCount: 0 }, prices).totalCost).toBe(0);
  });
});
