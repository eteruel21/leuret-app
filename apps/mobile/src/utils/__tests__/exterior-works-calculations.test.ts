import { describe, expect, it } from "vitest";

import {
  calculateRailing,
  calculateSkylights,
  calculateWalkway,
  type RailingInput,
  type SkylightInput,
  type WalkwayInput,
} from "../exterior-works-calculations";

describe("calculateRailing", () => {
  const base: RailingInput = {
    length: 6, height: 1, postSpacing: 1.5, postEmbed: 0.1, includeBalusters: true, balusterSpacing: 0.12,
    railRows: 2, handrailRuns: 1, tubePieceLength: 6, wastePercentage: 5, electrodeKgPerMeter: 0.08,
    includePaint: true, surfacePerMeter: 0.15, paintCoats: 2, paintCoverage: 25,
  };
  const prices = { postTube: 12, railTube: 10, balusterTube: 6, electrodeKg: 4, paintGallon: 28, laborMeter: 15 };

  it("calcula postes, barrotes, rieles y pintura", () => {
    const r = calculateRailing(base, prices);
    expect(r.posts).toBe(5);
    expect(r.balusters).toBe(50);
    expect(r.postMeters).toBeCloseTo(5 * 1.1, 9);
    expect(r.balusterMeters).toBeCloseTo(50 * 0.85, 9);
    expect(r.railMeters).toBeCloseTo(18, 9);
    expect(r.railPieces).toBe(Math.ceil((18 * 1.05) / 6));
    expect(r.electrodeKg).toBeCloseTo(0.48, 9);
    const area = (r.postMeters + r.balusterMeters + r.railMeters) * 0.15;
    expect(r.paintGallons).toBe(Math.ceil((area * 2) / 25));
    expect(r.laborCost).toBeCloseTo(90, 9);
    expect(r.totalCost).toBeCloseTo(r.materialsCost + r.laborCost, 9);
  });

  it("sin barrotes ni pintura no los cuenta; sin largo devuelve cero", () => {
    const r = calculateRailing({ ...base, includeBalusters: false, includePaint: false }, prices);
    expect(r.balusters).toBe(0);
    expect(r.balusterPieces).toBe(0);
    expect(r.paintGallons).toBe(0);
    expect(calculateRailing({ ...base, length: 0 }, prices).totalCost).toBe(0);
  });
});

describe("calculateWalkway", () => {
  const base: WalkwayInput = {
    length: 10, width: 1.2, extraArea: 0, thickness: 0.1, baseThickness: 0.1, baseLooseFactor: 1.25,
    baseWastePercentage: 5, mixCement: 1, mixSand: 2, mixGravel: 3, cementBagWeight: 42.5,
    concreteWastePercentage: 5, includeMesh: true, meshSheetArea: 14.1, meshLapPercentage: 10,
    jointSpacing: 2, metersPerSealantCartridge: 5, includeSealer: true, sealerCoverage: 20,
  };
  const prices = { cementBag: 8.4, sandCubicMeter: 35, gravelCubicMeter: 31, baseCubicMeter: 20, meshSheet: 30, sealantCartridge: 6, sealerGallon: 25, laborSquareMeter: 6 };

  it("calcula volumen, base, malla, juntas y sellador", () => {
    const r = calculateWalkway(base, prices);
    expect(r.area).toBeCloseTo(12, 9);
    expect(r.volume).toBeCloseTo(1.2, 9);
    expect(r.baseVolume).toBeCloseTo(12 * 0.1 * 1.25 * 1.05, 9);
    expect(r.meshSheets).toBe(Math.ceil((12 * 1.1) / 14.1));
    // 4 juntas transversales de 1.2 m y 0 longitudinales (ancho 1.2 < 2).
    expect(r.jointLength).toBeCloseTo(4 * 1.2, 9);
    expect(r.sealantCartridges).toBe(1);
    expect(r.sealerGallons).toBe(1);
    expect(r.totalCost).toBeCloseTo(r.materialsCost + r.laborCost, 9);
  });

  it("sin malla ni sellador no los cuenta; sin área devuelve cero", () => {
    const r = calculateWalkway({ ...base, includeMesh: false, includeSealer: false }, prices);
    expect(r.meshSheets).toBe(0);
    expect(r.sealerGallons).toBe(0);
    expect(calculateWalkway({ ...base, length: 0 }, prices).totalCost).toBe(0);
  });
});

describe("calculateSkylights", () => {
  const base: SkylightInput = {
    units: 2, width: 1, length: 1.5, panelWastePercentage: 10, crossbarSpacing: 0.6, profilePieceLength: 6,
    profileWastePercentage: 5, metersPerSealantCartridge: 6, screwsPerSquareMeter: 8, screwsPerBox: 100,
    flashingPieceLength: 3,
  };
  const prices = { panelSquareMeter: 18, profilePiece: 14, sealantCartridge: 6, screwBox: 7, flashingPiece: 9, laborUnit: 40 };

  it("calcula panel, perfil, sellador, tornillos y botaguas", () => {
    const r = calculateSkylights(base, prices);
    expect(r.totalArea).toBeCloseTo(3, 9);
    expect(r.panelArea).toBeCloseTo(3.3, 9);
    // 2 travesaños por unidad: perímetro 5 + 2 × 1 = 7 m por unidad.
    expect(r.profileMeters).toBeCloseTo(14, 9);
    expect(r.profilePieces).toBe(Math.ceil((14 * 1.05) / 6));
    expect(r.sealantCartridges).toBe(Math.ceil((2 * 5 * 2) / 6));
    expect(r.screwBoxes).toBe(1);
    expect(r.flashingPieces).toBe(Math.ceil((2 * 5) / 3));
    expect(r.laborCost).toBeCloseTo(80, 9);
    expect(r.totalCost).toBeCloseTo(r.materialsCost + r.laborCost, 9);
  });

  it("sin unidades devuelve cero", () => {
    expect(calculateSkylights({ ...base, units: 0 }, prices).totalCost).toBe(0);
  });
});
