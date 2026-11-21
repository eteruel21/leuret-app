import { describe, expect, it } from "vitest";

import {
  calculateEarthwork,
  calculateFormwork,
  calculateStructure,
  type EarthworkInput,
  type FormworkInput,
  type StructureInput,
} from "../structure-calculations";

describe("calculateEarthwork", () => {
  const base: EarthworkInput = {
    length: 10, width: 5, depth: 1.2, structureVolume: 10, swellPercentage: 25,
    compactionPercentage: 20, reusePercentage: 100, truckCapacity: 8, includeBackfill: true,
  };
  const prices = { excavationCubicMeter: 6, backfillCubicMeter: 8, haulTrip: 40, importedFillCubicMeter: 18 };

  it("excava, rellena con material del sitio y saca el sobrante", () => {
    const r = calculateEarthwork(base, prices);
    expect(r.bankVolume).toBeCloseTo(60, 9);
    expect(r.looseVolume).toBeCloseTo(75, 9);
    expect(r.backfillCompacted).toBeCloseTo(50, 9);
    expect(r.backfillLoose).toBeCloseTo(60, 9);
    expect(r.importedLoose).toBe(0);
    expect(r.haulAwayLoose).toBeCloseTo(15, 9);
    expect(r.tripsOut).toBe(2);
    expect(r.tripsIn).toBe(0);
    expect(r.totalCost).toBeCloseTo(60 * 6 + 50 * 8 + 2 * 40, 9);
  });

  it("importa material cuando lo excavado no alcanza", () => {
    const r = calculateEarthwork({ ...base, reusePercentage: 20 }, prices);
    expect(r.reusedLoose).toBeCloseTo(15, 9);
    expect(r.importedLoose).toBeCloseTo(45, 9);
    expect(r.tripsIn).toBe(6);
    expect(r.materialsCost).toBeCloseTo(45 * 18, 9);
  });

  it("sin relleno solo excava y acarrea", () => {
    const r = calculateEarthwork({ ...base, includeBackfill: false }, prices);
    expect(r.backfillCompacted).toBe(0);
    expect(r.tripsOut).toBe(Math.ceil(75 / 8));
  });

  it("sin medidas devuelve cero", () => {
    expect(calculateEarthwork({ ...base, depth: 0 }, prices).totalCost).toBe(0);
  });
});

describe("calculateFormwork", () => {
  const base: FormworkInput = {
    directArea: 0, columnCount: 4, columnWidthCm: 20, columnDepthCm: 20, columnHeight: 3,
    beamLength: 10, beamWidthCm: 20, beamHeightCm: 30, slabArea: 0, edgeLength: 0, edgeHeight: 0,
    uses: 4, sheetWidth: 1.22, sheetLength: 2.44, lumberPiecesPerSquareMeter: 1,
    nailsKgPerSquareMeter: 0.15, wastePercentage: 10,
  };
  const prices = { sheet: 38, lumberPiece: 8, nailKg: 3.9, laborSquareMeter: 7 };

  it("suma columnas y vigas y reparte el material entre los usos", () => {
    const r = calculateFormwork(base, prices);
    expect(r.columnsArea).toBeCloseTo(4 * 0.8 * 3, 9);
    expect(r.beamsArea).toBeCloseTo(10 * 0.8, 9);
    expect(r.totalArea).toBeCloseTo(9.6 + 8, 9);
    expect(r.sheets).toBe(Math.ceil(((17.6 / 4) * 1.1) / (1.22 * 2.44)));
    expect(r.nailsKg).toBeCloseTo(17.6 * 0.15, 9);
    expect(r.laborCost).toBeCloseTo(17.6 * 7, 9);
  });

  it("sin área devuelve cero", () => {
    expect(calculateFormwork({ ...base, columnCount: 0, beamLength: 0 }, prices).totalCost).toBe(0);
  });
});

describe("calculateStructure", () => {
  const base: StructureInput = {
    footingCount: 4, footingLength: 1, footingWidth: 1, footingHeight: 0.4,
    columnCount: 4, columnWidthCm: 20, columnDepthCm: 20, columnHeight: 3,
    beamLength: 20, beamWidthCm: 20, beamHeightCm: 30, slabArea: 0, slabThickness: 0.12,
    footingRebarKgM3: 60, columnRebarKgM3: 140, beamRebarKgM3: 120, slabRebarKgM3: 80,
    mixCement: 1, mixSand: 2, mixGravel: 3, cementBagWeight: 42.5, concreteWastePercentage: 5,
    barSize: 4, barPieceLength: 9.14, rebarWastePercentage: 5, tieWireKgPer100Kg: 1.5,
    includeFormwork: true, formworkUses: 4, sheetWidth: 1.22, sheetLength: 2.44,
    lumberPiecesPerSquareMeter: 1, nailsKgPerSquareMeter: 0.15, formworkWastePercentage: 10,
  };
  const prices = {
    cementBag: 8.4, sandCubicMeter: 35, gravelCubicMeter: 31, bar: 8, tieWireKg: 2,
    sheet: 38, lumberPiece: 8, nailKg: 3.9, laborConcreteCubicMeter: 56, laborRebarKg: 0.5,
    laborFormworkSquareMeter: 7,
  };

  it("calcula volúmenes, acero y encofrado de varios elementos", () => {
    const r = calculateStructure(base, prices);
    if (!r) throw new Error("resultado nulo");
    expect(r.footingsVolume).toBeCloseTo(1.6, 9);
    expect(r.columnsVolume).toBeCloseTo(0.48, 9);
    expect(r.beamsVolume).toBeCloseTo(1.2, 9);
    expect(r.concreteVolume).toBeCloseTo(3.28, 9);
    expect(r.steelKg).toBeCloseTo(1.6 * 60 + 0.48 * 140 + 1.2 * 120, 9);
    expect(r.barPieces).toBe(Math.ceil((r.steelKg * 1.05) / (0.994 * 9.14)));
    expect(r.formwork.totalArea).toBeCloseTo(4 * 4 * 0.4 + 4 * 0.8 * 3 + 20 * 0.8, 9);
    expect(r.totalCost).toBeCloseTo(r.materialsCost + r.laborCost, 9);
    expect(r.concrete.laborCost).toBeCloseTo(3.28 * 56, 9);
  });

  it("sin encofrado no suma formaleta", () => {
    const r = calculateStructure({ ...base, includeFormwork: false }, prices);
    expect(r?.formwork.totalCost).toBe(0);
  });

  it("sin elementos devuelve null", () => {
    expect(calculateStructure({ ...base, footingCount: 0, columnCount: 0, beamLength: 0 }, prices)).toBeNull();
  });
});
