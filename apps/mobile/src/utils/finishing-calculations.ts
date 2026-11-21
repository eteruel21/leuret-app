/**
 * Concreto premezclado (pedido a planta) y contrapiso con zócalo.
 * Funciones puras: cantidades a comprar redondeadas hacia arriba y costos.
 */

import { calculateConcrete, type ConcreteResult } from "./calculations";

function sanitize(value: number): number {
  if (!Number.isFinite(value) || value < 0) return 0;
  return value;
}

function pct(value: number): number {
  return Math.min(sanitize(value), 100) / 100;
}

// ---------------------------------------------------------------------------
// Concreto premezclado
// ---------------------------------------------------------------------------

export type ReadyMixInput = {
  length: number;
  width: number;
  thickness: number;
  /** Volumen de otros elementos (columnas, vigas…), en m³. */
  extraVolume: number;
  wastePercentage: number;
  /** La planta vende en múltiplos de este volumen (m³). */
  orderStep: number;
  truckCapacity: number;
  /** Si el último camión lleva menos de esto, la planta cobra recargo. */
  minimumLoad: number;
  includePump: boolean;
};

export type ReadyMixPrices = {
  concreteCubicMeter: number;
  shortLoadFee: number;
  pumpService: number;
  laborCubicMeter: number;
};

export type ReadyMixResult = {
  netVolume: number;
  orderVolume: number;
  trucks: number;
  lastLoad: number;
  shortLoad: boolean;
  concreteCost: number;
  shortLoadCost: number;
  pumpCost: number;
  materialsCost: number;
  laborCost: number;
  totalCost: number;
};

export function emptyReadyMixResult(): ReadyMixResult {
  return {
    netVolume: 0, orderVolume: 0, trucks: 0, lastLoad: 0, shortLoad: false, concreteCost: 0,
    shortLoadCost: 0, pumpCost: 0, materialsCost: 0, laborCost: 0, totalCost: 0,
  };
}

export function calculateReadyMix(input: ReadyMixInput, prices: ReadyMixPrices): ReadyMixResult {
  const netVolume =
    sanitize(input.length) * sanitize(input.width) * sanitize(input.thickness) + sanitize(input.extraVolume);
  if (!netVolume) return emptyReadyMixResult();

  const withWaste = netVolume * (1 + pct(input.wastePercentage));
  const step = sanitize(input.orderStep) || 0.5;
  // Se pide en múltiplos del paso de la planta; el epsilon evita pedir de más por decimales.
  const orderVolume = Math.ceil(withWaste / step - 1e-9) * step;

  const capacity = sanitize(input.truckCapacity);
  const trucks = capacity ? Math.ceil(orderVolume / capacity - 1e-9) : 0;
  const lastLoad = capacity && trucks ? orderVolume - (trucks - 1) * capacity : orderVolume;
  const shortLoad = sanitize(input.minimumLoad) > 0 && lastLoad < sanitize(input.minimumLoad);

  const concreteCost = orderVolume * sanitize(prices.concreteCubicMeter);
  const shortLoadCost = shortLoad ? sanitize(prices.shortLoadFee) : 0;
  const pumpCost = input.includePump ? sanitize(prices.pumpService) : 0;
  const materialsCost = concreteCost + shortLoadCost + pumpCost;
  const laborCost = netVolume * sanitize(prices.laborCubicMeter);

  return {
    netVolume, orderVolume, trucks, lastLoad, shortLoad, concreteCost, shortLoadCost, pumpCost,
    materialsCost, laborCost, totalCost: materialsCost + laborCost,
  };
}

// ---------------------------------------------------------------------------
// Contrapiso y zócalo
// ---------------------------------------------------------------------------

export type SubfloorInput = {
  area: number;
  thickness: number;
  mixCement: number;
  mixSand: number;
  cementBagWeight: number;
  wastePercentage: number;
  perimeter: number;
  /** Ancho de puertas que no llevan zócalo. */
  doorWidths: number;
  baseboardPieceLength: number;
  baseboardWastePercentage: number;
  adhesiveKgPerMeter: number;
  adhesiveBagWeight: number;
};

export type SubfloorPrices = {
  cementBag: number;
  sandCubicMeter: number;
  baseboardPiece: number;
  adhesiveBag: number;
  laborSubfloorSquareMeter: number;
  laborBaseboardMeter: number;
};

export type SubfloorResult = {
  area: number;
  mortar: ConcreteResult;
  baseboardLength: number;
  baseboardPieces: number;
  adhesiveBags: number;
  baseboardCost: number;
  adhesiveCost: number;
  subfloorLaborCost: number;
  baseboardLaborCost: number;
  materialsCost: number;
  laborCost: number;
  totalCost: number;
};

export function calculateSubfloor(input: SubfloorInput, prices: SubfloorPrices): SubfloorResult | null {
  const area = sanitize(input.area);
  const baseboardLength = Math.max(sanitize(input.perimeter) - sanitize(input.doorWidths), 0);
  const volume = area * sanitize(input.thickness);
  if (!volume && !baseboardLength) return null;

  // Sin piedra, el cálculo de concreto devuelve mortero.
  const mortar = calculateConcrete(
    {
      netVolume: volume,
      wastePercentage: Math.min(sanitize(input.wastePercentage), 100),
      mixCement: input.mixCement,
      mixSand: input.mixSand,
      mixGravel: 0,
      cementBagWeight: input.cementBagWeight,
      sandBagVolume: 0,
      gravelBagVolume: 0,
      sandPriceMode: "cubicMeter",
      gravelPriceMode: "cubicMeter",
    },
    {
      cementBag: prices.cementBag,
      sandCubicMeter: prices.sandCubicMeter,
      sandBag: 0,
      gravelCubicMeter: 0,
      gravelBag: 0,
      laborCubicMeter: 0,
    },
  );

  const pieceLength = sanitize(input.baseboardPieceLength);
  const baseboardPieces = pieceLength
    ? Math.ceil((baseboardLength * (1 + pct(input.baseboardWastePercentage))) / pieceLength - 1e-9)
    : 0;
  const adhesiveBagWeight = sanitize(input.adhesiveBagWeight);
  const adhesiveBags = adhesiveBagWeight
    ? Math.ceil((baseboardLength * sanitize(input.adhesiveKgPerMeter)) / adhesiveBagWeight - 1e-9)
    : 0;

  const baseboardCost = baseboardPieces * sanitize(prices.baseboardPiece);
  const adhesiveCost = adhesiveBags * sanitize(prices.adhesiveBag);
  const subfloorLaborCost = area * sanitize(prices.laborSubfloorSquareMeter);
  const baseboardLaborCost = baseboardLength * sanitize(prices.laborBaseboardMeter);
  const materialsCost = mortar.materialsCost + baseboardCost + adhesiveCost;
  const laborCost = subfloorLaborCost + baseboardLaborCost;

  return {
    area, mortar, baseboardLength, baseboardPieces, adhesiveBags, baseboardCost, adhesiveCost,
    subfloorLaborCost, baseboardLaborCost, materialsCost, laborCost, totalCost: materialsCost + laborCost,
  };
}
