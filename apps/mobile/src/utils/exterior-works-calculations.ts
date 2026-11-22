/**
 * Barandas y pasamanos, aceras y pisos exteriores, tragaluces.
 * Funciones puras: cantidades a comprar redondeadas hacia arriba y costos.
 */

import { calculateConcrete } from "./calculations";

function sanitize(value: number): number {
  if (!Number.isFinite(value) || value < 0) return 0;
  return value;
}

function pct(value: number): number {
  return Math.min(sanitize(value), 100) / 100;
}

const EPS = 1e-9;
const up = (x: number) => Math.ceil(x - EPS) || 0;

// ---------------------------------------------------------------------------
// Barandas y pasamanos (tubo metálico)
// ---------------------------------------------------------------------------

export type RailingInput = {
  length: number;
  height: number;
  postSpacing: number;
  /** Largo extra del poste para empotrarlo o soldarlo a la placa. */
  postEmbed: number;
  includeBalusters: boolean;
  balusterSpacing: number;
  railRows: number;
  handrailRuns: number;
  tubePieceLength: number;
  wastePercentage: number;
  electrodeKgPerMeter: number;
  includePaint: boolean;
  /** Superficie de tubo por metro lineal, en m²/m. */
  surfacePerMeter: number;
  paintCoats: number;
  paintCoverage: number;
};

export type RailingPrices = {
  postTube: number;
  railTube: number;
  balusterTube: number;
  electrodeKg: number;
  paintGallon: number;
  laborMeter: number;
};

export type RailingResult = {
  posts: number;
  balusters: number;
  postMeters: number;
  balusterMeters: number;
  railMeters: number;
  postPieces: number;
  railPieces: number;
  balusterPieces: number;
  electrodeKg: number;
  paintGallons: number;
  postCost: number;
  railCost: number;
  balusterCost: number;
  electrodeCost: number;
  paintCost: number;
  materialsCost: number;
  laborCost: number;
  totalCost: number;
};

export function emptyRailingResult(): RailingResult {
  return {
    posts: 0, balusters: 0, postMeters: 0, balusterMeters: 0, railMeters: 0, postPieces: 0, railPieces: 0,
    balusterPieces: 0, electrodeKg: 0, paintGallons: 0, postCost: 0, railCost: 0, balusterCost: 0,
    electrodeCost: 0, paintCost: 0, materialsCost: 0, laborCost: 0, totalCost: 0,
  };
}

export function calculateRailing(input: RailingInput, prices: RailingPrices): RailingResult {
  const length = sanitize(input.length);
  const height = sanitize(input.height);
  const postSpacing = sanitize(input.postSpacing);
  const pieceLength = sanitize(input.tubePieceLength);
  if (!length || !height || !postSpacing || !pieceLength) return emptyRailingResult();

  const factor = 1 + pct(input.wastePercentage);
  const posts = up(length / postSpacing) + 1;
  const postMeters = posts * (height + sanitize(input.postEmbed));
  const balusterSpacing = sanitize(input.balusterSpacing);
  const balusters = input.includeBalusters && balusterSpacing ? up(length / balusterSpacing) : 0;
  const balusterMeters = balusters * Math.max(height - 0.15, 0);
  const railMeters = length * (Math.round(sanitize(input.railRows)) + Math.round(sanitize(input.handrailRuns)));

  const pieces = (meters: number) => up((meters * factor) / pieceLength);
  const postPieces = pieces(postMeters);
  const railPieces = pieces(railMeters);
  const balusterPieces = balusters ? pieces(balusterMeters) : 0;

  const electrodeKg = length * sanitize(input.electrodeKgPerMeter);
  const totalTubeMeters = postMeters + balusterMeters + railMeters;
  const paintArea = input.includePaint ? totalTubeMeters * sanitize(input.surfacePerMeter) : 0;
  const coverage = sanitize(input.paintCoverage);
  const paintGallons = paintArea && coverage ? up((paintArea * Math.max(sanitize(input.paintCoats), 1)) / coverage) : 0;

  const postCost = postPieces * sanitize(prices.postTube);
  const railCost = railPieces * sanitize(prices.railTube);
  const balusterCost = balusterPieces * sanitize(prices.balusterTube);
  const electrodeCost = electrodeKg * sanitize(prices.electrodeKg);
  const paintCost = paintGallons * sanitize(prices.paintGallon);
  const materialsCost = postCost + railCost + balusterCost + electrodeCost + paintCost;
  const laborCost = length * sanitize(prices.laborMeter);

  return {
    posts, balusters, postMeters, balusterMeters, railMeters, postPieces, railPieces, balusterPieces,
    electrodeKg, paintGallons, postCost, railCost, balusterCost, electrodeCost, paintCost, materialsCost,
    laborCost, totalCost: materialsCost + laborCost,
  };
}

// ---------------------------------------------------------------------------
// Aceras y pisos exteriores de concreto
// ---------------------------------------------------------------------------

export type WalkwayInput = {
  length: number;
  width: number;
  extraArea: number;
  thickness: number;
  baseThickness: number;
  /** Relación material suelto / compactado de la base. */
  baseLooseFactor: number;
  baseWastePercentage: number;
  mixCement: number;
  mixSand: number;
  mixGravel: number;
  cementBagWeight: number;
  concreteWastePercentage: number;
  includeMesh: boolean;
  meshSheetArea: number;
  meshLapPercentage: number;
  jointSpacing: number;
  metersPerSealantCartridge: number;
  includeSealer: boolean;
  sealerCoverage: number;
};

export type WalkwayPrices = {
  cementBag: number;
  sandCubicMeter: number;
  gravelCubicMeter: number;
  baseCubicMeter: number;
  meshSheet: number;
  sealantCartridge: number;
  sealerGallon: number;
  laborSquareMeter: number;
};

export type WalkwayResult = {
  area: number;
  volume: number;
  cementBagsToBuy: number;
  sandVolume: number;
  gravelVolume: number;
  baseVolume: number;
  meshSheets: number;
  jointLength: number;
  sealantCartridges: number;
  sealerGallons: number;
  cementCost: number;
  sandCost: number;
  gravelCost: number;
  concreteCost: number;
  baseCost: number;
  meshCost: number;
  sealantCost: number;
  sealerCost: number;
  materialsCost: number;
  laborCost: number;
  totalCost: number;
};

export function emptyWalkwayResult(): WalkwayResult {
  return {
    area: 0, volume: 0, cementBagsToBuy: 0, sandVolume: 0, gravelVolume: 0, baseVolume: 0, meshSheets: 0,
    jointLength: 0, sealantCartridges: 0, sealerGallons: 0, cementCost: 0, sandCost: 0, gravelCost: 0, concreteCost: 0, baseCost: 0, meshCost: 0,
    sealantCost: 0, sealerCost: 0, materialsCost: 0, laborCost: 0, totalCost: 0,
  };
}

export function calculateWalkway(input: WalkwayInput, prices: WalkwayPrices): WalkwayResult {
  const length = sanitize(input.length);
  const width = sanitize(input.width);
  const area = length * width + sanitize(input.extraArea);
  const thickness = sanitize(input.thickness);
  if (!area || !thickness) return emptyWalkwayResult();

  const volume = area * thickness;
  const concrete = calculateConcrete(
    {
      netVolume: volume, wastePercentage: Math.min(sanitize(input.concreteWastePercentage), 100),
      mixCement: input.mixCement, mixSand: input.mixSand, mixGravel: input.mixGravel,
      cementBagWeight: input.cementBagWeight, sandBagVolume: 0, gravelBagVolume: 0,
      sandPriceMode: "cubicMeter", gravelPriceMode: "cubicMeter",
    },
    {
      cementBag: prices.cementBag, sandCubicMeter: prices.sandCubicMeter, sandBag: 0,
      gravelCubicMeter: prices.gravelCubicMeter, gravelBag: 0, laborCubicMeter: 0,
    },
  );

  const baseVolume =
    area * sanitize(input.baseThickness) * (sanitize(input.baseLooseFactor) || 1) * (1 + pct(input.baseWastePercentage));
  const sheetArea = sanitize(input.meshSheetArea);
  const meshSheets = input.includeMesh && sheetArea ? up((area * (1 + pct(input.meshLapPercentage))) / sheetArea) : 0;

  const spacing = sanitize(input.jointSpacing);
  let jointLength = 0;
  if (spacing && length && width) {
    jointLength = Math.max(up(length / spacing) - 1, 0) * width + Math.max(up(width / spacing) - 1, 0) * length;
  }
  const perCartridge = sanitize(input.metersPerSealantCartridge);
  const sealantCartridges = perCartridge ? up(jointLength / perCartridge) : 0;
  const sealerGallons = input.includeSealer && sanitize(input.sealerCoverage) ? up(area / sanitize(input.sealerCoverage)) : 0;

  const cementCost = concrete.cementBagsToBuy * sanitize(prices.cementBag);
  const concreteCost = cementCost + concrete.sandCost + concrete.gravelCost;
  const baseCost = baseVolume * sanitize(prices.baseCubicMeter);
  const meshCost = meshSheets * sanitize(prices.meshSheet);
  const sealantCost = sealantCartridges * sanitize(prices.sealantCartridge);
  const sealerCost = sealerGallons * sanitize(prices.sealerGallon);
  const materialsCost = concreteCost + baseCost + meshCost + sealantCost + sealerCost;
  const laborCost = area * sanitize(prices.laborSquareMeter);

  return {
    area, volume, cementBagsToBuy: concrete.cementBagsToBuy, sandVolume: concrete.sandVolume,
    gravelVolume: concrete.gravelVolume, baseVolume, meshSheets, jointLength, sealantCartridges, sealerGallons,
    cementCost, sandCost: concrete.sandCost, gravelCost: concrete.gravelCost, concreteCost, baseCost, meshCost,
    sealantCost, sealerCost, materialsCost, laborCost, totalCost: materialsCost + laborCost,
  };
}

// ---------------------------------------------------------------------------
// Tragaluces y claraboyas
// ---------------------------------------------------------------------------

export type SkylightInput = {
  units: number;
  width: number;
  length: number;
  panelWastePercentage: number;
  /** Travesaños del marco cada cuántos metros del largo. */
  crossbarSpacing: number;
  profilePieceLength: number;
  profileWastePercentage: number;
  metersPerSealantCartridge: number;
  screwsPerSquareMeter: number;
  screwsPerBox: number;
  flashingPieceLength: number;
};

export type SkylightPrices = {
  panelSquareMeter: number;
  profilePiece: number;
  sealantCartridge: number;
  screwBox: number;
  flashingPiece: number;
  laborUnit: number;
};

export type SkylightResult = {
  totalArea: number;
  panelArea: number;
  profileMeters: number;
  profilePieces: number;
  sealantCartridges: number;
  screwBoxes: number;
  flashingPieces: number;
  panelCost: number;
  profileCost: number;
  sealantCost: number;
  screwCost: number;
  flashingCost: number;
  materialsCost: number;
  laborCost: number;
  totalCost: number;
};

export function emptySkylightResult(): SkylightResult {
  return {
    totalArea: 0, panelArea: 0, profileMeters: 0, profilePieces: 0, sealantCartridges: 0, screwBoxes: 0,
    flashingPieces: 0, panelCost: 0, profileCost: 0, sealantCost: 0, screwCost: 0, flashingCost: 0,
    materialsCost: 0, laborCost: 0, totalCost: 0,
  };
}

export function calculateSkylights(input: SkylightInput, prices: SkylightPrices): SkylightResult {
  const units = Math.round(sanitize(input.units));
  const width = sanitize(input.width);
  const length = sanitize(input.length);
  if (!units || !width || !length) return emptySkylightResult();

  const totalArea = units * width * length;
  const panelArea = totalArea * (1 + pct(input.panelWastePercentage));
  const perimeter = 2 * (width + length);

  const crossSpacing = sanitize(input.crossbarSpacing);
  const crossbars = crossSpacing ? Math.max(up(length / crossSpacing) - 1, 0) : 0;
  const profileMeters = units * (perimeter + crossbars * width);
  const profileLength = sanitize(input.profilePieceLength);
  const profilePieces = profileLength ? up((profileMeters * (1 + pct(input.profileWastePercentage))) / profileLength) : 0;

  const perCartridge = sanitize(input.metersPerSealantCartridge);
  const sealantCartridges = perCartridge ? up((units * perimeter * 2) / perCartridge) : 0;
  const screwBoxes = sanitize(input.screwsPerBox)
    ? up((totalArea * sanitize(input.screwsPerSquareMeter)) / sanitize(input.screwsPerBox))
    : 0;
  const flashingLength = sanitize(input.flashingPieceLength);
  const flashingPieces = flashingLength ? up((units * perimeter) / flashingLength) : 0;

  const panelCost = panelArea * sanitize(prices.panelSquareMeter);
  const profileCost = profilePieces * sanitize(prices.profilePiece);
  const sealantCost = sealantCartridges * sanitize(prices.sealantCartridge);
  const screwCost = screwBoxes * sanitize(prices.screwBox);
  const flashingCost = flashingPieces * sanitize(prices.flashingPiece);
  const materialsCost = panelCost + profileCost + sealantCost + screwCost + flashingCost;
  const laborCost = units * sanitize(prices.laborUnit);

  return {
    totalArea, panelArea, profileMeters, profilePieces, sealantCartridges, screwBoxes, flashingPieces,
    panelCost, profileCost, sealantCost, screwCost, flashingCost, materialsCost, laborCost,
    totalCost: materialsCost + laborCost,
  };
}
