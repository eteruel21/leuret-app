/**
 * Muro de bloques reforzado y paredes de gypsum completas.
 * Funciones puras: cantidades a comprar redondeadas hacia arriba y costos.
 */

import { calculateConcrete } from "./calculations";
import { rebarKgPerMeter } from "./construction-calculations";

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
// Muro de bloques reforzado
// ---------------------------------------------------------------------------

export type ReinforcedMasonryInput = {
  wallLength: number;
  wallHeight: number;
  openingsArea: number;
  blockLength: number;
  blockHeight: number;
  blockWastePercentage: number;
  /** Mortero de pega por m² de muro, en m³. */
  layingMortarPerSquareMeter: number;
  mortarCement: number;
  mortarSand: number;
  groutCement: number;
  groutSand: number;
  groutGravel: number;
  cementBagWeight: number;
  /** Separación de las varillas verticales (celdas rellenas). */
  verticalSpacing: number;
  /** Largo extra de cada varilla vertical (anclaje y traslape). */
  anchorLength: number;
  /** Refuerzo horizontal cada cuántas hileras (0 = sin refuerzo horizontal). */
  horizontalEveryCourses: number;
  /** Volumen de relleno por metro de celda llena, en m³/m. */
  cellFillPerMeter: number;
  groutWastePercentage: number;
  barSize: number;
  barPieceLength: number;
  rebarWastePercentage: number;
  includeRebar: boolean;
};

export type ReinforcedMasonryPrices = {
  blockUnit: number;
  cementBag: number;
  sandCubicMeter: number;
  gravelCubicMeter: number;
  bar: number;
  laborSquareMeter: number;
  laborRebarKg: number;
};

export type ReinforcedMasonryResult = {
  netWallArea: number;
  blocksToBuy: number;
  layingMortarVolume: number;
  groutVolume: number;
  filledCells: number;
  barMeters: number;
  steelKg: number;
  barPieces: number;
  cementBagsToBuy: number;
  sandVolume: number;
  gravelVolume: number;
  blockCost: number;
  cementCost: number;
  sandCost: number;
  gravelCost: number;
  barCost: number;
  materialsCost: number;
  laborCost: number;
  totalCost: number;
};

export function emptyReinforcedMasonryResult(): ReinforcedMasonryResult {
  return {
    netWallArea: 0, blocksToBuy: 0, layingMortarVolume: 0, groutVolume: 0, filledCells: 0, barMeters: 0,
    steelKg: 0, barPieces: 0, cementBagsToBuy: 0, sandVolume: 0, gravelVolume: 0, blockCost: 0,
    cementCost: 0, sandCost: 0, gravelCost: 0, barCost: 0, materialsCost: 0, laborCost: 0, totalCost: 0,
  };
}

export function calculateReinforcedMasonry(
  input: ReinforcedMasonryInput,
  prices: ReinforcedMasonryPrices,
): ReinforcedMasonryResult {
  const length = sanitize(input.wallLength);
  const height = sanitize(input.wallHeight);
  const blockLength = sanitize(input.blockLength);
  const blockHeight = sanitize(input.blockHeight);
  if (!length || !height || !blockLength || !blockHeight) return emptyReinforcedMasonryResult();

  const netWallArea = Math.max(length * height - sanitize(input.openingsArea), 0);
  if (!netWallArea) return emptyReinforcedMasonryResult();

  const blocksToBuy = up((netWallArea / (blockLength * blockHeight)) * (1 + pct(input.blockWastePercentage)));
  const layingMortarVolume = netWallArea * sanitize(input.layingMortarPerSquareMeter);

  // Celdas rellenas con varilla vertical.
  const spacing = sanitize(input.verticalSpacing);
  const filledCells = spacing ? Math.floor(length / spacing + EPS) + 1 : 0;
  const groutVolume = filledCells * height * sanitize(input.cellFillPerMeter) * (1 + pct(input.groutWastePercentage));

  const mortar = calculateConcrete(
    {
      netVolume: layingMortarVolume, wastePercentage: 0,
      mixCement: input.mortarCement, mixSand: input.mortarSand, mixGravel: 0,
      cementBagWeight: input.cementBagWeight, sandBagVolume: 0, gravelBagVolume: 0,
      sandPriceMode: "cubicMeter", gravelPriceMode: "cubicMeter",
    },
    { cementBag: prices.cementBag, sandCubicMeter: prices.sandCubicMeter, sandBag: 0, gravelCubicMeter: 0, gravelBag: 0, laborCubicMeter: 0 },
  );
  const grout = calculateConcrete(
    {
      netVolume: groutVolume, wastePercentage: 0,
      mixCement: input.groutCement, mixSand: input.groutSand, mixGravel: input.groutGravel,
      cementBagWeight: input.cementBagWeight, sandBagVolume: 0, gravelBagVolume: 0,
      sandPriceMode: "cubicMeter", gravelPriceMode: "cubicMeter",
    },
    { cementBag: prices.cementBag, sandCubicMeter: prices.sandCubicMeter, sandBag: 0, gravelCubicMeter: prices.gravelCubicMeter, gravelBag: 0, laborCubicMeter: 0 },
  );

  const cementBagsToBuy = up(mortar.cementBags + grout.cementBags);
  const sandVolume = mortar.sandVolume + grout.sandVolume;
  const gravelVolume = grout.gravelVolume;

  let barMeters = 0;
  if (input.includeRebar) {
    barMeters = filledCells * (height + sanitize(input.anchorLength));
    const everyCourses = Math.round(sanitize(input.horizontalEveryCourses));
    if (everyCourses > 0) {
      const rows = Math.floor(height / (everyCourses * blockHeight) + EPS);
      barMeters += rows * length * 1.05;
    }
  }
  const steelKg = barMeters * rebarKgPerMeter(input.barSize);
  const pieceLength = sanitize(input.barPieceLength);
  const barPieces = pieceLength ? up((barMeters * (1 + pct(input.rebarWastePercentage))) / pieceLength) : 0;

  const blockCost = blocksToBuy * sanitize(prices.blockUnit);
  const cementCost = cementBagsToBuy * sanitize(prices.cementBag);
  const sandCost = sandVolume * sanitize(prices.sandCubicMeter);
  const gravelCost = gravelVolume * sanitize(prices.gravelCubicMeter);
  const barCost = barPieces * sanitize(prices.bar);
  const materialsCost = blockCost + cementCost + sandCost + gravelCost + barCost;
  const laborCost = netWallArea * sanitize(prices.laborSquareMeter) + steelKg * sanitize(prices.laborRebarKg);

  return {
    netWallArea, blocksToBuy, layingMortarVolume, groutVolume, filledCells, barMeters, steelKg, barPieces,
    cementBagsToBuy, sandVolume, gravelVolume, blockCost, cementCost, sandCost, gravelCost, barCost,
    materialsCost, laborCost, totalCost: materialsCost + laborCost,
  };
}

// ---------------------------------------------------------------------------
// Paredes de gypsum completas
// ---------------------------------------------------------------------------

export type GypsumWallsInput = {
  wallLength: number;
  wallHeight: number;
  openingsArea: number;
  doorCount: number;
  doorWidth: number;
  /** Caras con lámina: 1 o 2. */
  sides: number;
  /** Capas de lámina por cara: 1 o 2. */
  layers: number;
  boardWidth: number;
  boardHeight: number;
  wastePercentage: number;
  studSpacing: number;
  studPieceLength: number;
  trackPieceLength: number;
  screwsPerBoard: number;
  screwsPerBox: number;
  tapePerSquareMeter: number;
  tapeRollLength: number;
  compoundKgPerSquareMeter: number;
  compoundPackageKg: number;
  includeInsulation: boolean;
  insulationRollArea: number;
  cornerLength: number;
  cornerPieceLength: number;
};

export type GypsumWallsPrices = {
  board: number;
  stud: number;
  track: number;
  screwBox: number;
  tapeRoll: number;
  compoundPackage: number;
  insulationRoll: number;
  cornerPiece: number;
  laborSquareMeter: number;
};

export type GypsumWallsResult = {
  netWallArea: number;
  finishedArea: number;
  boardsToBuy: number;
  studPositions: number;
  studPieces: number;
  trackPieces: number;
  screwBoxes: number;
  tapeRolls: number;
  compoundPackages: number;
  insulationRolls: number;
  cornerPieces: number;
  boardCost: number;
  studCost: number;
  trackCost: number;
  screwCost: number;
  tapeCost: number;
  compoundCost: number;
  insulationCost: number;
  cornerCost: number;
  materialsCost: number;
  laborCost: number;
  totalCost: number;
};

export function emptyGypsumWallsResult(): GypsumWallsResult {
  return {
    netWallArea: 0, finishedArea: 0, boardsToBuy: 0, studPositions: 0, studPieces: 0, trackPieces: 0,
    screwBoxes: 0, tapeRolls: 0, compoundPackages: 0, insulationRolls: 0, cornerPieces: 0, boardCost: 0,
    studCost: 0, trackCost: 0, screwCost: 0, tapeCost: 0, compoundCost: 0, insulationCost: 0, cornerCost: 0,
    materialsCost: 0, laborCost: 0, totalCost: 0,
  };
}

export function calculateGypsumWalls(input: GypsumWallsInput, prices: GypsumWallsPrices): GypsumWallsResult {
  const length = sanitize(input.wallLength);
  const height = sanitize(input.wallHeight);
  const boardArea = sanitize(input.boardWidth) * sanitize(input.boardHeight);
  const spacing = sanitize(input.studSpacing);
  if (!length || !height || !boardArea || !spacing) return emptyGypsumWallsResult();

  const netWallArea = Math.max(length * height - sanitize(input.openingsArea), 0);
  if (!netWallArea) return emptyGypsumWallsResult();

  const sides = Math.min(Math.max(Math.round(sanitize(input.sides)), 1), 2);
  const layers = Math.min(Math.max(Math.round(sanitize(input.layers)), 1), 2);
  const finishedArea = netWallArea * sides;
  const boardsToBuy = up(((finishedArea * layers) / boardArea) * (1 + pct(input.wastePercentage)));

  const doors = Math.round(sanitize(input.doorCount));
  const studPositions = up(length / spacing) + 1 + doors * 2;
  const piecesPerStud = Math.max(up(height / (sanitize(input.studPieceLength) || 1)), 1);
  const studPieces = sanitize(input.studPieceLength) ? studPositions * piecesPerStud : 0;
  const trackMeters = (2 * length + doors * sanitize(input.doorWidth)) * 1.05;
  const trackPieces = sanitize(input.trackPieceLength) ? up(trackMeters / sanitize(input.trackPieceLength)) : 0;

  const screwBoxes = sanitize(input.screwsPerBox)
    ? up((boardsToBuy * sanitize(input.screwsPerBoard)) / sanitize(input.screwsPerBox))
    : 0;
  const tapeRolls = sanitize(input.tapeRollLength)
    ? up((finishedArea * sanitize(input.tapePerSquareMeter)) / sanitize(input.tapeRollLength))
    : 0;
  const compoundPackages = sanitize(input.compoundPackageKg)
    ? up((finishedArea * sanitize(input.compoundKgPerSquareMeter)) / sanitize(input.compoundPackageKg))
    : 0;
  const insulationRolls =
    input.includeInsulation && sanitize(input.insulationRollArea)
      ? up((netWallArea * 1.05) / sanitize(input.insulationRollArea))
      : 0;
  const cornerPieces = sanitize(input.cornerPieceLength) ? up(sanitize(input.cornerLength) / sanitize(input.cornerPieceLength)) : 0;

  const boardCost = boardsToBuy * sanitize(prices.board);
  const studCost = studPieces * sanitize(prices.stud);
  const trackCost = trackPieces * sanitize(prices.track);
  const screwCost = screwBoxes * sanitize(prices.screwBox);
  const tapeCost = tapeRolls * sanitize(prices.tapeRoll);
  const compoundCost = compoundPackages * sanitize(prices.compoundPackage);
  const insulationCost = insulationRolls * sanitize(prices.insulationRoll);
  const cornerCost = cornerPieces * sanitize(prices.cornerPiece);
  const materialsCost = boardCost + studCost + trackCost + screwCost + tapeCost + compoundCost + insulationCost + cornerCost;
  const laborCost = finishedArea * layers * sanitize(prices.laborSquareMeter);

  return {
    netWallArea, finishedArea, boardsToBuy, studPositions, studPieces, trackPieces, screwBoxes, tapeRolls,
    compoundPackages, insulationRolls, cornerPieces, boardCost, studCost, trackCost, screwCost, tapeCost,
    compoundCost, insulationCost, cornerCost, materialsCost, laborCost, totalCost: materialsCost + laborCost,
  };
}
