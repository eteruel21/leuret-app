import { describe, expect, it } from "vitest";

import { calculateElectrical } from "../calculations";
import {
  DEVICES_ONLY_SCOPE,
  FULL_INSTALL_SCOPE,
  electricalBudgetLine,
  normalizeScope,
  relevantPriceTargets,
  scopePreset,
} from "../electrical-scope";

const technical = {
  averageRouteLength: 8,
  lightingConductors: 3,
  powerConductors: 3,
  wastePercentage: 10,
  cableRollLength: 100,
  conduitPieceLength: 3,
  lightingPointsPerCircuit: 8,
  outletPointsPerCircuit: 6,
};

const prices = {
  lightingCableRoll: 45,
  powerCableRoll: 55,
  conduitPiece: 3.5,
  boxUnit: 1.2,
  outletUnit: 1.2,
  switchUnit: 4,
  breakerUnit: 12,
  supplies: 20,
  laborStandardPoint: 13.8,
  laborDedicatedPoint: 35,
};

const sixOutlets = { lightPoints: 0, switchPoints: 0, outletPoints: 6, dedicatedPoints: 0 };

describe("cambio de tomacorrientes (solo piezas y mano de obra)", () => {
  it("cobra solo los 6 tomacorrientes y su instalación", () => {
    const result = calculateElectrical({ ...sixOutlets, ...technical, ...DEVICES_ONLY_SCOPE }, prices);
    expect(result.outletCost).toBeCloseTo(7.2);
    expect(result.standardLaborCost).toBeCloseTo(82.8);
    expect(result.totalCost).toBeCloseTo(90);
    expect(result.lightingCableRollsToBuy + result.powerCableRollsToBuy + result.conduitPieces).toBe(0);
    expect(result.boxes).toBe(0);
    expect(result.totalBreakers).toBe(0);
    expect(result.suppliesCost).toBe(0);
  });

  it("no exige longitudes de cable cuando no hay cableado", () => {
    const result = calculateElectrical(
      { ...sixOutlets, ...technical, averageRouteLength: 0, cableRollLength: 0, conduitPieceLength: 0, ...DEVICES_ONLY_SCOPE },
      prices,
    );
    expect(result.totalCost).toBeCloseTo(90);
  });

  it("describe la partida por unidad", () => {
    const line = electricalBudgetLine(sixOutlets, DEVICES_ONLY_SCOPE, { materialsCost: 7.2, laborCost: 82.8 });
    expect(line).toEqual({
      description: "Suministro e instalación de 6 tomacorrientes",
      unitName: "und.",
      quantity: 6,
    });
  });

  it("pide solo los precios del trabajo", () => {
    expect(relevantPriceTargets(sixOutlets, DEVICES_ONLY_SCOPE)).toEqual(["outlet", "standardLabor"]);
  });
});

describe("instalación completa", () => {
  it("mantiene el cálculo anterior cuando no se indica el alcance", () => {
    const counts = { lightPoints: 6, switchPoints: 4, outletPoints: 10, dedicatedPoints: 1 };
    const legacy = calculateElectrical({ ...counts, ...technical }, prices);
    const full = calculateElectrical({ ...counts, ...technical, ...FULL_INSTALL_SCOPE }, prices);
    expect(full).toEqual(legacy);
    expect(legacy.boxes).toBe(21);
    expect(legacy.totalBreakers).toBe(1 + 2 + 1);
  });

  it("usa el precio del tomacorriente de 240 V cuando existe", () => {
    const counts = { lightPoints: 0, switchPoints: 0, outletPoints: 2, dedicatedPoints: 1 };
    const result = calculateElectrical(
      { ...counts, ...technical, ...DEVICES_ONLY_SCOPE },
      { ...prices, dedicatedOutletUnit: 9 },
    );
    expect(result.dedicatedOutletCost).toBe(9);
    expect(result.outletCost).toBeCloseTo(2 * 1.2 + 9);
  });

  it("describe varias piezas por puntos e indica lo que incluye", () => {
    const counts = { lightPoints: 2, switchPoints: 1, outletPoints: 3, dedicatedPoints: 0 };
    expect(electricalBudgetLine(counts, FULL_INSTALL_SCOPE, { materialsCost: 100, laborCost: 50 })).toEqual({
      description:
        "Suministro e instalación de 2 puntos de luz, 1 interruptor y 3 tomacorrientes (incluye cableado, tubería, cajas, breakers y accesorios)",
      unitName: "punto",
      quantity: 6,
    });
  });
});

describe("alcance", () => {
  it("reconoce los dos tipos de trabajo y el personalizado", () => {
    expect(scopePreset(DEVICES_ONLY_SCOPE)).toBe("devices");
    expect(scopePreset(FULL_INSTALL_SCOPE)).toBe("full");
    expect(scopePreset({ ...FULL_INSTALL_SCOPE, includeBoxes: false })).toBe("custom");
  });

  it("completa un alcance guardado incompleto", () => {
    expect(normalizeScope({ includeWiring: false })).toEqual({ ...FULL_INSTALL_SCOPE, includeWiring: false });
    expect(normalizeScope(null, DEVICES_ONLY_SCOPE)).toEqual(DEVICES_ONLY_SCOPE);
  });

  it("sin mano de obra la partida es solo suministro", () => {
    expect(electricalBudgetLine(sixOutlets, { ...DEVICES_ONLY_SCOPE, includeLabor: false }, { materialsCost: 7.2, laborCost: 0 }).description)
      .toBe("Suministro de 6 tomacorrientes");
  });
});
