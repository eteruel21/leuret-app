import { describe, expect, it } from "vitest";

import {
  calculateSteelFrame,
  calculateWallTiling,
  type SteelFrameInput,
  type WallTilingInput,
} from "../tiling-steel-calculations";

describe("calculateWallTiling", () => {
  const base: WallTilingInput = {
    wallLength: 10, height: 2.4, extraArea: 0, openingsArea: 3, boxArea: 1.44, wastePercentage: 10,
    adhesiveKgPerSquareMeter: 5, adhesiveBagKg: 20, groutKgPerSquareMeter: 0.4, groutBagKg: 5,
    spacersPerSquareMeter: 25, spacersPerBag: 100, trimLength: 12, trimPieceLength: 2.5,
  };
  const prices = { tileSquareMeter: 14, adhesiveBag: 9, groutBag: 5, spacerBag: 2, trimPiece: 6, laborSquareMeter: 9 };

  it("descuenta vanos y compra por cajas completas", () => {
    const r = calculateWallTiling(base, prices);
    expect(r.netArea).toBeCloseTo(21, 9);
    expect(r.boxes).toBe(Math.ceil((21 * 1.1) / 1.44));
    expect(r.buyArea).toBeCloseTo(r.boxes * 1.44, 9);
    expect(r.adhesiveBags).toBe(Math.ceil((21 * 5) / 20));
    expect(r.groutBags).toBe(Math.ceil((21 * 0.4) / 5));
    expect(r.spacerBags).toBe(Math.ceil((21 * 25) / 100));
    expect(r.trimPieces).toBe(5);
    expect(r.laborCost).toBeCloseTo(21 * 9, 9);
    expect(r.totalCost).toBeCloseTo(r.materialsCost + r.laborCost, 9);
  });

  it("sin caja compra por metro cuadrado y sin área devuelve cero", () => {
    const r = calculateWallTiling({ ...base, boxArea: 0 }, prices);
    expect(r.buyArea).toBeCloseTo(21 * 1.1, 9);
    expect(r.boxes).toBe(0);
    expect(calculateWallTiling({ ...base, openingsArea: 99 }, prices).totalCost).toBe(0);
  });
});

describe("calculateSteelFrame", () => {
  const base: SteelFrameInput = {
    columnCount: 6, columnHeight: 3.5, columnKgPerMeter: 9.1, beamLength: 24, beamKgPerMeter: 11,
    purlinLength: 80, purlinKgPerMeter: 3.6, memberPieceLength: 6.1, wastePercentage: 5, basePlates: 6,
    electrodeKgPerSteelKg: 0.03, includePaint: true, surfaceSquareMetersPerKg: 0.045, paintCoats: 2,
    paintCoverage: 25,
  };
  const prices = { columnPiece: 60, beamPiece: 75, purlinPiece: 22, plate: 8, electrodeKg: 4, paintGallon: 28, laborKg: 0.9 };

  it("calcula kilos, piezas, soldadura y pintura", () => {
    const r = calculateSteelFrame(base, prices);
    expect(r.columnLength).toBeCloseTo(21, 9);
    expect(r.steelKg).toBeCloseTo(21 * 9.1 + 24 * 11 + 80 * 3.6, 9);
    expect(r.columnPieces).toBe(Math.ceil((21 * 1.05) / 6.1));
    expect(r.beamPieces).toBe(Math.ceil((24 * 1.05) / 6.1));
    expect(r.purlinPieces).toBe(Math.ceil((80 * 1.05) / 6.1));
    expect(r.electrodeKg).toBeCloseTo(r.steelKg * 0.03, 9);
    expect(r.paintGallons).toBe(Math.ceil((r.steelKg * 0.045 * 2) / 25));
    expect(r.laborCost).toBeCloseTo(r.steelKg * 0.9, 9);
    expect(r.totalCost).toBeCloseTo(r.materialsCost + r.laborCost, 9);
  });

  it("sin pintura no cuenta galones y sin acero devuelve cero", () => {
    expect(calculateSteelFrame({ ...base, includePaint: false }, prices).paintGallons).toBe(0);
    expect(calculateSteelFrame({ ...base, columnCount: 0, beamLength: 0, purlinLength: 0 }, prices).totalCost).toBe(0);
  });
});
