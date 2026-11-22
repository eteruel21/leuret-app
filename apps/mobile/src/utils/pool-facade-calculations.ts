/**
 * Piscina de concreto y pintura de fachada exterior.
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

function mortarFrom(
  volume: number,
  wastePercentage: number,
  mix: { cement: number; sand: number; gravel: number },
  cementBagWeight: number,
  prices: { cementBag: number; sandCubicMeter: number; gravelCubicMeter: number },
) {
  return calculateConcrete(
    {
      netVolume: volume,
      wastePercentage: Math.min(sanitize(wastePercentage), 100),
      mixCement: mix.cement,
      mixSand: mix.sand,
      mixGravel: mix.gravel,
      cementBagWeight,
      sandBagVolume: 0,
      gravelBagVolume: 0,
      sandPriceMode: "cubicMeter",
      gravelPriceMode: "cubicMeter",
    },
    {
      cementBag: prices.cementBag,
      sandCubicMeter: prices.sandCubicMeter,
      sandBag: 0,
      gravelCubicMeter: prices.gravelCubicMeter,
      gravelBag: 0,
      laborCubicMeter: 0,
    },
  );
}

// ---------------------------------------------------------------------------
// Piscina de concreto
// ---------------------------------------------------------------------------

export type PoolInput = {
  /** Medidas interiores del vaso, en m. */
  length: number;
  width: number;
  shallowDepth: number;
  deepDepth: number;
  wallThickness: number;
  floorThickness: number;
  /** Holgura de excavación alrededor del vaso, en m. */
  overdig: number;
  swellFactor: number;
  bedThickness: number;
  bedLooseFactor: number;
  bedWastePercentage: number;
  concreteWastePercentage: number;
  mixCement: number;
  mixSand: number;
  mixGravel: number;
  cementBagWeight: number;
  /** Acero de refuerzo en kg por m³ de concreto y peso de cada varilla comprada. */
  rebarKgPerCubicMeter: number;
  rebarPieceKg: number;
  rebarWastePercentage: number;
  includeTile: boolean;
  tileWastePercentage: number;
  adhesiveKgPerSquareMeter: number;
  adhesiveBagKg: number;
  groutKgPerSquareMeter: number;
  groutBagKg: number;
  includeWaterproofing: boolean;
  waterproofingCoats: number;
  waterproofingCoverage: number;
  skimmers: number;
  returnJets: number;
  floorDrains: number;
  pipeMeters: number;
  pipePieceLength: number;
  pipeFittingsPercentage: number;
  includePump: boolean;
  includeFilter: boolean;
};

export type PoolPrices = {
  cementBag: number;
  sandCubicMeter: number;
  gravelCubicMeter: number;
  rebarPiece: number;
  tileSquareMeter: number;
  adhesiveBag: number;
  groutBag: number;
  waterproofingGallon: number;
  skimmer: number;
  returnJet: number;
  floorDrain: number;
  pipePiece: number;
  pump: number;
  filter: number;
  laborExcavationCubicMeter: number;
  laborShellCubicMeter: number;
  laborTileSquareMeter: number;
  laborEquipment: number;
};

export type PoolResult = {
  averageDepth: number;
  waterVolume: number;
  surfaceArea: number;
  finishArea: number;
  excavationVolume: number;
  haulVolume: number;
  bedVolume: number;
  concreteVolume: number;
  cementBags: number;
  sandVolume: number;
  gravelVolume: number;
  rebarKg: number;
  rebarPieces: number;
  tileArea: number;
  adhesiveBags: number;
  groutBags: number;
  waterproofingGallons: number;
  skimmers: number;
  returnJets: number;
  floorDrains: number;
  pipePieces: number;
  pump: number;
  filter: number;
  cementCost: number;
  sandCost: number;
  gravelCost: number;
  bedCost: number;
  rebarCost: number;
  tileCost: number;
  adhesiveCost: number;
  groutCost: number;
  waterproofingCost: number;
  fittingsCost: number;
  pipeCost: number;
  equipmentCost: number;
  materialsCost: number;
  laborCost: number;
  totalCost: number;
};

export function emptyPoolResult(): PoolResult {
  return {
    averageDepth: 0, waterVolume: 0, surfaceArea: 0, finishArea: 0, excavationVolume: 0, haulVolume: 0,
    bedVolume: 0, concreteVolume: 0, cementBags: 0, sandVolume: 0, gravelVolume: 0, rebarKg: 0, rebarPieces: 0,
    tileArea: 0, adhesiveBags: 0, groutBags: 0, waterproofingGallons: 0, skimmers: 0, returnJets: 0,
    floorDrains: 0, pipePieces: 0, pump: 0, filter: 0, cementCost: 0, sandCost: 0, gravelCost: 0, bedCost: 0,
    rebarCost: 0, tileCost: 0, adhesiveCost: 0, groutCost: 0, waterproofingCost: 0, fittingsCost: 0, pipeCost: 0,
    equipmentCost: 0, materialsCost: 0, laborCost: 0, totalCost: 0,
  };
}

export function calculatePool(input: PoolInput, prices: PoolPrices): PoolResult {
  const length = sanitize(input.length);
  const width = sanitize(input.width);
  const shallow = sanitize(input.shallowDepth);
  const deep = Math.max(sanitize(input.deepDepth), shallow);
  const wall = sanitize(input.wallThickness);
  const floor = sanitize(input.floorThickness);
  if (!length || !width || !deep || !wall || !floor) return emptyPoolResult();

  const averageDepth = (shallow + deep) / 2;
  const surfaceArea = length * width;
  const waterVolume = surfaceArea * averageDepth;

  const outerLength = length + 2 * wall;
  const outerWidth = width + 2 * wall;
  const overdig = sanitize(input.overdig);
  const dugArea = (outerLength + 2 * overdig) * (outerWidth + 2 * overdig);
  const bedThickness = sanitize(input.bedThickness);
  const excavationVolume = dugArea * (deep + floor + bedThickness);
  const haulVolume = excavationVolume * (sanitize(input.swellFactor) || 1);

  const bedVolume =
    outerLength * outerWidth * bedThickness * (sanitize(input.bedLooseFactor) || 1) *
    (1 + pct(input.bedWastePercentage));

  const floorVolume = outerLength * outerWidth * floor;
  const wallsVolume = (outerLength * outerWidth - surfaceArea) * averageDepth;
  const concreteVolume = floorVolume + wallsVolume;

  const concrete = mortarFrom(
    concreteVolume,
    input.concreteWastePercentage,
    { cement: input.mixCement, sand: input.mixSand, gravel: input.mixGravel },
    input.cementBagWeight,
    prices,
  );

  const rebarKg =
    concreteVolume * sanitize(input.rebarKgPerCubicMeter) * (1 + pct(input.rebarWastePercentage));
  const rebarPieceKg = sanitize(input.rebarPieceKg);
  const rebarPieces = rebarPieceKg ? up(rebarKg / rebarPieceKg) : 0;

  const finishArea = surfaceArea + 2 * (length + width) * averageDepth;
  const tileArea = input.includeTile ? finishArea * (1 + pct(input.tileWastePercentage)) : 0;
  const adhesiveBags =
    tileArea && sanitize(input.adhesiveBagKg)
      ? up((finishArea * sanitize(input.adhesiveKgPerSquareMeter)) / sanitize(input.adhesiveBagKg))
      : 0;
  const groutBags =
    tileArea && sanitize(input.groutBagKg)
      ? up((finishArea * sanitize(input.groutKgPerSquareMeter)) / sanitize(input.groutBagKg))
      : 0;

  const waterproofingGallons =
    input.includeWaterproofing && sanitize(input.waterproofingCoverage)
      ? up((finishArea * Math.max(sanitize(input.waterproofingCoats), 1)) / sanitize(input.waterproofingCoverage))
      : 0;

  const skimmers = Math.round(sanitize(input.skimmers));
  const returnJets = Math.round(sanitize(input.returnJets));
  const floorDrains = Math.round(sanitize(input.floorDrains));
  const pipeLength = sanitize(input.pipePieceLength);
  const pipePieces = pipeLength && input.pipeMeters
    ? up((sanitize(input.pipeMeters) * (1 + pct(input.pipeFittingsPercentage))) / pipeLength)
    : 0;
  const pump = input.includePump ? 1 : 0;
  const filter = input.includeFilter ? 1 : 0;

  const bedCost = bedVolume * sanitize(prices.gravelCubicMeter);
  const cementCost = concrete.cementBagsToBuy * sanitize(prices.cementBag);
  const rebarCost = rebarPieces * sanitize(prices.rebarPiece);
  const tileCost = tileArea * sanitize(prices.tileSquareMeter);
  const adhesiveCost = adhesiveBags * sanitize(prices.adhesiveBag);
  const groutCost = groutBags * sanitize(prices.groutBag);
  const waterproofingCost = waterproofingGallons * sanitize(prices.waterproofingGallon);
  const fittingsCost =
    skimmers * sanitize(prices.skimmer) + returnJets * sanitize(prices.returnJet) +
    floorDrains * sanitize(prices.floorDrain);
  const pipeCost = pipePieces * sanitize(prices.pipePiece);
  const equipmentCost = pump * sanitize(prices.pump) + filter * sanitize(prices.filter);

  const materialsCost =
    cementCost + concrete.sandCost + concrete.gravelCost + bedCost + rebarCost + tileCost + adhesiveCost +
    groutCost + waterproofingCost + fittingsCost + pipeCost + equipmentCost;
  const laborCost =
    excavationVolume * sanitize(prices.laborExcavationCubicMeter) +
    concreteVolume * sanitize(prices.laborShellCubicMeter) +
    (input.includeTile ? finishArea * sanitize(prices.laborTileSquareMeter) : 0) +
    (pump || filter ? sanitize(prices.laborEquipment) : 0);

  return {
    averageDepth, waterVolume, surfaceArea, finishArea, excavationVolume, haulVolume, bedVolume, concreteVolume,
    cementBags: concrete.cementBagsToBuy, sandVolume: concrete.sandVolume, gravelVolume: concrete.gravelVolume,
    rebarKg, rebarPieces, tileArea, adhesiveBags, groutBags, waterproofingGallons, skimmers, returnJets,
    floorDrains, pipePieces, pump, filter, cementCost, sandCost: concrete.sandCost, gravelCost: concrete.gravelCost,
    bedCost, rebarCost, tileCost, adhesiveCost, groutCost, waterproofingCost, fittingsCost, pipeCost,
    equipmentCost, materialsCost, laborCost, totalCost: materialsCost + laborCost,
  };
}

// ---------------------------------------------------------------------------
// Pintura de fachada exterior
// ---------------------------------------------------------------------------

export type FacadeInput = {
  wallLength: number;
  wallHeight: number;
  openingsArea: number;
  extraArea: number;
  /** Porcentaje de la superficie que necesita repello de reparación. */
  repairPercentage: number;
  repairThickness: number;
  repairWastePercentage: number;
  mixCement: number;
  mixSand: number;
  cementBagWeight: number;
  crackLength: number;
  metersPerSealantCartridge: number;
  includeSealer: boolean;
  sealerCoverage: number;
  paintCoats: number;
  paintCoverage: number;
  paintWastePercentage: number;
  includeScaffold: boolean;
  scaffoldBayLength: number;
  scaffoldLevelHeight: number;
  scaffoldMonths: number;
};

export type FacadePrices = {
  cementBag: number;
  sandCubicMeter: number;
  sealantCartridge: number;
  sealerGallon: number;
  paintGallon: number;
  scaffoldSetMonth: number;
  laborPaintSquareMeter: number;
  laborRepairSquareMeter: number;
  laborScaffoldSet: number;
};

export type FacadeResult = {
  paintArea: number;
  repairArea: number;
  repairVolume: number;
  cementBags: number;
  sandVolume: number;
  sealantCartridges: number;
  sealerGallons: number;
  paintGallons: number;
  scaffoldSets: number;
  cementCost: number;
  sandCost: number;
  sealantCost: number;
  sealerCost: number;
  paintCost: number;
  scaffoldCost: number;
  materialsCost: number;
  laborCost: number;
  totalCost: number;
};

export function emptyFacadeResult(): FacadeResult {
  return {
    paintArea: 0, repairArea: 0, repairVolume: 0, cementBags: 0, sandVolume: 0, sealantCartridges: 0,
    sealerGallons: 0, paintGallons: 0, scaffoldSets: 0, cementCost: 0, sandCost: 0, sealantCost: 0, sealerCost: 0,
    paintCost: 0, scaffoldCost: 0, materialsCost: 0, laborCost: 0, totalCost: 0,
  };
}

export function calculateFacade(input: FacadeInput, prices: FacadePrices): FacadeResult {
  const length = sanitize(input.wallLength);
  const height = sanitize(input.wallHeight);
  const paintArea = Math.max(length * height - sanitize(input.openingsArea), 0) + sanitize(input.extraArea);
  if (!paintArea) return emptyFacadeResult();

  const repairArea = paintArea * pct(input.repairPercentage);
  const repairVolume = repairArea * sanitize(input.repairThickness);
  const mortar = repairVolume
    ? mortarFrom(
        repairVolume,
        input.repairWastePercentage,
        { cement: input.mixCement, sand: input.mixSand, gravel: 0 },
        input.cementBagWeight,
        { cementBag: prices.cementBag, sandCubicMeter: prices.sandCubicMeter, gravelCubicMeter: 0 },
      )
    : null;
  const cementBags = mortar ? mortar.cementBagsToBuy : 0;
  const sandVolume = mortar ? mortar.sandVolume : 0;

  const perCartridge = sanitize(input.metersPerSealantCartridge);
  const sealantCartridges = perCartridge ? up(sanitize(input.crackLength) / perCartridge) : 0;

  const sealerCoverage = sanitize(input.sealerCoverage);
  const sealerGallons = input.includeSealer && sealerCoverage ? up(paintArea / sealerCoverage) : 0;
  const paintCoverage = sanitize(input.paintCoverage);
  const paintGallons = paintCoverage
    ? up(
        (paintArea * Math.max(sanitize(input.paintCoats), 1) * (1 + pct(input.paintWastePercentage))) /
          paintCoverage,
      )
    : 0;

  let scaffoldSets = 0;
  if (input.includeScaffold && sanitize(input.scaffoldBayLength) && sanitize(input.scaffoldLevelHeight)) {
    scaffoldSets = up(length / sanitize(input.scaffoldBayLength)) * up(height / sanitize(input.scaffoldLevelHeight));
  }
  const months = Math.max(sanitize(input.scaffoldMonths), 1);

  const cementCost = cementBags * sanitize(prices.cementBag);
  const sandCost = mortar ? mortar.sandCost : 0;
  const sealantCost = sealantCartridges * sanitize(prices.sealantCartridge);
  const sealerCost = sealerGallons * sanitize(prices.sealerGallon);
  const paintCost = paintGallons * sanitize(prices.paintGallon);
  const scaffoldCost = scaffoldSets * months * sanitize(prices.scaffoldSetMonth);
  const materialsCost = cementCost + sandCost + sealantCost + sealerCost + paintCost + scaffoldCost;
  const laborCost =
    paintArea * sanitize(prices.laborPaintSquareMeter) +
    repairArea * sanitize(prices.laborRepairSquareMeter) +
    scaffoldSets * sanitize(prices.laborScaffoldSet);

  return {
    paintArea, repairArea, repairVolume, cementBags, sandVolume, sealantCartridges, sealerGallons, paintGallons,
    scaffoldSets, cementCost, sandCost, sealantCost, sealerCost, paintCost, scaffoldCost, materialsCost,
    laborCost, totalCost: materialsCost + laborCost,
  };
}
