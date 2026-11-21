/**
 * Cercas perimetrales (malla ciclón) y puertas y ventanas.
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

// ---------------------------------------------------------------------------
// Cerca de malla ciclón
// ---------------------------------------------------------------------------

export type FenceInput = {
  length: number;
  height: number;
  postSpacing: number;
  /** Esquinas y puntos de arranque: llevan poste reforzado. */
  cornerPosts: number;
  gates: number;
  gateWidth: number;
  /** Parte del poste que queda enterrada. */
  embedDepth: number;
  postPieceLength: number;
  railPieceLength: number;
  meshRollLength: number;
  meshRollHeight: number;
  barbedWireStrands: number;
  barbedWireRollLength: number;
  concretePerPost: number;
  cementBagsPerCubicMeter: number;
  wastePercentage: number;
};

export type FencePrices = {
  postPiece: number;
  railPiece: number;
  meshRoll: number;
  barbedWireRoll: number;
  cementBag: number;
  gate: number;
  accessoriesPerPost: number;
  laborMeter: number;
};

export type FenceResult = {
  fenceLength: number;
  posts: number;
  postPieces: number;
  railPieces: number;
  meshRolls: number;
  barbedWireRolls: number;
  concreteVolume: number;
  cementBags: number;
  gates: number;
  postCost: number;
  railCost: number;
  meshCost: number;
  barbedWireCost: number;
  cementCost: number;
  gateCost: number;
  accessoriesCost: number;
  materialsCost: number;
  laborCost: number;
  totalCost: number;
};

export function emptyFenceResult(): FenceResult {
  return {
    fenceLength: 0, posts: 0, postPieces: 0, railPieces: 0, meshRolls: 0, barbedWireRolls: 0,
    concreteVolume: 0, cementBags: 0, gates: 0, postCost: 0, railCost: 0, meshCost: 0,
    barbedWireCost: 0, cementCost: 0, gateCost: 0, accessoriesCost: 0, materialsCost: 0,
    laborCost: 0, totalCost: 0,
  };
}

export function calculateFence(input: FenceInput, prices: FencePrices): FenceResult {
  const length = sanitize(input.length);
  const height = sanitize(input.height);
  const spacing = sanitize(input.postSpacing);
  if (!length || !height || !spacing) return emptyFenceResult();

  const gates = whole(input.gates);
  const gateWidth = sanitize(input.gateWidth);
  // El portón ocupa parte del perímetro: ahí no va malla corrida.
  const meshLength = Math.max(length - gates * gateWidth, 0);
  const factor = 1 + pct(input.wastePercentage);

  const linePosts = Math.max(Math.ceil(meshLength / spacing) - 1, 0);
  // Cada portón lleva dos postes; las esquinas se cuentan aparte.
  const posts = linePosts + whole(input.cornerPosts) + gates * 2;

  const postLength = height + sanitize(input.embedDepth);
  const pieceLength = sanitize(input.postPieceLength);
  const postsPerPiece = pieceLength && postLength ? Math.floor(pieceLength / postLength) : 0;
  const postPieces = postsPerPiece
    ? Math.ceil(posts / postsPerPiece)
    : pieceLength ? Math.ceil((posts * postLength) / pieceLength) : 0;

  const railLength = sanitize(input.railPieceLength);
  const railPieces = railLength ? Math.ceil((meshLength * factor) / railLength) : 0;

  const rollLength = sanitize(input.meshRollLength);
  const rollHeight = sanitize(input.meshRollHeight);
  const rowsHigh = rollHeight ? Math.ceil(height / rollHeight) : 1;
  const meshRolls = rollLength ? Math.ceil(((meshLength * factor) / rollLength) * rowsHigh) : 0;

  const strands = whole(input.barbedWireStrands);
  const barbedLength = sanitize(input.barbedWireRollLength);
  const barbedWireRolls = strands && barbedLength ? Math.ceil((meshLength * strands * factor) / barbedLength) : 0;

  const concreteVolume = posts * sanitize(input.concretePerPost);
  const cementBags = Math.ceil(concreteVolume * sanitize(input.cementBagsPerCubicMeter));

  const postCost = postPieces * sanitize(prices.postPiece);
  const railCost = railPieces * sanitize(prices.railPiece);
  const meshCost = meshRolls * sanitize(prices.meshRoll);
  const barbedWireCost = barbedWireRolls * sanitize(prices.barbedWireRoll);
  const cementCost = cementBags * sanitize(prices.cementBag);
  const gateCost = gates * sanitize(prices.gate);
  const accessoriesCost = posts * sanitize(prices.accessoriesPerPost);
  const materialsCost = postCost + railCost + meshCost + barbedWireCost + cementCost + gateCost + accessoriesCost;
  const laborCost = length * sanitize(prices.laborMeter);

  return {
    fenceLength: length, posts, postPieces, railPieces, meshRolls, barbedWireRolls, concreteVolume,
    cementBags, gates, postCost, railCost, meshCost, barbedWireCost, cementCost, gateCost,
    accessoriesCost, materialsCost, laborCost, totalCost: materialsCost + laborCost,
  };
}

// ---------------------------------------------------------------------------
// Puertas y ventanas
// ---------------------------------------------------------------------------

export type OpeningsInput = {
  doorCount: number;
  doorWidth: number;
  doorHeight: number;
  windowCount: number;
  windowWidth: number;
  windowHeight: number;
  /** Metros de junta que rinde un cartucho de sellador. */
  sealantMetersPerCartridge: number;
  hingesPerDoor: number;
  locksPerDoor: number;
  includeGlass: boolean;
  glassWastePercentage: number;
};

export type OpeningsPrices = {
  door: number;
  window: number;
  hinge: number;
  lock: number;
  glassSquareMeter: number;
  sealantCartridge: number;
  laborDoor: number;
  laborWindow: number;
};

export type OpeningsResult = {
  doors: number;
  windows: number;
  doorArea: number;
  windowArea: number;
  openingsArea: number;
  framePerimeter: number;
  hinges: number;
  locks: number;
  glassArea: number;
  sealantCartridges: number;
  doorCost: number;
  windowCost: number;
  hingeCost: number;
  lockCost: number;
  glassCost: number;
  sealantCost: number;
  materialsCost: number;
  laborCost: number;
  totalCost: number;
};

export function emptyOpeningsResult(): OpeningsResult {
  return {
    doors: 0, windows: 0, doorArea: 0, windowArea: 0, openingsArea: 0, framePerimeter: 0,
    hinges: 0, locks: 0, glassArea: 0, sealantCartridges: 0, doorCost: 0, windowCost: 0,
    hingeCost: 0, lockCost: 0, glassCost: 0, sealantCost: 0, materialsCost: 0, laborCost: 0,
    totalCost: 0,
  };
}

export function calculateOpenings(input: OpeningsInput, prices: OpeningsPrices): OpeningsResult {
  const doors = whole(input.doorCount);
  const windows = whole(input.windowCount);
  if (!doors && !windows) return emptyOpeningsResult();

  const doorW = sanitize(input.doorWidth);
  const doorH = sanitize(input.doorHeight);
  const winW = sanitize(input.windowWidth);
  const winH = sanitize(input.windowHeight);

  const doorArea = doors * doorW * doorH;
  const windowArea = windows * winW * winH;
  const framePerimeter = doors * (2 * doorH + doorW) + windows * 2 * (winW + winH);

  const hinges = doors * whole(input.hingesPerDoor);
  const locks = doors * whole(input.locksPerDoor);
  const glassArea = input.includeGlass ? windowArea * (1 + pct(input.glassWastePercentage)) : 0;
  const perCartridge = sanitize(input.sealantMetersPerCartridge);
  const sealantCartridges = perCartridge ? Math.ceil((windows ? windows * 2 * (winW + winH) : 0) / perCartridge) : 0;

  const doorCost = doors * sanitize(prices.door);
  const windowCost = windows * sanitize(prices.window);
  const hingeCost = hinges * sanitize(prices.hinge);
  const lockCost = locks * sanitize(prices.lock);
  const glassCost = glassArea * sanitize(prices.glassSquareMeter);
  const sealantCost = sealantCartridges * sanitize(prices.sealantCartridge);
  const materialsCost = doorCost + windowCost + hingeCost + lockCost + glassCost + sealantCost;
  const laborCost = doors * sanitize(prices.laborDoor) + windows * sanitize(prices.laborWindow);

  return {
    doors, windows, doorArea, windowArea, openingsArea: doorArea + windowArea, framePerimeter,
    hinges, locks, glassArea, sealantCartridges, doorCost, windowCost, hingeCost, lockCost,
    glassCost, sealantCost, materialsCost, laborCost, totalCost: materialsCost + laborCost,
  };
}
