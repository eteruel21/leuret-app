/**
 * Cielo falso de gypsum y centro de carga con puesta a tierra.
 * Funciones puras: cantidades a comprar redondeadas hacia arriba y costos.
 */

function sanitize(value: number): number {
  if (!Number.isFinite(value) || value < 0) return 0;
  return value;
}

function whole(value: number): number {
  return Math.round(sanitize(value));
}

function pct(value: number): number {
  return Math.min(sanitize(value), 100) / 100;
}

const EPS = 1e-9;

// ---------------------------------------------------------------------------
// Cielo falso de gypsum
// ---------------------------------------------------------------------------

export type GypsumCeilingInput = {
  length: number;
  width: number;
  sheetWidth: number;
  sheetLength: number;
  /** Los canales portantes corren a lo largo; se separan esto entre sí. */
  mainSpacing: number;
  /** Los canales de amarre van en el otro sentido. */
  furringSpacing: number;
  profilePieceLength: number;
  perimeterPieceLength: number;
  hangerSpacing: number;
  hangerLength: number;
  hangerKgPerMeter: number;
  screwsPerSquareMeter: number;
  screwsPerBox: number;
  compoundKgPerSquareMeter: number;
  compoundPailKg: number;
  tapeMetersPerSquareMeter: number;
  tapeRollLength: number;
  wastePercentage: number;
};

export type GypsumCeilingPrices = {
  sheet: number;
  mainPiece: number;
  furringPiece: number;
  perimeterPiece: number;
  hangerKg: number;
  screwBox: number;
  compoundPail: number;
  tapeRoll: number;
  laborSquareMeter: number;
};

export type GypsumCeilingResult = {
  area: number;
  perimeter: number;
  sheets: number;
  mainLines: number;
  mainPieces: number;
  furringLines: number;
  furringPieces: number;
  perimeterPieces: number;
  hangers: number;
  hangerKg: number;
  screwBoxes: number;
  compoundPails: number;
  tapeRolls: number;
  sheetCost: number;
  mainCost: number;
  furringCost: number;
  perimeterCost: number;
  hangerCost: number;
  screwCost: number;
  compoundCost: number;
  tapeCost: number;
  materialsCost: number;
  laborCost: number;
  totalCost: number;
};

export function emptyGypsumCeilingResult(): GypsumCeilingResult {
  return {
    area: 0, perimeter: 0, sheets: 0, mainLines: 0, mainPieces: 0, furringLines: 0, furringPieces: 0,
    perimeterPieces: 0, hangers: 0, hangerKg: 0, screwBoxes: 0, compoundPails: 0, tapeRolls: 0,
    sheetCost: 0, mainCost: 0, furringCost: 0, perimeterCost: 0, hangerCost: 0, screwCost: 0,
    compoundCost: 0, tapeCost: 0, materialsCost: 0, laborCost: 0, totalCost: 0,
  };
}

function piecesFor(length: number, pieceLength: number): number {
  return pieceLength ? Math.ceil(length / pieceLength - EPS) : 0;
}

export function calculateGypsumCeiling(input: GypsumCeilingInput, prices: GypsumCeilingPrices): GypsumCeilingResult {
  const length = sanitize(input.length);
  const width = sanitize(input.width);
  const area = length * width;
  const sheetArea = sanitize(input.sheetWidth) * sanitize(input.sheetLength);
  if (!area || !sheetArea) return emptyGypsumCeilingResult();

  const factor = 1 + pct(input.wastePercentage);
  const perimeter = 2 * (length + width);

  const sheets = Math.ceil((area * factor) / sheetArea - EPS);

  // Canales portantes a lo largo, uno cada mainSpacing a lo ancho.
  const mainSpacing = sanitize(input.mainSpacing);
  const mainLines = mainSpacing ? Math.ceil(width / mainSpacing - EPS) : 0;
  const mainPieces = mainLines * piecesFor(length, sanitize(input.profilePieceLength));

  // Canales de amarre a lo ancho, uno cada furringSpacing a lo largo.
  const furringSpacing = sanitize(input.furringSpacing);
  const furringLines = furringSpacing ? Math.ceil(length / furringSpacing - EPS) + 1 : 0;
  const furringPieces = furringLines * piecesFor(width, sanitize(input.profilePieceLength));

  const perimeterPieces = piecesFor(perimeter * factor, sanitize(input.perimeterPieceLength));

  const hangerSpacing = sanitize(input.hangerSpacing);
  const hangers = mainLines && hangerSpacing ? mainLines * (Math.ceil(length / hangerSpacing - EPS) + 1) : 0;
  const hangerKg = hangers * sanitize(input.hangerLength) * sanitize(input.hangerKgPerMeter);

  const screwsPerBox = sanitize(input.screwsPerBox);
  const screwBoxes = screwsPerBox
    ? Math.ceil((area * sanitize(input.screwsPerSquareMeter) * factor) / screwsPerBox - EPS)
    : 0;
  const compoundPailKg = sanitize(input.compoundPailKg);
  const compoundPails = compoundPailKg
    ? Math.ceil((area * sanitize(input.compoundKgPerSquareMeter)) / compoundPailKg - EPS)
    : 0;
  const tapeRollLength = sanitize(input.tapeRollLength);
  const tapeRolls = tapeRollLength
    ? Math.ceil((area * sanitize(input.tapeMetersPerSquareMeter)) / tapeRollLength - EPS)
    : 0;

  const sheetCost = sheets * sanitize(prices.sheet);
  const mainCost = mainPieces * sanitize(prices.mainPiece);
  const furringCost = furringPieces * sanitize(prices.furringPiece);
  const perimeterCost = perimeterPieces * sanitize(prices.perimeterPiece);
  const hangerCost = hangerKg * sanitize(prices.hangerKg);
  const screwCost = screwBoxes * sanitize(prices.screwBox);
  const compoundCost = compoundPails * sanitize(prices.compoundPail);
  const tapeCost = tapeRolls * sanitize(prices.tapeRoll);
  const materialsCost = sheetCost + mainCost + furringCost + perimeterCost + hangerCost + screwCost + compoundCost + tapeCost;
  const laborCost = area * sanitize(prices.laborSquareMeter);

  return {
    area, perimeter, sheets, mainLines, mainPieces, furringLines, furringPieces, perimeterPieces,
    hangers, hangerKg, screwBoxes, compoundPails, tapeRolls, sheetCost, mainCost, furringCost,
    perimeterCost, hangerCost, screwCost, compoundCost, tapeCost, materialsCost, laborCost,
    totalCost: materialsCost + laborCost,
  };
}

// ---------------------------------------------------------------------------
// Centro de carga y puesta a tierra
// ---------------------------------------------------------------------------

/** Tamaños comerciales de centros de carga, en espacios. */
export const PANEL_SIZES = [4, 6, 8, 12, 16, 20, 24, 30, 40] as const;

export type PanelInput = {
  /** Circuitos de 1 polo (iluminación, tomacorrientes). */
  singlePole15: number;
  singlePole20: number;
  /** Circuitos de 2 polos (aire acondicionado, estufa, calentador). */
  doublePole30: number;
  doublePole50: number;
  /** Espacios que se dejan libres para ampliar. */
  reservePercentage: number;
  rods: number;
  /** Cable de cobre desnudo desde la varilla hasta el centro de carga. */
  groundCableLength: number;
  cableWastePercentage: number;
};

export type PanelPrices = {
  panel: number;
  mainBreaker: number;
  breaker15: number;
  breaker20: number;
  breaker2p30: number;
  breaker2p50: number;
  rod: number;
  groundCableMeter: number;
  rodClamp: number;
  laborPanel: number;
  laborCircuit: number;
  laborGrounding: number;
};

export type PanelResult = {
  spacesUsed: number;
  spacesNeeded: number;
  panelSpaces: number;
  circuits: number;
  breaker15: number;
  breaker20: number;
  breaker2p30: number;
  breaker2p50: number;
  rods: number;
  groundCable: number;
  rodClamps: number;
  panelCost: number;
  mainBreakerCost: number;
  breaker15Cost: number;
  breaker20Cost: number;
  breaker2p30Cost: number;
  breaker2p50Cost: number;
  breakersCost: number;
  rodCost: number;
  cableCost: number;
  clampCost: number;
  groundingCost: number;
  materialsCost: number;
  laborCost: number;
  totalCost: number;
};

export function emptyPanelResult(): PanelResult {
  return {
    spacesUsed: 0, spacesNeeded: 0, panelSpaces: 0, circuits: 0, breaker15: 0, breaker20: 0,
    breaker2p30: 0, breaker2p50: 0, rods: 0, groundCable: 0, rodClamps: 0, panelCost: 0,
    mainBreakerCost: 0, breaker15Cost: 0, breaker20Cost: 0, breaker2p30Cost: 0, breaker2p50Cost: 0,
    breakersCost: 0, rodCost: 0, cableCost: 0, clampCost: 0, groundingCost: 0, materialsCost: 0,
    laborCost: 0, totalCost: 0,
  };
}

export function calculatePanel(input: PanelInput, prices: PanelPrices): PanelResult {
  const breaker15 = whole(input.singlePole15);
  const breaker20 = whole(input.singlePole20);
  const breaker2p30 = whole(input.doublePole30);
  const breaker2p50 = whole(input.doublePole50);
  const circuits = breaker15 + breaker20 + breaker2p30 + breaker2p50;
  if (!circuits) return emptyPanelResult();

  // Los interruptores de 2 polos ocupan dos espacios.
  const spacesUsed = breaker15 + breaker20 + 2 * (breaker2p30 + breaker2p50);
  const spacesNeeded = Math.ceil(spacesUsed * (1 + pct(input.reservePercentage)) - EPS);
  const panelSpaces = PANEL_SIZES.find((size) => size >= spacesNeeded) ?? PANEL_SIZES[PANEL_SIZES.length - 1];

  const rods = whole(input.rods);
  const groundCable = sanitize(input.groundCableLength) * (1 + pct(input.cableWastePercentage));
  const rodClamps = rods;

  const panelCost = sanitize(prices.panel);
  const mainBreakerCost = sanitize(prices.mainBreaker);
  const breaker15Cost = breaker15 * sanitize(prices.breaker15);
  const breaker20Cost = breaker20 * sanitize(prices.breaker20);
  const breaker2p30Cost = breaker2p30 * sanitize(prices.breaker2p30);
  const breaker2p50Cost = breaker2p50 * sanitize(prices.breaker2p50);
  const breakersCost = breaker15Cost + breaker20Cost + breaker2p30Cost + breaker2p50Cost;
  const rodCost = rods * sanitize(prices.rod);
  const cableCost = groundCable * sanitize(prices.groundCableMeter);
  const clampCost = rodClamps * sanitize(prices.rodClamp);
  const groundingCost = rodCost + cableCost + clampCost;
  const materialsCost = panelCost + mainBreakerCost + breakersCost + groundingCost;
  const laborCost =
    sanitize(prices.laborPanel) + circuits * sanitize(prices.laborCircuit) + (rods ? sanitize(prices.laborGrounding) : 0);

  return {
    spacesUsed, spacesNeeded, panelSpaces, circuits, breaker15, breaker20, breaker2p30, breaker2p50,
    rods, groundCable, rodClamps, panelCost, mainBreakerCost, breaker15Cost, breaker20Cost,
    breaker2p30Cost, breaker2p50Cost, breakersCost, rodCost, cableCost, clampCost, groundingCost,
    materialsCost, laborCost, totalCost: materialsCost + laborCost,
  };
}
