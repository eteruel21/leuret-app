/**
 * Obras de concreto armado: escalera, muro de retención y cisterna.
 *
 * Cada obra calcula su volumen y su área de encofrado por geometría y delega
 * concreto, acero y formaleta en el mismo cálculo.
 */

import { calculateConcrete, type ConcreteResult } from "./calculations";
import { rebarKgPerMeter } from "./construction-calculations";
import { calculateFormwork, emptyFormworkResult, type FormworkResult } from "./structure-calculations";

function sanitize(value: number): number {
  if (!Number.isFinite(value) || value < 0) return 0;
  return value;
}

function pct(value: number): number {
  return Math.min(sanitize(value), 100) / 100;
}

const EPS = 1e-9;

// ---------------------------------------------------------------------------
// Base común: concreto + acero por cuantía + encofrado
// ---------------------------------------------------------------------------

export type ReinforcedParams = {
  /** Kilos de acero por m³ de concreto. */
  steelKgM3: number;
  mixCement: number;
  mixSand: number;
  mixGravel: number;
  cementBagWeight: number;
  concreteWastePercentage: number;
  barSize: number;
  barPieceLength: number;
  rebarWastePercentage: number;
  tieWireKgPer100Kg: number;
  includeFormwork: boolean;
  formworkUses: number;
  sheetWidth: number;
  sheetLength: number;
  lumberPiecesPerSquareMeter: number;
  nailsKgPerSquareMeter: number;
  formworkWastePercentage: number;
};

export type ReinforcedPrices = {
  cementBag: number;
  sandCubicMeter: number;
  gravelCubicMeter: number;
  bar: number;
  tieWireKg: number;
  sheet: number;
  lumberPiece: number;
  nailKg: number;
  laborConcreteCubicMeter: number;
  laborRebarKg: number;
  laborFormworkSquareMeter: number;
};

export type ReinforcedWork = {
  volume: number;
  concrete: ConcreteResult;
  steelKg: number;
  barPieces: number;
  tieWireKg: number;
  formwork: FormworkResult;
  barCost: number;
  tieWireCost: number;
  rebarLaborCost: number;
  materialsCost: number;
  laborCost: number;
  totalCost: number;
};

export function reinforcedWork(
  volume: number,
  formworkArea: number,
  params: ReinforcedParams,
  prices: ReinforcedPrices,
): ReinforcedWork | null {
  const net = sanitize(volume);
  if (!net) return null;

  const concrete = calculateConcrete(
    {
      netVolume: net,
      wastePercentage: Math.min(sanitize(params.concreteWastePercentage), 100),
      mixCement: params.mixCement,
      mixSand: params.mixSand,
      mixGravel: params.mixGravel,
      cementBagWeight: params.cementBagWeight,
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
      laborCubicMeter: prices.laborConcreteCubicMeter,
    },
  );

  const steelKg = net * sanitize(params.steelKgM3);
  const kgPerBar = rebarKgPerMeter(params.barSize) * (sanitize(params.barPieceLength) || 9.14);
  const barPieces = kgPerBar ? Math.ceil((steelKg * (1 + pct(params.rebarWastePercentage))) / kgPerBar - EPS) : 0;
  const tieWireKg = (steelKg * sanitize(params.tieWireKgPer100Kg)) / 100;

  const formwork = params.includeFormwork
    ? calculateFormwork(
        {
          directArea: sanitize(formworkArea),
          columnCount: 0, columnWidthCm: 0, columnDepthCm: 0, columnHeight: 0,
          beamLength: 0, beamWidthCm: 0, beamHeightCm: 0, slabArea: 0, edgeLength: 0, edgeHeight: 0,
          uses: params.formworkUses,
          sheetWidth: params.sheetWidth,
          sheetLength: params.sheetLength,
          lumberPiecesPerSquareMeter: params.lumberPiecesPerSquareMeter,
          nailsKgPerSquareMeter: params.nailsKgPerSquareMeter,
          wastePercentage: params.formworkWastePercentage,
        },
        {
          sheet: prices.sheet,
          lumberPiece: prices.lumberPiece,
          nailKg: prices.nailKg,
          laborSquareMeter: prices.laborFormworkSquareMeter,
        },
      )
    : emptyFormworkResult();

  const barCost = barPieces * sanitize(prices.bar);
  const tieWireCost = tieWireKg * sanitize(prices.tieWireKg);
  const rebarLaborCost = steelKg * sanitize(prices.laborRebarKg);
  const materialsCost = concrete.materialsCost + barCost + tieWireCost + formwork.materialsCost;
  const laborCost = concrete.laborCost + rebarLaborCost + formwork.laborCost;

  return {
    volume: net, concrete, steelKg, barPieces, tieWireKg, formwork, barCost, tieWireCost,
    rebarLaborCost, materialsCost, laborCost, totalCost: materialsCost + laborCost,
  };
}

// ---------------------------------------------------------------------------
// Escalera de concreto
// ---------------------------------------------------------------------------

export type StairsInput = ReinforcedParams & {
  totalRise: number;
  stepRise: number;
  tread: number;
  width: number;
  /** Espesor de la losa inclinada, medido en vertical. */
  waist: number;
  landingArea: number;
};

export type StairsResult = ReinforcedWork & {
  steps: number;
  actualRise: number;
  runLength: number;
  slopeLength: number;
  formworkArea: number;
};

export function calculateStairs(input: StairsInput, prices: ReinforcedPrices): StairsResult | null {
  const rise = sanitize(input.totalRise);
  const stepRise = sanitize(input.stepRise);
  const width = sanitize(input.width);
  if (!rise || !stepRise || !width) return null;

  const steps = Math.max(Math.ceil(rise / stepRise - EPS), 1);
  const actualRise = rise / steps;
  const tread = sanitize(input.tread);
  const runLength = (steps - 1) * tread;
  const slopeLength = Math.hypot(rise, runLength);
  const waist = sanitize(input.waist);
  const landing = sanitize(input.landingArea);

  const stepWedge = steps * 0.5 * actualRise * tread;
  const volume = slopeLength * width * waist + stepWedge * width + landing * waist;
  const formworkArea =
    slopeLength * width + 2 * (slopeLength * waist + stepWedge) + steps * actualRise * width + landing;

  const work = reinforcedWork(volume, formworkArea, input, prices);
  if (!work) return null;
  return { ...work, steps, actualRise, runLength, slopeLength, formworkArea };
}

// ---------------------------------------------------------------------------
// Muro de retención
// ---------------------------------------------------------------------------

export type RetainingWallInput = ReinforcedParams & {
  length: number;
  height: number;
  stemThickness: number;
  footingWidth: number;
  footingThickness: number;
  includeDrain: boolean;
  weepSpacing: number;
  weepRowSpacing: number;
  weepPipePieceLength: number;
  drainThickness: number;
};

export type RetainingWallPrices = ReinforcedPrices & {
  weepPipePiece: number;
  drainGravelCubicMeter: number;
};

export type RetainingWallResult = ReinforcedWork & {
  weepHoles: number;
  weepPipePieces: number;
  drainVolume: number;
  formworkArea: number;
  weepCost: number;
  drainCost: number;
};

export function calculateRetainingWall(
  input: RetainingWallInput,
  prices: RetainingWallPrices,
): RetainingWallResult | null {
  const length = sanitize(input.length);
  const height = sanitize(input.height);
  if (!length || !height) return null;

  const stem = sanitize(input.stemThickness);
  const footingWidth = sanitize(input.footingWidth);
  const footingThickness = sanitize(input.footingThickness);

  const volume = length * (height * stem + footingWidth * footingThickness);
  // Muro por las dos caras y extremos; zapata por sus lados.
  const formworkArea =
    2 * length * height + 2 * height * stem + 2 * length * footingThickness + 2 * footingWidth * footingThickness;

  const work = reinforcedWork(volume, formworkArea, input, prices);
  if (!work) return null;

  let weepHoles = 0;
  let weepPipePieces = 0;
  let drainVolume = 0;
  if (input.includeDrain) {
    const spacing = sanitize(input.weepSpacing);
    const rowSpacing = sanitize(input.weepRowSpacing);
    const perRow = spacing ? Math.ceil(length / spacing - EPS) : 0;
    const rows = rowSpacing ? Math.ceil(height / rowSpacing - EPS) : 0;
    weepHoles = perRow * rows;
    const pieceLength = sanitize(input.weepPipePieceLength);
    weepPipePieces = pieceLength ? Math.ceil((weepHoles * (stem + 0.1)) / pieceLength - EPS) : 0;
    drainVolume = length * height * sanitize(input.drainThickness);
  }
  const weepCost = weepPipePieces * sanitize(prices.weepPipePiece);
  const drainCost = drainVolume * sanitize(prices.drainGravelCubicMeter);
  const materialsCost = work.materialsCost + weepCost + drainCost;

  return {
    ...work, weepHoles, weepPipePieces, drainVolume, formworkArea, weepCost, drainCost,
    materialsCost, totalCost: materialsCost + work.laborCost,
  };
}

// ---------------------------------------------------------------------------
// Cisterna o tanque de concreto
// ---------------------------------------------------------------------------

export type TankInput = ReinforcedParams & {
  innerLength: number;
  innerWidth: number;
  innerDepth: number;
  /** Altura sin agua bajo la tapa. */
  freeboard: number;
  wallThickness: number;
  floorThickness: number;
  includeLid: boolean;
  lidThickness: number;
  /** Kilos de aditivo impermeabilizante por m³ de concreto. */
  additiveKgPerCubicMeter: number;
};

export type TankPrices = ReinforcedPrices & {
  additiveKg: number;
  laborWaterproofSquareMeter: number;
};

export type TankResult = ReinforcedWork & {
  capacityLiters: number;
  outerLength: number;
  outerWidth: number;
  innerArea: number;
  excavationVolume: number;
  additiveKg: number;
  formworkArea: number;
  additiveCost: number;
  waterproofLaborCost: number;
};

export function calculateTank(input: TankInput, prices: TankPrices): TankResult | null {
  const length = sanitize(input.innerLength);
  const width = sanitize(input.innerWidth);
  const depth = sanitize(input.innerDepth);
  if (!length || !width || !depth) return null;

  const wall = sanitize(input.wallThickness);
  const floor = sanitize(input.floorThickness);
  const lid = input.includeLid ? sanitize(input.lidThickness) : 0;
  const outerLength = length + 2 * wall;
  const outerWidth = width + 2 * wall;

  const wallsVolume = (outerLength * outerWidth - length * width) * depth;
  const floorVolume = outerLength * outerWidth * floor;
  const lidVolume = outerLength * outerWidth * lid;
  const volume = wallsVolume + floorVolume + lidVolume;

  const waterDepth = Math.max(depth - sanitize(input.freeboard), 0);
  const capacityLiters = length * width * waterDepth * 1000;
  const innerArea = 2 * (length + width) * depth + length * width;

  // Caras interiores y exteriores de las paredes, más el fondo de la tapa.
  const formworkArea =
    2 * (length + width) * depth + 2 * (outerLength + outerWidth) * depth + (lid ? outerLength * outerWidth : 0);

  const work = reinforcedWork(volume, formworkArea, input, prices);
  if (!work) return null;

  const additiveKg = volume * sanitize(input.additiveKgPerCubicMeter);
  const additiveCost = additiveKg * sanitize(prices.additiveKg);
  const waterproofLaborCost = innerArea * sanitize(prices.laborWaterproofSquareMeter);
  const materialsCost = work.materialsCost + additiveCost;
  const laborCost = work.laborCost + waterproofLaborCost;
  // Excavación de referencia: caja exterior con 0.30 m de holgura por lado.
  const excavationVolume = (outerLength + 0.6) * (outerWidth + 0.6) * (depth + floor + lid + 0.3);

  return {
    ...work, capacityLiters, outerLength, outerWidth, innerArea, excavationVolume, additiveKg,
    formworkArea, additiveCost, waterproofLaborCost, materialsCost, laborCost,
    totalCost: materialsCost + laborCost,
  };
}
