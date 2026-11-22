/**
 * Pérgola de madera e iluminación y tomacorrientes.
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
// Pérgola de madera
// ---------------------------------------------------------------------------

export type PergolaInput = {
  length: number;
  width: number;
  height: number;
  postCount: number;
  postEmbed: number;
  /** Vigas principales a lo largo (una por línea de postes). */
  beamLines: number;
  rafterSpacing: number;
  overhang: number;
  includeSlats: boolean;
  slatSpacing: number;
  postPieceLength: number;
  beamPieceLength: number;
  rafterPieceLength: number;
  slatPieceLength: number;
  wastePercentage: number;
  jointsPerRafter: number;
  screwsPerSlat: number;
  screwsPerBox: number;
  includeFinish: boolean;
  /** Superficie a barnizar por metro de madera, en m²/m. */
  surfacePerMeter: number;
  finishCoats: number;
  finishCoverage: number;
};

export type PergolaPrices = {
  postPiece: number;
  beamPiece: number;
  rafterPiece: number;
  slatPiece: number;
  postBase: number;
  hardware: number;
  screwBox: number;
  finishGallon: number;
  laborSquareMeter: number;
};

export type PergolaResult = {
  area: number;
  postMeters: number;
  beamMeters: number;
  rafters: number;
  rafterMeters: number;
  slats: number;
  slatMeters: number;
  postPieces: number;
  beamPieces: number;
  rafterPieces: number;
  slatPieces: number;
  postBases: number;
  hardwareSets: number;
  screwBoxes: number;
  finishGallons: number;
  postCost: number;
  beamCost: number;
  rafterCost: number;
  slatCost: number;
  baseCost: number;
  hardwareCost: number;
  screwCost: number;
  finishCost: number;
  materialsCost: number;
  laborCost: number;
  totalCost: number;
};

export function emptyPergolaResult(): PergolaResult {
  return {
    area: 0, postMeters: 0, beamMeters: 0, rafters: 0, rafterMeters: 0, slats: 0, slatMeters: 0, postPieces: 0,
    beamPieces: 0, rafterPieces: 0, slatPieces: 0, postBases: 0, hardwareSets: 0, screwBoxes: 0, finishGallons: 0,
    postCost: 0, beamCost: 0, rafterCost: 0, slatCost: 0, baseCost: 0, hardwareCost: 0, screwCost: 0, finishCost: 0,
    materialsCost: 0, laborCost: 0, totalCost: 0,
  };
}

export function calculatePergola(input: PergolaInput, prices: PergolaPrices): PergolaResult {
  const length = sanitize(input.length);
  const width = sanitize(input.width);
  const posts = Math.round(sanitize(input.postCount));
  const rafterSpacing = sanitize(input.rafterSpacing);
  if (!length || !width || !posts || !rafterSpacing) return emptyPergolaResult();

  const factor = 1 + pct(input.wastePercentage);
  const postMeters = posts * (sanitize(input.height) + sanitize(input.postEmbed));
  const beamMeters = length * Math.round(sanitize(input.beamLines));
  const rafters = Math.floor(length / rafterSpacing + EPS) + 1;
  const rafterMeters = rafters * (width + 2 * sanitize(input.overhang));
  const slatSpacing = sanitize(input.slatSpacing);
  const slats = input.includeSlats && slatSpacing ? Math.floor(width / slatSpacing + EPS) + 1 : 0;
  const slatMeters = slats * length;

  const pieces = (meters: number, pieceLength: number) => {
    const piece = sanitize(pieceLength);
    return piece ? up((meters * factor) / piece) : 0;
  };
  const postPieces = pieces(postMeters, input.postPieceLength);
  const beamPieces = pieces(beamMeters, input.beamPieceLength);
  const rafterPieces = pieces(rafterMeters, input.rafterPieceLength);
  const slatPieces = slats ? pieces(slatMeters, input.slatPieceLength) : 0;

  const hardwareSets = posts * 2 + rafters * Math.round(sanitize(input.jointsPerRafter));
  const screwsTotal = slats * Math.round(sanitize(input.screwsPerSlat)) * rafters;
  const screwBoxes = sanitize(input.screwsPerBox) ? up(screwsTotal / sanitize(input.screwsPerBox)) : 0;

  const totalMeters = postMeters + beamMeters + rafterMeters + slatMeters;
  const finishArea = input.includeFinish ? totalMeters * sanitize(input.surfacePerMeter) : 0;
  const coverage = sanitize(input.finishCoverage);
  const finishGallons =
    finishArea && coverage ? up((finishArea * Math.max(sanitize(input.finishCoats), 1)) / coverage) : 0;

  const postCost = postPieces * sanitize(prices.postPiece);
  const beamCost = beamPieces * sanitize(prices.beamPiece);
  const rafterCost = rafterPieces * sanitize(prices.rafterPiece);
  const slatCost = slatPieces * sanitize(prices.slatPiece);
  const baseCost = posts * sanitize(prices.postBase);
  const hardwareCost = hardwareSets * sanitize(prices.hardware);
  const screwCost = screwBoxes * sanitize(prices.screwBox);
  const finishCost = finishGallons * sanitize(prices.finishGallon);
  const materialsCost = postCost + beamCost + rafterCost + slatCost + baseCost + hardwareCost + screwCost + finishCost;
  const area = length * width;
  const laborCost = area * sanitize(prices.laborSquareMeter);

  return {
    area, postMeters, beamMeters, rafters, rafterMeters, slats, slatMeters, postPieces, beamPieces,
    rafterPieces, slatPieces, postBases: posts, hardwareSets, screwBoxes, finishGallons, postCost, beamCost,
    rafterCost, slatCost, baseCost, hardwareCost, screwCost, finishCost, materialsCost, laborCost,
    totalCost: materialsCost + laborCost,
  };
}

// ---------------------------------------------------------------------------
// Iluminación y tomacorrientes
// ---------------------------------------------------------------------------

export type LightingInput = {
  lightPoints: number;
  switches: number;
  outlets: number;
  /** Recorrido medio de tubo desde el centro de carga a cada punto, en m. */
  runPerPoint: number;
  conductorsPerRun: number;
  conduitPieceLength: number;
  conduitFittingsPercentage: number;
  cableWastePercentage: number;
  lightsPerCircuit: number;
  outletsPerCircuit: number;
  /** Área y nivel de iluminación para sugerir luminarias (opcional). */
  roomArea: number;
  luxLevel: number;
  lumensPerLuminaire: number;
  utilizationFactor: number;
};

export type LightingPrices = {
  luminaire: number;
  switchUnit: number;
  outletUnit: number;
  lightBox: number;
  deviceBox: number;
  plate: number;
  lightingCableMeter: number;
  outletCableMeter: number;
  conduitPiece: number;
  breakerLighting: number;
  breakerOutlets: number;
  laborPoint: number;
};

export type LightingResult = {
  points: number;
  conduitMeters: number;
  conduitPieces: number;
  lightingCableMeters: number;
  outletCableMeters: number;
  lightingCircuits: number;
  outletCircuits: number;
  lightBoxes: number;
  deviceBoxes: number;
  plates: number;
  suggestedLuminaires: number;
  luminaireCost: number;
  switchCost: number;
  outletCost: number;
  boxCost: number;
  plateCost: number;
  cableCost: number;
  conduitCost: number;
  conduitFittingsCost: number;
  breakerCost: number;
  materialsCost: number;
  laborCost: number;
  totalCost: number;
};

export function emptyLightingResult(): LightingResult {
  return {
    points: 0, conduitMeters: 0, conduitPieces: 0, lightingCableMeters: 0, outletCableMeters: 0,
    lightingCircuits: 0, outletCircuits: 0, lightBoxes: 0, deviceBoxes: 0, plates: 0, suggestedLuminaires: 0,
    luminaireCost: 0, switchCost: 0, outletCost: 0, boxCost: 0, plateCost: 0, cableCost: 0, conduitCost: 0,
    conduitFittingsCost: 0, breakerCost: 0, materialsCost: 0, laborCost: 0, totalCost: 0,
  };
}

export function suggestedLuminaires(input: LightingInput): number {
  const area = sanitize(input.roomArea);
  const lux = sanitize(input.luxLevel);
  const lumens = sanitize(input.lumensPerLuminaire);
  const utilization = sanitize(input.utilizationFactor) || 0.5;
  if (!area || !lux || !lumens) return 0;
  return up((area * lux) / utilization / lumens);
}

export function calculateLighting(input: LightingInput, prices: LightingPrices): LightingResult {
  const lights = Math.round(sanitize(input.lightPoints));
  const switches = Math.round(sanitize(input.switches));
  const outlets = Math.round(sanitize(input.outlets));
  const points = lights + switches + outlets;
  if (!points) return emptyLightingResult();

  const run = sanitize(input.runPerPoint);
  const conductors = Math.max(Math.round(sanitize(input.conductorsPerRun)), 1);
  const cableFactor = 1 + pct(input.cableWastePercentage);

  const conduitMeters = points * run;
  const conduitLength = sanitize(input.conduitPieceLength);
  const conduitPieces = conduitLength ? up(conduitMeters / conduitLength) : 0;
  const lightingCableMeters = (lights + switches) * run * conductors * cableFactor;
  const outletCableMeters = outlets * run * conductors * cableFactor;

  const lightsPerCircuit = sanitize(input.lightsPerCircuit);
  const outletsPerCircuit = sanitize(input.outletsPerCircuit);
  const lightingCircuits = lights && lightsPerCircuit ? up(lights / lightsPerCircuit) : 0;
  const outletCircuits = outlets && outletsPerCircuit ? up(outlets / outletsPerCircuit) : 0;

  const lightBoxes = lights;
  const deviceBoxes = switches + outlets;
  const plates = switches + outlets;

  const luminaireCost = lights * sanitize(prices.luminaire);
  const switchCost = switches * sanitize(prices.switchUnit);
  const outletCost = outlets * sanitize(prices.outletUnit);
  const boxCost = lightBoxes * sanitize(prices.lightBox) + deviceBoxes * sanitize(prices.deviceBox);
  const plateCost = plates * sanitize(prices.plate);
  const cableCost =
    lightingCableMeters * sanitize(prices.lightingCableMeter) + outletCableMeters * sanitize(prices.outletCableMeter);
  const conduitCost = conduitPieces * sanitize(prices.conduitPiece);
  const conduitFittingsCost = conduitCost * pct(input.conduitFittingsPercentage);
  const breakerCost =
    lightingCircuits * sanitize(prices.breakerLighting) + outletCircuits * sanitize(prices.breakerOutlets);
  const materialsCost =
    luminaireCost + switchCost + outletCost + boxCost + plateCost + cableCost + conduitCost + conduitFittingsCost +
    breakerCost;
  const laborCost = points * sanitize(prices.laborPoint);

  return {
    points, conduitMeters, conduitPieces, lightingCableMeters, outletCableMeters, lightingCircuits,
    outletCircuits, lightBoxes, deviceBoxes, plates, suggestedLuminaires: suggestedLuminaires(input),
    luminaireCost, switchCost, outletCost, boxCost, plateCost, cableCost, conduitCost, conduitFittingsCost,
    breakerCost, materialsCost, laborCost, totalCost: materialsCost + laborCost,
  };
}
