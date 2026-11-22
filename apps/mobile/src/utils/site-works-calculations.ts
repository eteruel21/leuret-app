/**
 * Drenaje pluvial y césped con riego.
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
const up = (x: number) => Math.ceil(x - EPS) || 0;

// ---------------------------------------------------------------------------
// Drenaje pluvial: canal, bajantes, tubería enterrada y cajas de registro
// ---------------------------------------------------------------------------

export type StormDrainageInput = {
  roofArea: number;
  gutterLength: number;
  gutterPieceLength: number;
  hangerSpacing: number;
  /** Tapas, esquinas y uniones del canal, por unidad. */
  gutterAccessories: number;
  downspoutCount: number;
  downspoutHeight: number;
  downspoutPieceLength: number;
  downspoutFittingsPerUnit: number;
  pipeLength: number;
  pipePieceLength: number;
  pipeFittingsPercentage: number;
  trenchWidth: number;
  trenchDepth: number;
  beddingThickness: number;
  inspectionBoxes: number;
  wastePercentage: number;
};

export type StormDrainagePrices = {
  gutterPiece: number;
  hanger: number;
  gutterAccessory: number;
  downspoutPiece: number;
  downspoutFitting: number;
  pipePiece: number;
  box: number;
  lid: number;
  beddingCubicMeter: number;
  laborGutterMeter: number;
  laborPipeMeter: number;
  laborExcavationCubicMeter: number;
};

export type StormDrainageResult = {
  roofAreaPerDownspout: number;
  gutterPieces: number;
  hangers: number;
  gutterAccessories: number;
  downspoutPieces: number;
  downspoutFittings: number;
  pipePieces: number;
  excavationVolume: number;
  beddingVolume: number;
  boxes: number;
  gutterCost: number;
  hangerCost: number;
  gutterAccessoryCost: number;
  downspoutCost: number;
  downspoutFittingCost: number;
  pipeCost: number;
  pipeFittingsCost: number;
  boxCost: number;
  lidCost: number;
  beddingCost: number;
  materialsCost: number;
  laborCost: number;
  totalCost: number;
};

export function emptyStormDrainageResult(): StormDrainageResult {
  return {
    roofAreaPerDownspout: 0, gutterPieces: 0, hangers: 0, gutterAccessories: 0, downspoutPieces: 0,
    downspoutFittings: 0, pipePieces: 0, excavationVolume: 0, beddingVolume: 0, boxes: 0, gutterCost: 0,
    hangerCost: 0, gutterAccessoryCost: 0, downspoutCost: 0, downspoutFittingCost: 0, pipeCost: 0,
    pipeFittingsCost: 0, boxCost: 0, lidCost: 0, beddingCost: 0, materialsCost: 0, laborCost: 0, totalCost: 0,
  };
}

export function calculateStormDrainage(
  input: StormDrainageInput,
  prices: StormDrainagePrices,
): StormDrainageResult {
  const gutterLength = sanitize(input.gutterLength);
  const downspouts = Math.round(sanitize(input.downspoutCount));
  const pipeLength = sanitize(input.pipeLength);
  const boxes = Math.round(sanitize(input.inspectionBoxes));
  if (!gutterLength && !downspouts && !pipeLength && !boxes) return emptyStormDrainageResult();

  const factor = 1 + pct(input.wastePercentage);
  const gutterPieceLength = sanitize(input.gutterPieceLength);
  const gutterPieces = gutterPieceLength ? up((gutterLength * factor) / gutterPieceLength) : 0;
  const hangerSpacing = sanitize(input.hangerSpacing);
  const hangers = gutterLength && hangerSpacing ? up(gutterLength / hangerSpacing) + 1 : 0;
  const gutterAccessories = Math.round(sanitize(input.gutterAccessories));

  const downspoutPieceLength = sanitize(input.downspoutPieceLength);
  const piecesPerDownspout = downspoutPieceLength ? up(sanitize(input.downspoutHeight) / downspoutPieceLength) : 0;
  const downspoutPieces = downspouts * piecesPerDownspout;
  const downspoutFittings = downspouts * Math.round(sanitize(input.downspoutFittingsPerUnit));

  const pipePieceLength = sanitize(input.pipePieceLength);
  const pipePieces = pipePieceLength ? up((pipeLength * factor) / pipePieceLength) : 0;
  const excavationVolume = pipeLength * sanitize(input.trenchWidth) * sanitize(input.trenchDepth);
  const beddingVolume = pipeLength * sanitize(input.trenchWidth) * sanitize(input.beddingThickness);

  const gutterCost = gutterPieces * sanitize(prices.gutterPiece);
  const hangerCost = hangers * sanitize(prices.hanger);
  const gutterAccessoryCost = gutterAccessories * sanitize(prices.gutterAccessory);
  const downspoutCost = downspoutPieces * sanitize(prices.downspoutPiece);
  const downspoutFittingCost = downspoutFittings * sanitize(prices.downspoutFitting);
  const pipeCost = pipePieces * sanitize(prices.pipePiece);
  const pipeFittingsCost = pipeCost * pct(input.pipeFittingsPercentage);
  const boxCost = boxes * sanitize(prices.box);
  const lidCost = boxes * sanitize(prices.lid);
  const beddingCost = beddingVolume * sanitize(prices.beddingCubicMeter);
  const materialsCost =
    gutterCost + hangerCost + gutterAccessoryCost + downspoutCost + downspoutFittingCost + pipeCost +
    pipeFittingsCost + boxCost + lidCost + beddingCost;
  const laborCost =
    (gutterLength + downspouts * sanitize(input.downspoutHeight)) * sanitize(prices.laborGutterMeter) +
    pipeLength * sanitize(prices.laborPipeMeter) +
    excavationVolume * sanitize(prices.laborExcavationCubicMeter);

  return {
    roofAreaPerDownspout: downspouts ? sanitize(input.roofArea) / downspouts : 0,
    gutterPieces, hangers, gutterAccessories, downspoutPieces, downspoutFittings, pipePieces,
    excavationVolume, beddingVolume, boxes, gutterCost, hangerCost, gutterAccessoryCost, downspoutCost,
    downspoutFittingCost, pipeCost, pipeFittingsCost, boxCost, lidCost, beddingCost, materialsCost,
    laborCost, totalCost: materialsCost + laborCost,
  };
}

// ---------------------------------------------------------------------------
// Césped y riego
// ---------------------------------------------------------------------------

export type LawnInput = {
  area: number;
  soilThickness: number;
  soilWastePercentage: number;
  /** "sod" = grama en rollos o tepe por m²; "seed" = semilla por kg. */
  grassMode: "sod" | "seed";
  grassWastePercentage: number;
  seedKgPerSquareMeter: number;
  fertilizerKgPerSquareMeter: number;
  fertilizerBagKg: number;
  includeIrrigation: boolean;
  sprinklerRadius: number;
  /** Fracción del círculo que cubre cada aspersor útilmente (por traslape). */
  sprinklerCoverageFactor: number;
  sprinklersPerZone: number;
  mainPipeLength: number;
  pipePieceLength: number;
  pipeFittingsPercentage: number;
};

export type LawnPrices = {
  sodSquareMeter: number;
  seedKg: number;
  soilCubicMeter: number;
  fertilizerBag: number;
  sprinkler: number;
  valve: number;
  timer: number;
  pipePiece: number;
  laborSquareMeter: number;
  laborSprinkler: number;
};

export type LawnResult = {
  soilVolume: number;
  grassArea: number;
  seedKg: number;
  fertilizerBags: number;
  sprinklers: number;
  zones: number;
  lateralLength: number;
  pipeMeters: number;
  pipePieces: number;
  soilCost: number;
  grassCost: number;
  fertilizerCost: number;
  sprinklerCost: number;
  valveCost: number;
  timerCost: number;
  pipeCost: number;
  pipeFittingsCost: number;
  materialsCost: number;
  laborCost: number;
  totalCost: number;
};

export function emptyLawnResult(): LawnResult {
  return {
    soilVolume: 0, grassArea: 0, seedKg: 0, fertilizerBags: 0, sprinklers: 0, zones: 0, lateralLength: 0,
    pipeMeters: 0, pipePieces: 0, soilCost: 0, grassCost: 0, fertilizerCost: 0, sprinklerCost: 0, valveCost: 0,
    timerCost: 0, pipeCost: 0, pipeFittingsCost: 0, materialsCost: 0, laborCost: 0, totalCost: 0,
  };
}

export function calculateLawn(input: LawnInput, prices: LawnPrices): LawnResult {
  const area = sanitize(input.area);
  if (!area) return emptyLawnResult();

  const soilVolume = area * sanitize(input.soilThickness) * (1 + pct(input.soilWastePercentage));
  const grassFactor = 1 + pct(input.grassWastePercentage);
  const grassArea = input.grassMode === "sod" ? area * grassFactor : 0;
  const seedKg = input.grassMode === "seed" ? area * sanitize(input.seedKgPerSquareMeter) * grassFactor : 0;
  const fertilizerBagKg = sanitize(input.fertilizerBagKg);
  const fertilizerBags = fertilizerBagKg ? up((area * sanitize(input.fertilizerKgPerSquareMeter)) / fertilizerBagKg) : 0;

  let sprinklers = 0;
  let zones = 0;
  let lateralLength = 0;
  let pipeMeters = 0;
  let pipePieces = 0;
  const radius = sanitize(input.sprinklerRadius);
  if (input.includeIrrigation && radius) {
    const coverage = Math.PI * radius * radius * (sanitize(input.sprinklerCoverageFactor) || 0.6);
    sprinklers = Math.max(up(area / coverage), 1);
    const perZone = Math.max(Math.round(sanitize(input.sprinklersPerZone)), 1);
    zones = up(sprinklers / perZone);
    lateralLength = sprinklers * radius;
    pipeMeters = lateralLength + sanitize(input.mainPipeLength);
    const pieceLength = sanitize(input.pipePieceLength);
    pipePieces = pieceLength ? up(pipeMeters / pieceLength) : 0;
  }

  const soilCost = soilVolume * sanitize(prices.soilCubicMeter);
  const grassCost = grassArea * sanitize(prices.sodSquareMeter) + seedKg * sanitize(prices.seedKg);
  const fertilizerCost = fertilizerBags * sanitize(prices.fertilizerBag);
  const sprinklerCost = sprinklers * sanitize(prices.sprinkler);
  const valveCost = zones * sanitize(prices.valve);
  const timerCost = zones ? sanitize(prices.timer) : 0;
  const pipeCost = pipePieces * sanitize(prices.pipePiece);
  const pipeFittingsCost = pipeCost * pct(input.pipeFittingsPercentage);
  const materialsCost =
    soilCost + grassCost + fertilizerCost + sprinklerCost + valveCost + timerCost + pipeCost + pipeFittingsCost;
  const laborCost = area * sanitize(prices.laborSquareMeter) + sprinklers * sanitize(prices.laborSprinkler);

  return {
    soilVolume, grassArea, seedKg, fertilizerBags, sprinklers, zones, lateralLength, pipeMeters, pipePieces,
    soilCost, grassCost, fertilizerCost, sprinklerCost, valveCost, timerCost, pipeCost, pipeFittingsCost,
    materialsCost, laborCost, totalCost: materialsCost + laborCost,
  };
}
