/**
 * Excavación y relleno, encofrado y estructura (zapatas, columnas, vigas y losa).
 *
 * Funciones puras: reciben medidas y precios y devuelven cantidades a comprar
 * (redondeadas hacia arriba) y costos.
 */

import { calculateConcrete, type ConcreteResult } from "./calculations";
import { rebarKgPerMeter } from "./construction-calculations";

function sanitize(value: number): number {
  if (!Number.isFinite(value) || value < 0) return 0;
  return value;
}

function whole(value: number): number {
  return Math.round(sanitize(value));
}

function pct(value: number, max = 100): number {
  return Math.min(sanitize(value), max) / 100;
}

// ---------------------------------------------------------------------------
// Excavación y relleno
// ---------------------------------------------------------------------------

export type EarthworkInput = {
  length: number;
  width: number;
  depth: number;
  /** Volumen que ocupa la estructura enterrada (zapatas, cisternas…): no se rellena. */
  structureVolume: number;
  /** Aumento de volumen del material suelto respecto al del terreno. */
  swellPercentage: number;
  /** Material suelto extra que hace falta para obtener 1 m³ compactado. */
  compactionPercentage: number;
  /** Parte del material excavado que sirve para rellenar. */
  reusePercentage: number;
  /** Capacidad del volquete, en m³ de material suelto. */
  truckCapacity: number;
  includeBackfill: boolean;
};

export type EarthworkPrices = {
  excavationCubicMeter: number;
  backfillCubicMeter: number;
  haulTrip: number;
  importedFillCubicMeter: number;
};

export type EarthworkResult = {
  bankVolume: number;
  looseVolume: number;
  backfillCompacted: number;
  backfillLoose: number;
  reusedLoose: number;
  importedLoose: number;
  haulAwayLoose: number;
  tripsOut: number;
  tripsIn: number;
  excavationCost: number;
  backfillCost: number;
  haulCost: number;
  importedCost: number;
  materialsCost: number;
  laborCost: number;
  totalCost: number;
};

export function emptyEarthworkResult(): EarthworkResult {
  return {
    bankVolume: 0, looseVolume: 0, backfillCompacted: 0, backfillLoose: 0, reusedLoose: 0,
    importedLoose: 0, haulAwayLoose: 0, tripsOut: 0, tripsIn: 0, excavationCost: 0,
    backfillCost: 0, haulCost: 0, importedCost: 0, materialsCost: 0, laborCost: 0, totalCost: 0,
  };
}

export function calculateEarthwork(input: EarthworkInput, prices: EarthworkPrices): EarthworkResult {
  const bankVolume = sanitize(input.length) * sanitize(input.width) * sanitize(input.depth);
  if (!bankVolume) return emptyEarthworkResult();

  const looseVolume = bankVolume * (1 + pct(input.swellPercentage, 200));
  const backfillCompacted = input.includeBackfill
    ? Math.max(bankVolume - sanitize(input.structureVolume), 0)
    : 0;
  const backfillLoose = backfillCompacted * (1 + pct(input.compactionPercentage, 200));
  const reusableLoose = looseVolume * pct(input.reusePercentage);
  const reusedLoose = Math.min(reusableLoose, backfillLoose);
  const importedLoose = backfillLoose - reusedLoose;
  const haulAwayLoose = looseVolume - reusedLoose;

  const capacity = sanitize(input.truckCapacity);
  const tripsOut = capacity ? Math.ceil(haulAwayLoose / capacity) : 0;
  const tripsIn = capacity ? Math.ceil(importedLoose / capacity) : 0;

  const excavationCost = bankVolume * sanitize(prices.excavationCubicMeter);
  const backfillCost = backfillCompacted * sanitize(prices.backfillCubicMeter);
  const haulCost = (tripsOut + tripsIn) * sanitize(prices.haulTrip);
  const importedCost = importedLoose * sanitize(prices.importedFillCubicMeter);
  const laborCost = excavationCost + backfillCost + haulCost;

  return {
    bankVolume, looseVolume, backfillCompacted, backfillLoose, reusedLoose, importedLoose,
    haulAwayLoose, tripsOut, tripsIn, excavationCost, backfillCost, haulCost, importedCost,
    materialsCost: importedCost, laborCost, totalCost: importedCost + laborCost,
  };
}

// ---------------------------------------------------------------------------
// Encofrado (formaletas)
// ---------------------------------------------------------------------------

export type FormworkInput = {
  directArea: number;
  columnCount: number;
  columnWidthCm: number;
  columnDepthCm: number;
  columnHeight: number;
  beamLength: number;
  beamWidthCm: number;
  beamHeightCm: number;
  slabArea: number;
  edgeLength: number;
  edgeHeight: number;
  /** Veces que se reutiliza la formaleta. */
  uses: number;
  sheetWidth: number;
  sheetLength: number;
  lumberPiecesPerSquareMeter: number;
  nailsKgPerSquareMeter: number;
  wastePercentage: number;
};

export type FormworkPrices = {
  sheet: number;
  lumberPiece: number;
  nailKg: number;
  laborSquareMeter: number;
};

export type FormworkResult = {
  columnsArea: number;
  beamsArea: number;
  slabArea: number;
  edgesArea: number;
  directArea: number;
  totalArea: number;
  sheets: number;
  lumberPieces: number;
  nailsKg: number;
  sheetCost: number;
  lumberCost: number;
  nailCost: number;
  materialsCost: number;
  laborCost: number;
  totalCost: number;
};

export function emptyFormworkResult(): FormworkResult {
  return {
    columnsArea: 0, beamsArea: 0, slabArea: 0, edgesArea: 0, directArea: 0, totalArea: 0,
    sheets: 0, lumberPieces: 0, nailsKg: 0, sheetCost: 0, lumberCost: 0, nailCost: 0,
    materialsCost: 0, laborCost: 0, totalCost: 0,
  };
}

export function calculateFormwork(input: FormworkInput, prices: FormworkPrices): FormworkResult {
  const columnsArea =
    whole(input.columnCount) *
    ((2 * (sanitize(input.columnWidthCm) + sanitize(input.columnDepthCm))) / 100) *
    sanitize(input.columnHeight);
  // Viga: fondo + dos costados.
  const beamsArea =
    sanitize(input.beamLength) *
    ((sanitize(input.beamWidthCm) + 2 * sanitize(input.beamHeightCm)) / 100);
  const slabArea = sanitize(input.slabArea);
  const edgesArea = sanitize(input.edgeLength) * sanitize(input.edgeHeight);
  const directArea = sanitize(input.directArea);
  const totalArea = columnsArea + beamsArea + slabArea + edgesArea + directArea;
  const sheetArea = sanitize(input.sheetWidth) * sanitize(input.sheetLength);
  if (!totalArea || !sheetArea) return emptyFormworkResult();

  const uses = Math.max(whole(input.uses), 1);
  const factor = 1 + pct(input.wastePercentage);
  // La formaleta se arma una vez y se reutiliza; los clavos se gastan en cada uso.
  const setArea = totalArea / uses;
  const sheets = Math.ceil((setArea * factor) / sheetArea);
  const lumberPieces = Math.ceil(setArea * sanitize(input.lumberPiecesPerSquareMeter) * factor);
  const nailsKg = totalArea * sanitize(input.nailsKgPerSquareMeter);

  const sheetCost = sheets * sanitize(prices.sheet);
  const lumberCost = lumberPieces * sanitize(prices.lumberPiece);
  const nailCost = nailsKg * sanitize(prices.nailKg);
  const materialsCost = sheetCost + lumberCost + nailCost;
  const laborCost = totalArea * sanitize(prices.laborSquareMeter);

  return {
    columnsArea, beamsArea, slabArea, edgesArea, directArea, totalArea, sheets, lumberPieces,
    nailsKg, sheetCost, lumberCost, nailCost, materialsCost, laborCost,
    totalCost: materialsCost + laborCost,
  };
}

// ---------------------------------------------------------------------------
// Estructura: concreto + acero + encofrado por cuantía
// ---------------------------------------------------------------------------

export type StructureInput = {
  footingCount: number;
  footingLength: number;
  footingWidth: number;
  footingHeight: number;
  columnCount: number;
  columnWidthCm: number;
  columnDepthCm: number;
  columnHeight: number;
  beamLength: number;
  beamWidthCm: number;
  beamHeightCm: number;
  slabArea: number;
  slabThickness: number;
  /** Kilos de acero por m³ de concreto, de cada elemento (cuantía de referencia). */
  footingRebarKgM3: number;
  columnRebarKgM3: number;
  beamRebarKgM3: number;
  slabRebarKgM3: number;
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

export type StructurePrices = {
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

export type StructureResult = {
  footingsVolume: number;
  columnsVolume: number;
  beamsVolume: number;
  slabVolume: number;
  concreteVolume: number;
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

export function calculateStructure(input: StructureInput, prices: StructurePrices): StructureResult | null {
  const footingsVolume =
    whole(input.footingCount) *
    sanitize(input.footingLength) * sanitize(input.footingWidth) * sanitize(input.footingHeight);
  const columnsVolume =
    whole(input.columnCount) *
    (sanitize(input.columnWidthCm) / 100) * (sanitize(input.columnDepthCm) / 100) *
    sanitize(input.columnHeight);
  const beamsVolume =
    sanitize(input.beamLength) *
    (sanitize(input.beamWidthCm) / 100) * (sanitize(input.beamHeightCm) / 100);
  const slabVolume = sanitize(input.slabArea) * sanitize(input.slabThickness);
  const concreteVolume = footingsVolume + columnsVolume + beamsVolume + slabVolume;
  if (!concreteVolume) return null;

  const concrete = calculateConcrete(
    {
      netVolume: concreteVolume,
      wastePercentage: Math.min(sanitize(input.concreteWastePercentage), 100),
      mixCement: input.mixCement,
      mixSand: input.mixSand,
      mixGravel: input.mixGravel,
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
      gravelCubicMeter: prices.gravelCubicMeter,
      gravelBag: 0,
      laborCubicMeter: prices.laborConcreteCubicMeter,
    },
  );

  const steelKg =
    footingsVolume * sanitize(input.footingRebarKgM3) +
    columnsVolume * sanitize(input.columnRebarKgM3) +
    beamsVolume * sanitize(input.beamRebarKgM3) +
    slabVolume * sanitize(input.slabRebarKgM3);
  const kgPerBar = rebarKgPerMeter(input.barSize) * (sanitize(input.barPieceLength) || 9.14);
  const barPieces = kgPerBar
    ? Math.ceil((steelKg * (1 + pct(input.rebarWastePercentage))) / kgPerBar)
    : 0;
  const tieWireKg = (steelKg * sanitize(input.tieWireKgPer100Kg)) / 100;

  const formwork = input.includeFormwork
    ? calculateFormwork(
        {
          directArea: 0,
          columnCount: input.columnCount,
          columnWidthCm: input.columnWidthCm,
          columnDepthCm: input.columnDepthCm,
          columnHeight: input.columnHeight,
          beamLength: input.beamLength,
          beamWidthCm: input.beamWidthCm,
          beamHeightCm: input.beamHeightCm,
          slabArea: input.slabArea,
          // Zapata: las cuatro caras laterales.
          edgeLength: whole(input.footingCount) * 2 * (sanitize(input.footingLength) + sanitize(input.footingWidth)),
          edgeHeight: sanitize(input.footingHeight),
          uses: input.formworkUses,
          sheetWidth: input.sheetWidth,
          sheetLength: input.sheetLength,
          lumberPiecesPerSquareMeter: input.lumberPiecesPerSquareMeter,
          nailsKgPerSquareMeter: input.nailsKgPerSquareMeter,
          wastePercentage: input.formworkWastePercentage,
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
    footingsVolume, columnsVolume, beamsVolume, slabVolume, concreteVolume, concrete, steelKg,
    barPieces, tieWireKg, formwork, barCost, tieWireCost, rebarLaborCost, materialsCost,
    laborCost, totalCost: materialsCost + laborCost,
  };
}
