/**
 * Calculadoras de acero de refuerzo, techos, plomería e impermeabilización.
 *
 * Son funciones puras (sin pantalla): reciben medidas y precios, y devuelven
 * cantidades a comprar (siempre redondeadas hacia arriba) y costos.
 */

function sanitize(value: number): number {
  if (!Number.isFinite(value) || value < 0) return 0;
  return value;
}

function whole(value: number): number {
  return Math.round(sanitize(value));
}

function wasteFactor(percentage: number): number {
  return 1 + Math.min(sanitize(percentage), 100) / 100;
}

/**
 * Piezas necesarias para cubrir un tramo continuo con piezas de largo fijo.
 * Cada empalme (traslape) consume `lapLength` de la pieza anterior.
 */
export function piecesForRun(runLength: number, pieceLength: number, lapLength = 0): number {
  const run = sanitize(runLength);
  const piece = sanitize(pieceLength);
  if (!run || !piece) return 0;
  if (run <= piece) return 1;
  const effective = Math.max(piece - sanitize(lapLength), piece * 0.1);
  return 1 + Math.ceil((run - piece) / effective);
}

// ---------------------------------------------------------------------------
// Acero de refuerzo
// ---------------------------------------------------------------------------

/** Peso por metro de las varillas corrugadas (número = octavos de pulgada). */
export const REBAR_KG_PER_METER: Record<number, number> = {
  2: 0.249,
  3: 0.56,
  4: 0.994,
  5: 1.552,
  6: 2.235,
  7: 3.042,
  8: 3.973,
};

export function rebarKgPerMeter(size: number): number {
  return REBAR_KG_PER_METER[Math.round(size)] ?? 0;
}

/** Diámetro nominal en metros: número de varilla × 1/8" (25.4 mm / 8). */
export function rebarDiameterMeters(size: number): number {
  return (Math.round(sanitize(size)) * 25.4) / 8 / 1000;
}

export type RebarInput = {
  // Parrilla (losa, zapata, piso): varillas en dos direcciones.
  gridLength: number;
  gridWidth: number;
  /** Separación entre varillas paralelas al largo (se mide a lo ancho). */
  gridSpacingAcrossWidth: number;
  /** Separación entre varillas paralelas al ancho (se mide a lo largo). */
  gridSpacingAlongLength: number;
  gridBarSize: number;
  gridLayers: number;
  // Malla electrosoldada.
  meshArea: number;
  meshSheetWidth: number;
  meshSheetLength: number;
  meshOverlap: number;
  // Columnas y vigas.
  memberCount: number;
  memberLength: number;
  mainBarsPerMember: number;
  mainBarSize: number;
  sectionWidthCm: number;
  sectionHeightCm: number;
  coverCm: number;
  stirrupSpacing: number;
  stirrupBarSize: number;
  stirrupHookLength: number;
  // Generales.
  barPieceLength: number;
  lapDiameters: number;
  wastePercentage: number;
  tieWireKgPer100Kg: number;
};

export type RebarPrices = {
  gridBar: number;
  mainBar: number;
  stirrupBar: number;
  meshSheet: number;
  tieWireKg: number;
  laborKg: number;
  laborMeshSquareMeter: number;
};

export type RebarResult = {
  gridBarsAlongLength: number;
  gridBarsAlongWidth: number;
  gridPieces: number;
  gridKg: number;
  meshSheets: number;
  meshCoveredArea: number;
  mainPieces: number;
  mainKg: number;
  stirrupsPerMember: number;
  stirrupLength: number;
  stirrupPieces: number;
  stirrupKg: number;
  totalSteelKg: number;
  tieWireKg: number;
  gridCost: number;
  meshCost: number;
  mainCost: number;
  stirrupCost: number;
  tieWireCost: number;
  materialsCost: number;
  barLaborCost: number;
  meshLaborCost: number;
  laborCost: number;
  totalCost: number;
};

export function emptyRebarResult(): RebarResult {
  return {
    gridBarsAlongLength: 0, gridBarsAlongWidth: 0, gridPieces: 0, gridKg: 0,
    meshSheets: 0, meshCoveredArea: 0, mainPieces: 0, mainKg: 0,
    stirrupsPerMember: 0, stirrupLength: 0, stirrupPieces: 0, stirrupKg: 0,
    totalSteelKg: 0, tieWireKg: 0, gridCost: 0, meshCost: 0, mainCost: 0,
    stirrupCost: 0, tieWireCost: 0, materialsCost: 0, barLaborCost: 0,
    meshLaborCost: 0, laborCost: 0, totalCost: 0,
  };
}

export function calculateRebar(input: RebarInput, prices: RebarPrices): RebarResult {
  const factor = wasteFactor(input.wastePercentage);
  const pieceLength = sanitize(input.barPieceLength) || 9.14;
  const lapFor = (size: number) => sanitize(input.lapDiameters) * rebarDiameterMeters(size);

  // --- Parrilla ---
  const gridLength = sanitize(input.gridLength);
  const gridWidth = sanitize(input.gridWidth);
  const spacingAcross = sanitize(input.gridSpacingAcrossWidth);
  const spacingAlong = sanitize(input.gridSpacingAlongLength);
  const layers = Math.max(whole(input.gridLayers), 1);
  let gridBarsAlongLength = 0;
  let gridBarsAlongWidth = 0;
  let gridPieces = 0;
  let gridMeters = 0;
  if (gridLength && gridWidth && spacingAcross && spacingAlong) {
    const lap = lapFor(input.gridBarSize);
    gridBarsAlongLength = Math.ceil(gridWidth / spacingAcross) + 1;
    gridBarsAlongWidth = Math.ceil(gridLength / spacingAlong) + 1;
    const piecesLength = gridBarsAlongLength * piecesForRun(gridLength, pieceLength, lap);
    const piecesWidth = gridBarsAlongWidth * piecesForRun(gridWidth, pieceLength, lap);
    const rawPieces = layers * (piecesLength + piecesWidth);
    gridPieces = Math.ceil(rawPieces * factor);
    const runs = layers * (gridBarsAlongLength + gridBarsAlongWidth);
    gridMeters =
      layers * (gridBarsAlongLength * gridLength + gridBarsAlongWidth * gridWidth) +
      Math.max(rawPieces - runs, 0) * lap;
  }
  const gridKg = gridMeters * rebarKgPerMeter(input.gridBarSize);

  // --- Malla electrosoldada ---
  const meshArea = sanitize(input.meshArea);
  const sheetWidth = sanitize(input.meshSheetWidth);
  const sheetLength = sanitize(input.meshSheetLength);
  const overlap = sanitize(input.meshOverlap);
  let meshSheets = 0;
  let meshCoveredArea = 0;
  if (meshArea && sheetWidth > overlap && sheetLength > overlap) {
    meshCoveredArea = (sheetWidth - overlap) * (sheetLength - overlap);
    meshSheets = Math.ceil((meshArea * factor) / meshCoveredArea);
  }

  // --- Columnas y vigas ---
  const members = Math.max(whole(input.memberCount), 0);
  const memberLength = sanitize(input.memberLength);
  const mainBars = whole(input.mainBarsPerMember);
  let mainPieces = 0;
  let mainMeters = 0;
  let stirrupsPerMember = 0;
  let stirrupLength = 0;
  let stirrupPieces = 0;
  let stirrupMeters = 0;
  if (members && memberLength) {
    if (mainBars) {
      const lap = lapFor(input.mainBarSize);
      const perBar = piecesForRun(memberLength, pieceLength, lap);
      const rawPieces = members * mainBars * perBar;
      mainPieces = Math.ceil(rawPieces * factor);
      mainMeters =
        members * mainBars * memberLength +
        Math.max(rawPieces - members * mainBars, 0) * lap;
    }
    const spacing = sanitize(input.stirrupSpacing);
    const core =
      (sanitize(input.sectionWidthCm) - 2 * sanitize(input.coverCm)) +
      (sanitize(input.sectionHeightCm) - 2 * sanitize(input.coverCm));
    if (spacing && core > 0) {
      stirrupsPerMember = Math.ceil(memberLength / spacing) + 1;
      stirrupLength = (2 * core) / 100 + sanitize(input.stirrupHookLength);
      stirrupMeters = members * stirrupsPerMember * stirrupLength;
      stirrupPieces = Math.ceil((stirrupMeters * factor) / pieceLength);
    }
  }
  const mainKg = mainMeters * rebarKgPerMeter(input.mainBarSize);
  const stirrupKg = stirrupMeters * rebarKgPerMeter(input.stirrupBarSize);

  const totalSteelKg = gridKg + mainKg + stirrupKg;
  const tieWireKg = (totalSteelKg * sanitize(input.tieWireKgPer100Kg)) / 100;

  const gridCost = gridPieces * sanitize(prices.gridBar);
  const meshCost = meshSheets * sanitize(prices.meshSheet);
  const mainCost = mainPieces * sanitize(prices.mainBar);
  const stirrupCost = stirrupPieces * sanitize(prices.stirrupBar);
  const tieWireCost = tieWireKg * sanitize(prices.tieWireKg);
  const materialsCost = gridCost + meshCost + mainCost + stirrupCost + tieWireCost;

  const barLaborCost = totalSteelKg * sanitize(prices.laborKg);
  const meshLaborCost = meshArea * sanitize(prices.laborMeshSquareMeter);
  const laborCost = barLaborCost + meshLaborCost;

  return {
    gridBarsAlongLength, gridBarsAlongWidth, gridPieces, gridKg,
    meshSheets, meshCoveredArea, mainPieces, mainKg,
    stirrupsPerMember, stirrupLength, stirrupPieces, stirrupKg,
    totalSteelKg, tieWireKg, gridCost, meshCost, mainCost, stirrupCost,
    tieWireCost, materialsCost, barLaborCost, meshLaborCost, laborCost,
    totalCost: materialsCost + laborCost,
  };
}

// ---------------------------------------------------------------------------
// Techos y cubiertas
// ---------------------------------------------------------------------------

export type RoofType = "gable" | "shed";

export type RoofingInput = {
  roofType: RoofType;
  length: number;
  width: number;
  overhang: number;
  slopePercent: number;
  sheetEffectiveWidth: number;
  sheetLength: number;
  longitudinalLap: number;
  purlinSpacing: number;
  purlinPieceLength: number;
  purlinLap: number;
  screwsPerSquareMeter: number;
  screwsPerBox: number;
  includeRidge: boolean;
  ridgePieceLength: number;
  includeGutter: boolean;
  gutterPieceLength: number;
  downspouts: number;
  wastePercentage: number;
};

export type RoofingPrices = {
  sheet: number;
  purlin: number;
  screwBox: number;
  ridgePiece: number;
  gutterPiece: number;
  downspoutPiece: number;
  supplies: number;
  laborSquareMeter: number;
};

export type RoofingResult = {
  planes: number;
  planLength: number;
  slopeLength: number;
  roofArea: number;
  sheetsAcross: number;
  sheetsPerRun: number;
  sheets: number;
  purlinLines: number;
  purlins: number;
  screws: number;
  screwBoxes: number;
  ridgeMeters: number;
  ridgePieces: number;
  gutterMeters: number;
  gutterPieces: number;
  downspouts: number;
  sheetCost: number;
  purlinCost: number;
  screwCost: number;
  ridgeCost: number;
  gutterCost: number;
  downspoutCost: number;
  suppliesCost: number;
  materialsCost: number;
  laborCost: number;
  totalCost: number;
};

export function emptyRoofingResult(): RoofingResult {
  return {
    planes: 0, planLength: 0, slopeLength: 0, roofArea: 0, sheetsAcross: 0,
    sheetsPerRun: 0, sheets: 0, purlinLines: 0, purlins: 0, screws: 0,
    screwBoxes: 0, ridgeMeters: 0, ridgePieces: 0, gutterMeters: 0,
    gutterPieces: 0, downspouts: 0, sheetCost: 0, purlinCost: 0, screwCost: 0,
    ridgeCost: 0, gutterCost: 0, downspoutCost: 0, suppliesCost: 0,
    materialsCost: 0, laborCost: 0, totalCost: 0,
  };
}

export function calculateRoofing(input: RoofingInput, prices: RoofingPrices): RoofingResult {
  const length = sanitize(input.length);
  const width = sanitize(input.width);
  const effectiveWidth = sanitize(input.sheetEffectiveWidth);
  const sheetLength = sanitize(input.sheetLength);
  if (!length || !width || !effectiveWidth || !sheetLength) return emptyRoofingResult();

  const factor = wasteFactor(input.wastePercentage);
  const overhang = sanitize(input.overhang);
  const gable = input.roofType === "gable";
  const planes = gable ? 2 : 1;
  const planLength = length + 2 * overhang;
  // Dos aguas: alero en los dos bordes bajos. Una agua: alero en el borde bajo.
  const run = gable ? width / 2 + overhang : width + overhang;
  const cosine = Math.cos(Math.atan(sanitize(input.slopePercent) / 100));
  const slopeLength = run / cosine;
  const roofArea = planes * slopeLength * planLength;

  const sheetsAcross = Math.ceil(planLength / effectiveWidth);
  const sheetsPerRun = piecesForRun(slopeLength, sheetLength, input.longitudinalLap);
  const sheets = Math.ceil(planes * sheetsAcross * sheetsPerRun * factor);

  let purlinLines = 0;
  let purlins = 0;
  const purlinSpacing = sanitize(input.purlinSpacing);
  const purlinPieceLength = sanitize(input.purlinPieceLength);
  if (purlinSpacing && purlinPieceLength) {
    purlinLines = planes * (Math.floor(slopeLength / purlinSpacing) + 1);
    const perLine = piecesForRun(planLength, purlinPieceLength, input.purlinLap);
    purlins = Math.ceil(purlinLines * perLine * factor);
  }

  const screws = Math.ceil(roofArea * sanitize(input.screwsPerSquareMeter) * factor);
  const screwBoxes = Math.ceil(screws / (sanitize(input.screwsPerBox) || 1));

  const ridgePieceLength = sanitize(input.ridgePieceLength);
  const ridgeMeters = gable && input.includeRidge ? planLength : 0;
  const ridgePieces = ridgeMeters && ridgePieceLength
    ? Math.ceil((ridgeMeters * factor) / ridgePieceLength)
    : 0;

  const gutterPieceLength = sanitize(input.gutterPieceLength);
  const gutterMeters = input.includeGutter ? planLength * (gable ? 2 : 1) : 0;
  const gutterPieces = gutterMeters && gutterPieceLength
    ? Math.ceil((gutterMeters * factor) / gutterPieceLength)
    : 0;
  const downspouts = input.includeGutter ? whole(input.downspouts) : 0;

  const sheetCost = sheets * sanitize(prices.sheet);
  const purlinCost = purlins * sanitize(prices.purlin);
  const screwCost = screwBoxes * sanitize(prices.screwBox);
  const ridgeCost = ridgePieces * sanitize(prices.ridgePiece);
  const gutterCost = gutterPieces * sanitize(prices.gutterPiece);
  const downspoutCost = downspouts * sanitize(prices.downspoutPiece);
  const suppliesCost = sanitize(prices.supplies);
  const materialsCost =
    sheetCost + purlinCost + screwCost + ridgeCost + gutterCost + downspoutCost + suppliesCost;
  const laborCost = roofArea * sanitize(prices.laborSquareMeter);

  return {
    planes, planLength, slopeLength, roofArea, sheetsAcross, sheetsPerRun, sheets,
    purlinLines, purlins, screws, screwBoxes, ridgeMeters, ridgePieces,
    gutterMeters, gutterPieces, downspouts, sheetCost, purlinCost, screwCost,
    ridgeCost, gutterCost, downspoutCost, suppliesCost, materialsCost, laborCost,
    totalCost: materialsCost + laborCost,
  };
}

// ---------------------------------------------------------------------------
// Plomería
// ---------------------------------------------------------------------------

export type PlumbingInput = {
  toilets: number;
  sinks: number;
  showers: number;
  kitchenSinks: number;
  laundry: number;
  outdoorTaps: number;
  supplyRoutePerPoint: number;
  drainRoutePerPoint: number;
  toiletDrainRoute: number;
  pipePieceLength: number;
  fittingsPercentage: number;
  wastePercentage: number;
  septicTanks: number;
  includeFixtures: boolean;
};

export type PlumbingPrices = {
  supplyPipe: number;
  drainPipe2: number;
  drainPipe4: number;
  valve: number;
  toilet: number;
  sink: number;
  shower: number;
  kitchenSink: number;
  laundrySink: number;
  septicTank: number;
  supplies: number;
  laborPoint: number;
};

export type PlumbingResult = {
  supplyPoints: number;
  drainPoints2: number;
  toilets: number;
  supplyMeters: number;
  supplyPieces: number;
  drain2Meters: number;
  drain2Pieces: number;
  drain4Meters: number;
  drain4Pieces: number;
  valves: number;
  septicTanks: number;
  supplyCost: number;
  drain2Cost: number;
  drain4Cost: number;
  fittingsCost: number;
  valveCost: number;
  fixturesCost: number;
  septicCost: number;
  suppliesCost: number;
  materialsCost: number;
  laborCost: number;
  totalCost: number;
};

export function emptyPlumbingResult(): PlumbingResult {
  return {
    supplyPoints: 0, drainPoints2: 0, toilets: 0, supplyMeters: 0, supplyPieces: 0,
    drain2Meters: 0, drain2Pieces: 0, drain4Meters: 0, drain4Pieces: 0, valves: 0,
    septicTanks: 0, supplyCost: 0, drain2Cost: 0, drain4Cost: 0, fittingsCost: 0,
    valveCost: 0, fixturesCost: 0, septicCost: 0, suppliesCost: 0, materialsCost: 0,
    laborCost: 0, totalCost: 0,
  };
}

export function calculatePlumbing(input: PlumbingInput, prices: PlumbingPrices): PlumbingResult {
  const toilets = whole(input.toilets);
  const sinks = whole(input.sinks);
  const showers = whole(input.showers);
  const kitchenSinks = whole(input.kitchenSinks);
  const laundry = whole(input.laundry);
  const taps = whole(input.outdoorTaps);
  const septicTanks = whole(input.septicTanks);

  const fixturePoints = toilets + sinks + showers + kitchenSinks + laundry;
  const supplyPoints = fixturePoints + taps;
  if (!supplyPoints && !septicTanks) return emptyPlumbingResult();

  const factor = wasteFactor(input.wastePercentage);
  const pieceLength = sanitize(input.pipePieceLength) || 6.1;
  const drainPoints2 = sinks + showers + kitchenSinks + laundry;

  const supplyMeters = supplyPoints * sanitize(input.supplyRoutePerPoint) * factor;
  const drain2Meters = drainPoints2 * sanitize(input.drainRoutePerPoint) * factor;
  const drain4Meters = toilets * sanitize(input.toiletDrainRoute) * factor;
  const supplyPieces = Math.ceil(supplyMeters / pieceLength);
  const drain2Pieces = Math.ceil(drain2Meters / pieceLength);
  const drain4Pieces = Math.ceil(drain4Meters / pieceLength);

  // Una llave de paso o angular por cada aparato; las llaves exteriores ya la traen.
  const valves = fixturePoints;

  const supplyCost = supplyPieces * sanitize(prices.supplyPipe);
  const drain2Cost = drain2Pieces * sanitize(prices.drainPipe2);
  const drain4Cost = drain4Pieces * sanitize(prices.drainPipe4);
  const fittingsCost =
    ((supplyCost + drain2Cost + drain4Cost) * Math.min(sanitize(input.fittingsPercentage), 200)) / 100;
  const valveCost = valves * sanitize(prices.valve);
  const fixturesCost = input.includeFixtures
    ? toilets * sanitize(prices.toilet) +
      sinks * sanitize(prices.sink) +
      showers * sanitize(prices.shower) +
      kitchenSinks * sanitize(prices.kitchenSink) +
      laundry * sanitize(prices.laundrySink)
    : 0;
  const septicCost = septicTanks * sanitize(prices.septicTank);
  const suppliesCost = sanitize(prices.supplies);
  const materialsCost =
    supplyCost + drain2Cost + drain4Cost + fittingsCost + valveCost +
    fixturesCost + septicCost + suppliesCost;
  const laborCost = supplyPoints * sanitize(prices.laborPoint);

  return {
    supplyPoints, drainPoints2, toilets, supplyMeters, supplyPieces, drain2Meters,
    drain2Pieces, drain4Meters, drain4Pieces, valves, septicTanks, supplyCost,
    drain2Cost, drain4Cost, fittingsCost, valveCost, fixturesCost, septicCost,
    suppliesCost, materialsCost, laborCost, totalCost: materialsCost + laborCost,
  };
}

// ---------------------------------------------------------------------------
// Impermeabilización
// ---------------------------------------------------------------------------

export type WaterproofingInput = {
  area: number;
  perimeter: number;
  upturnHeight: number;
  coats: number;
  coveragePerGallonPerCoat: number;
  primerEnabled: boolean;
  primerCoveragePerGallon: number;
  meshEnabled: boolean;
  meshRollCoverage: number;
  wastePercentage: number;
};

export type WaterproofingPrices = {
  productGallon: number;
  primerGallon: number;
  meshRoll: number;
  supplies: number;
  laborSquareMeter: number;
};

export type WaterproofingResult = {
  area: number;
  treatedArea: number;
  productGallonsExact: number;
  productGallonsToBuy: number;
  primerGallonsExact: number;
  primerGallonsToBuy: number;
  meshRolls: number;
  productCost: number;
  primerCost: number;
  meshCost: number;
  suppliesCost: number;
  materialsCost: number;
  laborCost: number;
  totalCost: number;
};

export function emptyWaterproofingResult(): WaterproofingResult {
  return {
    area: 0, treatedArea: 0, productGallonsExact: 0, productGallonsToBuy: 0,
    primerGallonsExact: 0, primerGallonsToBuy: 0, meshRolls: 0, productCost: 0,
    primerCost: 0, meshCost: 0, suppliesCost: 0, materialsCost: 0, laborCost: 0,
    totalCost: 0,
  };
}

export function calculateWaterproofing(
  input: WaterproofingInput,
  prices: WaterproofingPrices,
): WaterproofingResult {
  const area = sanitize(input.area);
  const coverage = sanitize(input.coveragePerGallonPerCoat);
  if (!area || !coverage) return emptyWaterproofingResult();

  const factor = wasteFactor(input.wastePercentage);
  // Los muros y bordes que suben (rodapié) también se impermeabilizan.
  const treatedArea = area + sanitize(input.perimeter) * sanitize(input.upturnHeight);
  const coats = Math.max(whole(input.coats), 1);

  const productGallonsExact = ((treatedArea * coats) / coverage) * factor;
  const productGallonsToBuy = Math.ceil(productGallonsExact);

  const primerCoverage = sanitize(input.primerCoveragePerGallon);
  const primerGallonsExact = input.primerEnabled && primerCoverage
    ? (treatedArea / primerCoverage) * factor
    : 0;
  const primerGallonsToBuy = Math.ceil(primerGallonsExact);

  const meshCoverage = sanitize(input.meshRollCoverage);
  const meshRolls = input.meshEnabled && meshCoverage
    ? Math.ceil((treatedArea * factor) / meshCoverage)
    : 0;

  const productCost = productGallonsToBuy * sanitize(prices.productGallon);
  const primerCost = primerGallonsToBuy * sanitize(prices.primerGallon);
  const meshCost = meshRolls * sanitize(prices.meshRoll);
  const suppliesCost = sanitize(prices.supplies);
  const materialsCost = productCost + primerCost + meshCost + suppliesCost;
  const laborCost = treatedArea * sanitize(prices.laborSquareMeter);

  return {
    area, treatedArea, productGallonsExact, productGallonsToBuy, primerGallonsExact,
    primerGallonsToBuy, meshRolls, productCost, primerCost, meshCost, suppliesCost,
    materialsCost, laborCost, totalCost: materialsCost + laborCost,
  };
}
