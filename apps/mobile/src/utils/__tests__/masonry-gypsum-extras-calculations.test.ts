import { describe, expect, it } from "vitest";

import {
  calculateGypsumWalls,
  calculateReinforcedMasonry,
  type GypsumWallsInput,
  type ReinforcedMasonryInput,
} from "../masonry-gypsum-extras-calculations";

describe("calculateReinforcedMasonry", () => {
  const base: ReinforcedMasonryInput = {
    wallLength: 10, wallHeight: 2.4, openingsArea: 2, blockLength: 0.4, blockHeight: 0.2,
    blockWastePercentage: 5, layingMortarPerSquareMeter: 0.015, mortarCement: 1, mortarSand: 4,
    groutCement: 1, groutSand: 2, groutGravel: 3, cementBagWeight: 42.5, verticalSpacing: 0.8,
    anchorLength: 0.4, horizontalEveryCourses: 3, cellFillPerMeter: 0.009, groutWastePercentage: 10,
    barSize: 4, barPieceLength: 9.14, rebarWastePercentage: 5, includeRebar: true,
  };
  const prices = { blockUnit: 0.95, cementBag: 8.4, sandCubicMeter: 35, gravelCubicMeter: 31, bar: 8, laborSquareMeter: 7, laborRebarKg: 0.5 };

  it("calcula bloques, celdas rellenas y varillas", () => {
    const r = calculateReinforcedMasonry(base, prices);
    expect(r.netWallArea).toBeCloseTo(22, 9);
    expect(r.blocksToBuy).toBe(Math.ceil((22 / 0.08) * 1.05));
    expect(r.filledCells).toBe(Math.floor(10 / 0.8) + 1);
    const vertical = r.filledCells * (2.4 + 0.4);
    const rows = Math.floor(2.4 / (3 * 0.2) + 1e-9);
    expect(r.barMeters).toBeCloseTo(vertical + rows * 10 * 1.05, 9);
    expect(r.groutVolume).toBeCloseTo(r.filledCells * 2.4 * 0.009 * 1.1, 9);
    expect(r.barPieces).toBe(Math.ceil((r.barMeters * 1.05) / 9.14));
    expect(r.totalCost).toBeCloseTo(r.materialsCost + r.laborCost, 9);
  });

  it("sin varilla no cuenta acero y con medidas en cero devuelve cero", () => {
    const r = calculateReinforcedMasonry({ ...base, includeRebar: false }, prices);
    expect(r.barMeters).toBe(0);
    expect(r.barPieces).toBe(0);
    expect(calculateReinforcedMasonry({ ...base, wallLength: 0 }, prices).totalCost).toBe(0);
  });

  it("sin refuerzo horizontal solo cuenta varillas verticales", () => {
    const r = calculateReinforcedMasonry({ ...base, horizontalEveryCourses: 0 }, prices);
    expect(r.barMeters).toBeCloseTo(r.filledCells * 2.8, 9);
  });
});

describe("calculateGypsumWalls", () => {
  const base: GypsumWallsInput = {
    wallLength: 8, wallHeight: 2.6, openingsArea: 1.8, doorCount: 1, doorWidth: 0.9, sides: 2, layers: 1,
    boardWidth: 1.22, boardHeight: 2.44, wastePercentage: 10, studSpacing: 0.4, studPieceLength: 3.05,
    trackPieceLength: 3.05, screwsPerBoard: 28, screwsPerBox: 1000, tapePerSquareMeter: 1.4,
    tapeRollLength: 90, compoundKgPerSquareMeter: 0.5, compoundPackageKg: 28, includeInsulation: true,
    insulationRollArea: 10, cornerLength: 5, cornerPieceLength: 3.05,
  };
  const prices = { board: 12, stud: 4, track: 3.5, screwBox: 9, tapeRoll: 5, compoundPackage: 14, insulationRoll: 22, cornerPiece: 2.5, laborSquareMeter: 6 };

  it("cuenta láminas, parales, riel, aislante y esquineros", () => {
    const r = calculateGypsumWalls(base, prices);
    expect(r.netWallArea).toBeCloseTo(8 * 2.6 - 1.8, 9);
    expect(r.finishedArea).toBeCloseTo(r.netWallArea * 2, 9);
    expect(r.boardsToBuy).toBe(Math.ceil(((r.netWallArea * 2) / (1.22 * 2.44)) * 1.1));
    expect(r.studPositions).toBe(20 + 1 + 2);
    expect(r.studPieces).toBe(23);
    expect(r.trackPieces).toBe(Math.ceil(((16 + 0.9) * 1.05) / 3.05));
    expect(r.insulationRolls).toBe(Math.ceil((r.netWallArea * 1.05) / 10));
    expect(r.cornerPieces).toBe(2);
    expect(r.totalCost).toBeCloseTo(r.materialsCost + r.laborCost, 9);
  });

  it("doble capa duplica láminas y mano de obra; sin aislante no cuenta rollos", () => {
    const one = calculateGypsumWalls(base, prices);
    const two = calculateGypsumWalls({ ...base, layers: 2, includeInsulation: false }, prices);
    expect(two.boardsToBuy).toBeGreaterThanOrEqual(one.boardsToBuy * 2 - 1);
    expect(two.laborCost).toBeCloseTo(one.laborCost * 2, 9);
    expect(two.insulationRolls).toBe(0);
  });

  it("parales más largos que la pieza se parten en dos", () => {
    const r = calculateGypsumWalls({ ...base, wallHeight: 3.5, doorCount: 0, openingsArea: 0 }, prices);
    expect(r.studPieces).toBe(r.studPositions * 2);
    expect(calculateGypsumWalls({ ...base, wallLength: 0 }, prices).totalCost).toBe(0);
  });
});
