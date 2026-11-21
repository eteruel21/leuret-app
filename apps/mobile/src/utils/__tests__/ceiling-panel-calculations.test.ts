import { describe, expect, it } from "vitest";

import {
  calculateGypsumCeiling,
  calculatePanel,
  type GypsumCeilingInput,
  type PanelInput,
} from "../ceiling-panel-calculations";

describe("calculateGypsumCeiling", () => {
  const base: GypsumCeilingInput = {
    length: 5, width: 4, sheetWidth: 1.22, sheetLength: 2.44, mainSpacing: 1.2, furringSpacing: 0.6,
    profilePieceLength: 3.05, perimeterPieceLength: 3.05, hangerSpacing: 1.2, hangerLength: 0.6,
    hangerKgPerMeter: 0.016, screwsPerSquareMeter: 25, screwsPerBox: 1000, compoundKgPerSquareMeter: 0.6,
    compoundPailKg: 28, tapeMetersPerSquareMeter: 1.4, tapeRollLength: 90, wastePercentage: 10,
  };
  const prices = {
    sheet: 12, mainPiece: 4, furringPiece: 3, perimeterPiece: 2.5, hangerKg: 3, screwBox: 14,
    compoundPail: 20, tapeRoll: 6, laborSquareMeter: 6,
  };

  it("calcula láminas, perfiles, colgantes y acabado", () => {
    const r = calculateGypsumCeiling(base, prices);
    expect(r.area).toBeCloseTo(20, 9);
    expect(r.perimeter).toBeCloseTo(18, 9);
    expect(r.sheets).toBe(Math.ceil((20 * 1.1) / (1.22 * 2.44)));
    // 4 m de ancho cada 1.2 m → 4 líneas de canal portante de 5 m → 2 piezas de 3.05 m.
    expect(r.mainLines).toBe(4);
    expect(r.mainPieces).toBe(4 * 2);
    // 5 m de largo cada 0.6 m → 9 + 1 líneas de 4 m → 2 piezas.
    expect(r.furringLines).toBe(10);
    expect(r.furringPieces).toBe(10 * 2);
    expect(r.perimeterPieces).toBe(Math.ceil((18 * 1.1) / 3.05));
    expect(r.hangers).toBe(4 * (Math.ceil(5 / 1.2) + 1));
    expect(r.screwBoxes).toBe(1);
    expect(r.laborCost).toBeCloseTo(20 * 6, 9);
    expect(r.totalCost).toBeCloseTo(r.materialsCost + r.laborCost, 9);
  });

  it("sin medidas devuelve cero", () => {
    expect(calculateGypsumCeiling({ ...base, width: 0 }, prices).totalCost).toBe(0);
  });
});

describe("calculatePanel", () => {
  const base: PanelInput = {
    singlePole15: 6, singlePole20: 8, doublePole30: 2, doublePole50: 1, reservePercentage: 20,
    rods: 2, groundCableLength: 12, cableWastePercentage: 10,
  };
  const prices = {
    panel: 90, mainBreaker: 45, breaker15: 6, breaker20: 6.5, breaker2p30: 14, breaker2p50: 18,
    rod: 18, groundCableMeter: 2.2, rodClamp: 3, laborPanel: 60, laborCircuit: 8, laborGrounding: 40,
  };

  it("elige el tamaño del centro de carga y cuenta interruptores y tierra", () => {
    const r = calculatePanel(base, prices);
    expect(r.circuits).toBe(17);
    // 6 + 8 + 2×3 = 20 espacios; con 20 % de reserva → 24 → centro de carga de 24.
    expect(r.spacesUsed).toBe(20);
    expect(r.spacesNeeded).toBe(24);
    expect(r.panelSpaces).toBe(24);
    expect(r.groundCable).toBeCloseTo(13.2, 9);
    expect(r.rodClamps).toBe(2);
    expect(r.breakersCost).toBeCloseTo(6 * 6 + 8 * 6.5 + 2 * 14 + 18, 9);
    expect(r.laborCost).toBeCloseTo(60 + 17 * 8 + 40, 9);
    expect(r.totalCost).toBeCloseTo(r.materialsCost + r.laborCost, 9);
  });

  it("sin varillas no cobra la mano de obra de tierra", () => {
    const r = calculatePanel({ ...base, rods: 0 }, prices);
    expect(r.laborCost).toBeCloseTo(60 + 17 * 8, 9);
  });

  it("sin circuitos devuelve cero y un centro pequeño usa 4 espacios", () => {
    expect(calculatePanel({ ...base, singlePole15: 0, singlePole20: 0, doublePole30: 0, doublePole50: 0 }, prices).totalCost).toBe(0);
    const small = calculatePanel({ ...base, singlePole15: 2, singlePole20: 1, doublePole30: 0, doublePole50: 0, reservePercentage: 0 }, prices);
    expect(small.panelSpaces).toBe(4);
  });
});
