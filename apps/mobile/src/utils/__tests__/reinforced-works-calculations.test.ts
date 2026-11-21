import { describe, expect, it } from "vitest";

import {
  calculateRetainingWall,
  calculateStairs,
  calculateTank,
  type ReinforcedParams,
  type ReinforcedPrices,
} from "../reinforced-works-calculations";

const params: ReinforcedParams = {
  steelKgM3: 100, mixCement: 1, mixSand: 2, mixGravel: 3, cementBagWeight: 42.5,
  concreteWastePercentage: 5, barSize: 4, barPieceLength: 9.14, rebarWastePercentage: 5,
  tieWireKgPer100Kg: 1.5, includeFormwork: true, formworkUses: 4, sheetWidth: 1.22, sheetLength: 2.44,
  lumberPiecesPerSquareMeter: 1, nailsKgPerSquareMeter: 0.15, formworkWastePercentage: 10,
};
const prices: ReinforcedPrices = {
  cementBag: 8.4, sandCubicMeter: 35, gravelCubicMeter: 31, bar: 8, tieWireKg: 2, sheet: 38,
  lumberPiece: 8, nailKg: 3.9, laborConcreteCubicMeter: 56, laborRebarKg: 0.5, laborFormworkSquareMeter: 7,
};

describe("calculateStairs", () => {
  const base = { ...params, totalRise: 2.7, stepRise: 0.18, tread: 0.28, width: 1, waist: 0.12, landingArea: 0 };

  it("calcula escalones, volumen y encofrado", () => {
    const r = calculateStairs(base, prices);
    if (!r) throw new Error("resultado nulo");
    expect(r.steps).toBe(15);
    expect(r.actualRise).toBeCloseTo(0.18, 9);
    expect(r.runLength).toBeCloseTo(14 * 0.28, 9);
    expect(r.slopeLength).toBeCloseTo(Math.hypot(2.7, 14 * 0.28), 9);
    const wedge = 15 * 0.5 * 0.18 * 0.28;
    expect(r.volume).toBeCloseTo(r.slopeLength * 0.12 + wedge, 9);
    expect(r.steelKg).toBeCloseTo(r.volume * 100, 9);
    expect(r.formwork.totalArea).toBeCloseTo(r.formworkArea, 9);
    expect(r.totalCost).toBeCloseTo(r.materialsCost + r.laborCost, 9);
  });

  it("con descanso suma su volumen y sin medidas devuelve null", () => {
    const withLanding = calculateStairs({ ...base, landingArea: 1.2 }, prices);
    const without = calculateStairs(base, prices);
    expect((withLanding?.volume ?? 0) - (without?.volume ?? 0)).toBeCloseTo(1.2 * 0.12, 9);
    expect(calculateStairs({ ...base, totalRise: 0 }, prices)).toBeNull();
  });
});

describe("calculateRetainingWall", () => {
  const base = {
    ...params, length: 10, height: 2, stemThickness: 0.25, footingWidth: 1.2, footingThickness: 0.3,
    includeDrain: true, weepSpacing: 2, weepRowSpacing: 1.5, weepPipePieceLength: 3, drainThickness: 0.3,
  };
  const wallPrices = { ...prices, weepPipePiece: 4, drainGravelCubicMeter: 30 };

  it("calcula volumen, barbacanas y drenaje", () => {
    const r = calculateRetainingWall(base, wallPrices);
    if (!r) throw new Error("resultado nulo");
    expect(r.volume).toBeCloseTo(10 * (2 * 0.25 + 1.2 * 0.3), 9);
    // 5 por fila × 2 filas.
    expect(r.weepHoles).toBe(10);
    expect(r.weepPipePieces).toBe(Math.ceil((10 * 0.35) / 3));
    expect(r.drainVolume).toBeCloseTo(10 * 2 * 0.3, 9);
    expect(r.totalCost).toBeCloseTo(r.materialsCost + r.laborCost, 9);
  });

  it("sin drenaje no cuenta barbacanas", () => {
    const r = calculateRetainingWall({ ...base, includeDrain: false }, wallPrices);
    expect(r?.weepHoles).toBe(0);
    expect(r?.drainVolume).toBe(0);
  });
});

describe("calculateTank", () => {
  const base = {
    ...params, innerLength: 3, innerWidth: 2, innerDepth: 2, freeboard: 0.3, wallThickness: 0.15,
    floorThickness: 0.15, includeLid: true, lidThickness: 0.12, additiveKgPerCubicMeter: 2,
  };
  const tankPrices = { ...prices, additiveKg: 3, laborWaterproofSquareMeter: 4 };

  it("calcula capacidad, volumen de concreto y área a impermeabilizar", () => {
    const r = calculateTank(base, tankPrices);
    if (!r) throw new Error("resultado nulo");
    expect(r.capacityLiters).toBeCloseTo(3 * 2 * 1.7 * 1000, 6);
    const outer = 3.3 * 2.3;
    expect(r.volume).toBeCloseTo((outer - 6) * 2 + outer * 0.15 + outer * 0.12, 9);
    expect(r.innerArea).toBeCloseTo(2 * 5 * 2 + 6, 9);
    expect(r.additiveKg).toBeCloseTo(r.volume * 2, 9);
    expect(r.laborCost).toBeCloseTo(r.concrete.laborCost + r.rebarLaborCost + r.formwork.laborCost + r.innerArea * 4, 9);
  });

  it("sin tapa no cuenta su concreto y sin medidas devuelve null", () => {
    const open = calculateTank({ ...base, includeLid: false }, tankPrices);
    const closed = calculateTank(base, tankPrices);
    expect((closed?.volume ?? 0) - (open?.volume ?? 0)).toBeCloseTo(3.3 * 2.3 * 0.12, 9);
    expect(calculateTank({ ...base, innerDepth: 0 }, tankPrices)).toBeNull();
  });
});
