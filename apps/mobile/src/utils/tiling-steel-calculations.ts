/**
 * Enchape de paredes y estructura metálica.
 * Funciones puras: cantidades a comprar redondeadas hacia arriba y costos.
 */

function sanitize(value: number): number {
  if (!Number.isFinite(value) || value < 0) return 0;
  return value;
}

function pct(value: number): number {
  return Math.min(sanitize(value), 100) / 100;
}

const EPS = 1e-9;

// ---------------------------------------------------------------------------
// Enchape de paredes
// ---------------------------------------------------------------------------

export type WallTilingInput = {
  wallLength: number;
  height: number;
  extraArea: number;
  openingsArea: number;
  /** Área que trae cada caja de azulejo; con 0 se compra por metro cuadrado. */
  boxArea: number;
  wastePercentage: number;
  adhesiveKgPerSquareMeter: number;
  adhesiveBagKg: number;
  groutKgPerSquareMeter: number;
  groutBagKg: number;
  spacersPerSquareMeter: number;
  spacersPerBag: number;
  trimLength: number;
  trimPieceLength: number;
};

export type WallTilingPrices = {
  tileSquareMeter: number;
  adhesiveBag: number;
  groutBag: number;
  spacerBag: number;
  trimPiece: number;
  laborSquareMeter: number;
};

export type WallTilingResult = {
  netArea: number;
  buyArea: number;
  boxes: number;
  adhesiveBags: number;
  groutBags: number;
  spacerBags: number;
  trimPieces: number;
  tileCost: number;
  adhesiveCost: number;
  groutCost: number;
  spacerCost: number;
  trimCost: number;
  materialsCost: number;
  laborCost: number;
  totalCost: number;
};

export function emptyWallTilingResult(): WallTilingResult {
  return {
    netArea: 0, buyArea: 0, boxes: 0, adhesiveBags: 0, groutBags: 0, spacerBags: 0, trimPieces: 0,
    tileCost: 0, adhesiveCost: 0, groutCost: 0, spacerCost: 0, trimCost: 0, materialsCost: 0,
    laborCost: 0, totalCost: 0,
  };
}

export function calculateWallTiling(input: WallTilingInput, prices: WallTilingPrices): WallTilingResult {
  const gross = sanitize(input.wallLength) * sanitize(input.height) + sanitize(input.extraArea);
  const netArea = Math.max(gross - sanitize(input.openingsArea), 0);
  if (!netArea) return emptyWallTilingResult();

  const withWaste = netArea * (1 + pct(input.wastePercentage));
  const boxArea = sanitize(input.boxArea);
  const boxes = boxArea ? Math.ceil(withWaste / boxArea - EPS) : 0;
  const buyArea = boxArea ? boxes * boxArea : withWaste;

  const adhesiveBagKg = sanitize(input.adhesiveBagKg);
  const adhesiveBags = adhesiveBagKg ? Math.ceil((netArea * sanitize(input.adhesiveKgPerSquareMeter)) / adhesiveBagKg - EPS) : 0;
  const groutBagKg = sanitize(input.groutBagKg);
  const groutBags = groutBagKg ? Math.ceil((netArea * sanitize(input.groutKgPerSquareMeter)) / groutBagKg - EPS) : 0;
  const spacersPerBag = sanitize(input.spacersPerBag);
  const spacerBags = spacersPerBag ? Math.ceil((netArea * sanitize(input.spacersPerSquareMeter)) / spacersPerBag - EPS) : 0;
  const trimPieceLength = sanitize(input.trimPieceLength);
  const trimPieces = trimPieceLength ? Math.ceil(sanitize(input.trimLength) / trimPieceLength - EPS) : 0;

  const tileCost = buyArea * sanitize(prices.tileSquareMeter);
  const adhesiveCost = adhesiveBags * sanitize(prices.adhesiveBag);
  const groutCost = groutBags * sanitize(prices.groutBag);
  const spacerCost = spacerBags * sanitize(prices.spacerBag);
  const trimCost = trimPieces * sanitize(prices.trimPiece);
  const materialsCost = tileCost + adhesiveCost + groutCost + spacerCost + trimCost;
  const laborCost = netArea * sanitize(prices.laborSquareMeter);

  return {
    netArea, buyArea, boxes, adhesiveBags, groutBags, spacerBags, trimPieces, tileCost, adhesiveCost,
    groutCost, spacerCost, trimCost, materialsCost, laborCost, totalCost: materialsCost + laborCost,
  };
}

// ---------------------------------------------------------------------------
// Estructura metálica
// ---------------------------------------------------------------------------

export type SteelFrameInput = {
  columnCount: number;
  columnHeight: number;
  columnKgPerMeter: number;
  beamLength: number;
  beamKgPerMeter: number;
  purlinLength: number;
  purlinKgPerMeter: number;
  memberPieceLength: number;
  wastePercentage: number;
  basePlates: number;
  /** Kilos de electrodo por kilo de acero. */
  electrodeKgPerSteelKg: number;
  includePaint: boolean;
  surfaceSquareMetersPerKg: number;
  paintCoats: number;
  paintCoverage: number;
};

export type SteelFramePrices = {
  columnPiece: number;
  beamPiece: number;
  purlinPiece: number;
  plate: number;
  electrodeKg: number;
  paintGallon: number;
  laborKg: number;
};

export type SteelFrameResult = {
  columnLength: number;
  steelKg: number;
  columnPieces: number;
  beamPieces: number;
  purlinPieces: number;
  basePlates: number;
  electrodeKg: number;
  paintArea: number;
  paintGallons: number;
  columnCost: number;
  beamCost: number;
  purlinCost: number;
  plateCost: number;
  electrodeCost: number;
  paintCost: number;
  materialsCost: number;
  laborCost: number;
  totalCost: number;
};

export function emptySteelFrameResult(): SteelFrameResult {
  return {
    columnLength: 0, steelKg: 0, columnPieces: 0, beamPieces: 0, purlinPieces: 0, basePlates: 0,
    electrodeKg: 0, paintArea: 0, paintGallons: 0, columnCost: 0, beamCost: 0, purlinCost: 0,
    plateCost: 0, electrodeCost: 0, paintCost: 0, materialsCost: 0, laborCost: 0, totalCost: 0,
  };
}

export function calculateSteelFrame(input: SteelFrameInput, prices: SteelFramePrices): SteelFrameResult {
  const columnLength = Math.round(sanitize(input.columnCount)) * sanitize(input.columnHeight);
  const beamLength = sanitize(input.beamLength);
  const purlinLength = sanitize(input.purlinLength);
  const steelKg =
    columnLength * sanitize(input.columnKgPerMeter) +
    beamLength * sanitize(input.beamKgPerMeter) +
    purlinLength * sanitize(input.purlinKgPerMeter);
  if (!steelKg) return emptySteelFrameResult();

  const factor = 1 + pct(input.wastePercentage);
  const pieceLength = sanitize(input.memberPieceLength);
  const pieces = (length: number) => (pieceLength ? Math.ceil((length * factor) / pieceLength - EPS) : 0);
  const columnPieces = pieces(columnLength);
  const beamPieces = pieces(beamLength);
  const purlinPieces = pieces(purlinLength);
  const basePlates = Math.round(sanitize(input.basePlates));

  const electrodeKg = steelKg * sanitize(input.electrodeKgPerSteelKg);
  const paintArea = input.includePaint ? steelKg * sanitize(input.surfaceSquareMetersPerKg) : 0;
  const coverage = sanitize(input.paintCoverage);
  const paintGallons = paintArea && coverage ? Math.ceil((paintArea * Math.max(sanitize(input.paintCoats), 1)) / coverage - EPS) : 0;

  const columnCost = columnPieces * sanitize(prices.columnPiece);
  const beamCost = beamPieces * sanitize(prices.beamPiece);
  const purlinCost = purlinPieces * sanitize(prices.purlinPiece);
  const plateCost = basePlates * sanitize(prices.plate);
  const electrodeCost = electrodeKg * sanitize(prices.electrodeKg);
  const paintCost = paintGallons * sanitize(prices.paintGallon);
  const materialsCost = columnCost + beamCost + purlinCost + plateCost + electrodeCost + paintCost;
  const laborCost = steelKg * sanitize(prices.laborKg);

  return {
    columnLength, steelKg, columnPieces, beamPieces, purlinPieces, basePlates, electrodeKg, paintArea,
    paintGallons, columnCost, beamCost, purlinCost, plateCost, electrodeCost, paintCost, materialsCost,
    laborCost, totalCost: materialsCost + laborCost,
  };
}
