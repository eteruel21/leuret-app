import { describe, expect, it } from "vitest";

import {
  calculateReadyMix,
  calculateSubfloor,
  type ReadyMixInput,
  type SubfloorInput,
} from "../finishing-calculations";

describe("calculateReadyMix", () => {
  const base: ReadyMixInput = {
    length: 10, width: 8, thickness: 0.12, extraVolume: 0, wastePercentage: 5, orderStep: 0.5,
    truckCapacity: 7, minimumLoad: 3, includePump: true,
  };
  const prices = { concreteCubicMeter: 135, shortLoadFee: 60, pumpService: 350, laborCubicMeter: 12 };

  it("pide en múltiplos del paso y cuenta camiones", () => {
    const r = calculateReadyMix(base, prices);
    expect(r.netVolume).toBeCloseTo(9.6, 9);
    // 9.6 × 1.05 = 10.08 → 10.5 m³.
    expect(r.orderVolume).toBeCloseTo(10.5, 9);
    expect(r.trucks).toBe(2);
    expect(r.lastLoad).toBeCloseTo(3.5, 9);
    expect(r.shortLoad).toBe(false);
    expect(r.totalCost).toBeCloseTo(10.5 * 135 + 350 + 9.6 * 12, 9);
  });

  it("cobra recargo cuando el último camión va corto", () => {
    const r = calculateReadyMix({ ...base, thickness: 0.15 }, prices);
    // 12 × 1.05 = 12.6 → 13 m³: camiones de 7 y 6 → no es corto; usamos otra medida.
    expect(r.shortLoad).toBe(false);
    const short = calculateReadyMix({ ...base, length: 5, width: 5, thickness: 0.2, truckCapacity: 4, wastePercentage: 0 }, prices);
    // 5 m³ en camiones de 4: último de 1 m³ (< 3) → recargo.
    expect(short.trucks).toBe(2);
    expect(short.lastLoad).toBeCloseTo(1, 9);
    expect(short.shortLoad).toBe(true);
    expect(short.shortLoadCost).toBe(60);
  });

  it("sin bomba no cobra el servicio y sin medidas devuelve cero", () => {
    expect(calculateReadyMix({ ...base, includePump: false }, prices).pumpCost).toBe(0);
    expect(calculateReadyMix({ ...base, length: 0 }, prices).totalCost).toBe(0);
  });
});

describe("calculateSubfloor", () => {
  const base: SubfloorInput = {
    area: 40, thickness: 0.05, mixCement: 1, mixSand: 4, cementBagWeight: 42.5, wastePercentage: 8,
    perimeter: 26, doorWidths: 2.7, baseboardPieceLength: 0.6, baseboardWastePercentage: 10,
    adhesiveKgPerMeter: 0.3, adhesiveBagWeight: 5,
  };
  const prices = {
    cementBag: 8.4, sandCubicMeter: 35, baseboardPiece: 1.2, adhesiveBag: 7,
    laborSubfloorSquareMeter: 4, laborBaseboardMeter: 2,
  };

  it("calcula mortero y zócalo", () => {
    const r = calculateSubfloor(base, prices);
    if (!r) throw new Error("resultado nulo");
    expect(r.mortar.netVolume).toBeCloseTo(2, 9);
    expect(r.mortar.cementBagsToBuy).toBeGreaterThan(0);
    expect(r.baseboardLength).toBeCloseTo(23.3, 9);
    expect(r.baseboardPieces).toBe(Math.ceil((23.3 * 1.1) / 0.6));
    expect(r.adhesiveBags).toBe(Math.ceil((23.3 * 0.3) / 5));
    expect(r.laborCost).toBeCloseTo(40 * 4 + 23.3 * 2, 9);
    expect(r.totalCost).toBeCloseTo(r.materialsCost + r.laborCost, 9);
  });

  it("solo zócalo (sin área) y sin nada", () => {
    const r = calculateSubfloor({ ...base, area: 0 }, prices);
    expect(r?.mortar.cementBagsToBuy).toBe(0);
    expect(r?.baseboardPieces).toBeGreaterThan(0);
    expect(calculateSubfloor({ ...base, area: 0, perimeter: 0 }, prices)).toBeNull();
  });
});
