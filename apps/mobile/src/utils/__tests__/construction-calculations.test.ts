import { describe, expect, it } from "vitest";

import { calculateConcrete } from "../calculations";
import {
  calculatePlumbing,
  calculateRebar,
  calculateRoofing,
  calculateWaterproofing,
  emptyRebarResult,
  piecesForRun,
  type PlumbingInput,
  type RebarInput,
  type RoofingInput,
} from "../construction-calculations";

describe("piecesForRun", () => {
  it("cuenta piezas con empalmes", () => {
    expect(piecesForRun(5, 9.14, 0.5)).toBe(1);
    expect(piecesForRun(12, 9.14, 0.5)).toBe(2);
    expect(piecesForRun(0, 9.14, 0.5)).toBe(0);
  });
});

describe("calculateRebar", () => {
  const base: RebarInput = {
    gridLength: 5, gridWidth: 4, gridSpacingAcrossWidth: 0.2, gridSpacingAlongLength: 0.2,
    gridBarSize: 3, gridLayers: 1, meshArea: 0, meshSheetWidth: 2.35, meshSheetLength: 6,
    meshOverlap: 0.15, memberCount: 0, memberLength: 0, mainBarsPerMember: 0, mainBarSize: 4,
    sectionWidthCm: 20, sectionHeightCm: 20, coverCm: 3, stirrupSpacing: 0.15,
    stirrupBarSize: 2, stirrupHookLength: 0.2, barPieceLength: 9.14, lapDiameters: 40,
    wastePercentage: 5, tieWireKgPer100Kg: 1.5,
  };
  const prices = { gridBar: 4, mainBar: 7, stirrupBar: 2, meshSheet: 30, tieWireKg: 2, laborKg: 0.5, laborMeshSquareMeter: 1 };

  it("parrilla de 5 x 4 m a 20 cm", () => {
    const r = calculateRebar(base, prices);
    expect(r.gridBarsAlongLength).toBe(21);
    expect(r.gridBarsAlongWidth).toBe(26);
    expect(r.gridPieces).toBe(Math.ceil(47 * 1.05));
    expect(r.gridKg).toBeCloseTo((21 * 5 + 26 * 4) * 0.56, 6);
    expect(r.totalCost).toBeGreaterThan(0);
    expect(r.laborCost).toBeGreaterThan(0);
  });

  it("columnas: varillas y estribos", () => {
    const r = calculateRebar({ ...base, gridLength: 0, memberCount: 4, memberLength: 3, mainBarsPerMember: 4 }, prices);
    expect(r.mainPieces).toBe(Math.ceil(16 * 1.05));
    expect(r.stirrupsPerMember).toBe(21);
    expect(r.stirrupLength).toBeCloseTo((2 * 28) / 100 + 0.2, 9);
  });

  it("malla electrosoldada con traslape", () => {
    const r = calculateRebar({ ...base, gridLength: 0, meshArea: 20 }, prices);
    expect(r.meshSheets).toBe(Math.ceil((20 * 1.05) / (2.2 * 5.85)));
  });

  it("sin medidas no calcula nada", () => {
    expect(calculateRebar({ ...base, gridLength: 0 }, prices)).toEqual(emptyRebarResult());
  });
});

describe("calculateRoofing", () => {
  const base: RoofingInput = {
    roofType: "gable", length: 10, width: 6, overhang: 0.5, slopePercent: 30,
    sheetEffectiveWidth: 0.9, sheetLength: 6.1, longitudinalLap: 0.2, purlinSpacing: 1,
    purlinPieceLength: 6.1, purlinLap: 0.15, screwsPerSquareMeter: 6, screwsPerBox: 100,
    includeRidge: true, ridgePieceLength: 3.05, includeGutter: true, gutterPieceLength: 3.05,
    downspouts: 2, wastePercentage: 8,
  };
  const prices = { sheet: 20, purlin: 15, screwBox: 10, ridgePiece: 12, gutterPiece: 9, downspoutPiece: 8, supplies: 20, laborSquareMeter: 6 };

  it("techo a dos aguas con pendiente", () => {
    const r = calculateRoofing(base, prices);
    const cos = Math.cos(Math.atan(0.3));
    expect(r.slopeLength).toBeCloseTo(3.5 / cos, 9);
    expect(r.roofArea).toBeCloseTo(2 * (3.5 / cos) * 11, 9);
    expect(r.sheetsAcross).toBe(Math.ceil(11 / 0.9));
    expect(r.sheetsPerRun).toBe(1);
    expect(r.ridgePieces).toBe(Math.ceil((11 * 1.08) / 3.05));
    expect(r.gutterMeters).toBe(22);
    expect(r.totalCost).toBeGreaterThan(0);
  });

  it("una agua no lleva cumbrera y tiene una sola canal", () => {
    const r = calculateRoofing({ ...base, roofType: "shed" }, prices);
    expect(r.planes).toBe(1);
    expect(r.ridgePieces).toBe(0);
    expect(r.gutterMeters).toBe(11);
  });

  it("empalma láminas cuando el tramo supera el largo de la lámina", () => {
    expect(calculateRoofing({ ...base, width: 15 }, prices).sheetsPerRun).toBeGreaterThanOrEqual(2);
  });

  it("sin medidas devuelve cero", () => {
    expect(calculateRoofing({ ...base, length: 0 }, prices).totalCost).toBe(0);
  });
});

describe("calculatePlumbing", () => {
  const base: PlumbingInput = {
    toilets: 2, sinks: 2, showers: 2, kitchenSinks: 1, laundry: 1, outdoorTaps: 1,
    supplyRoutePerPoint: 6, drainRoutePerPoint: 4, toiletDrainRoute: 3, pipePieceLength: 6.1,
    fittingsPercentage: 30, wastePercentage: 10, septicTanks: 1, includeFixtures: false,
  };
  const prices = {
    supplyPipe: 3, drainPipe2: 22, drainPipe4: 65, valve: 6, toilet: 90, sink: 40, shower: 30,
    kitchenSink: 70, laundrySink: 50, septicTank: 300, supplies: 25, laborPoint: 35,
  };

  it("cuenta puntos, llaves y mano de obra", () => {
    const r = calculatePlumbing(base, prices);
    expect(r.supplyPoints).toBe(9);
    expect(r.drainPoints2).toBe(6);
    expect(r.valves).toBe(8);
    expect(r.fixturesCost).toBe(0);
    expect(r.laborCost).toBe(9 * 35);
  });

  it("incluye los aparatos solo si se pide", () => {
    expect(calculatePlumbing({ ...base, includeFixtures: true }, prices).fixturesCost)
      .toBe(2 * 90 + 2 * 40 + 2 * 30 + 70 + 50);
  });

  it("sin puntos ni tanque devuelve cero", () => {
    const empty = { ...base, toilets: 0, sinks: 0, showers: 0, kitchenSinks: 0, laundry: 0, outdoorTaps: 0, septicTanks: 0 };
    expect(calculatePlumbing(empty, prices).totalCost).toBe(0);
  });
});

describe("calculateWaterproofing", () => {
  it("suma el rodapié, las manos, el primer y la malla", () => {
    const r = calculateWaterproofing(
      {
        area: 50, perimeter: 30, upturnHeight: 0.3, coats: 2, coveragePerGallonPerCoat: 5,
        primerEnabled: true, primerCoveragePerGallon: 8, meshEnabled: true,
        meshRollCoverage: 50, wastePercentage: 10,
      },
      { productGallon: 40, primerGallon: 25, meshRoll: 30, supplies: 15, laborSquareMeter: 3 },
    );
    expect(r.treatedArea).toBe(59);
    expect(r.productGallonsToBuy).toBe(Math.ceil(((59 * 2) / 5) * 1.1));
    expect(r.primerGallonsToBuy).toBe(Math.ceil((59 / 8) * 1.1));
    expect(r.meshRolls).toBe(Math.ceil((59 * 1.1) / 50));
    expect(r.laborCost).toBeCloseTo(59 * 3, 9);
  });
});

describe("Concreto: mortero y mano de obra", () => {
  const prices = { cementBag: 10, sandCubicMeter: 30, sandBag: 3, gravelCubicMeter: 35, gravelBag: 4, laborCubicMeter: 20 };
  const input = {
    netVolume: 3, wastePercentage: 5, mixCement: 1, mixSand: 2, mixGravel: 3, cementBagWeight: 42.5,
    sandBagVolume: 0.0142, gravelBagVolume: 0.0142,
    sandPriceMode: "cubicMeter" as const, gravelPriceMode: "cubicMeter" as const,
  };

  it("cobra la mano de obra sobre el volumen neto", () => {
    expect(calculateConcrete(input, prices).laborCost).toBeCloseTo(3 * 20, 9);
  });

  it("sin piedra calcula mortero con su factor de volumen seco", () => {
    const r = calculateConcrete({ ...input, mixSand: 3, mixGravel: 0 }, prices);
    expect(r.totalCost).toBeGreaterThan(0);
    expect(r.gravelVolume).toBe(0);
    expect(r.gravelCost).toBe(0);
    expect(r.dryVolume).toBeCloseTo(3.15 * 1.33, 9);
  });
});
