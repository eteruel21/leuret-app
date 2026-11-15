/**
 * Alcance de la calculadora de electricidad: qué incluye el trabajo, qué
 * precios hacen falta y cómo se describe la partida del presupuesto.
 * Sin dependencias de React para poder probarse.
 */

export type ElectricalScope = {
  /** Cable y tubería desde el panel hasta cada punto. */
  includeWiring: boolean;
  /** Cajas eléctricas (una por punto). */
  includeBoxes: boolean;
  /** Circuitos nuevos con su breaker. */
  includeBreakers: boolean;
  /** Cinta, conectores, grapas… (monto global). */
  includeSupplies: boolean;
  includeLabor: boolean;
};

export type ElectricalPreset = "devices" | "full" | "custom";

/** Cambio o reposición: solo las piezas y su instalación. */
export const DEVICES_ONLY_SCOPE: ElectricalScope = {
  includeWiring: false,
  includeBoxes: false,
  includeBreakers: false,
  includeSupplies: false,
  includeLabor: true,
};

/** Instalación nueva completa. */
export const FULL_INSTALL_SCOPE: ElectricalScope = {
  includeWiring: true,
  includeBoxes: true,
  includeBreakers: true,
  includeSupplies: true,
  includeLabor: true,
};

const SCOPE_KEYS: (keyof ElectricalScope)[] = [
  "includeWiring",
  "includeBoxes",
  "includeBreakers",
  "includeSupplies",
  "includeLabor",
];

function sameScope(a: ElectricalScope, b: ElectricalScope): boolean {
  return SCOPE_KEYS.every((key) => a[key] === b[key]);
}

export function scopePreset(scope: ElectricalScope): ElectricalPreset {
  if (sameScope(scope, DEVICES_ONLY_SCOPE)) return "devices";
  if (sameScope(scope, FULL_INSTALL_SCOPE)) return "full";
  return "custom";
}

/** Acepta un alcance guardado (puede venir incompleto o de una versión anterior). */
export function normalizeScope(value: unknown, fallback: ElectricalScope = FULL_INSTALL_SCOPE): ElectricalScope {
  const source = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const next = { ...fallback };
  for (const key of SCOPE_KEYS) {
    if (typeof source[key] === "boolean") next[key] = source[key] as boolean;
  }
  return next;
}

export type ElectricalCounts = {
  lightPoints: number;
  switchPoints: number;
  outletPoints: number;
  dedicatedPoints: number;
};

export type ElectricalPriceTarget =
  | "lightingCable"
  | "powerCable"
  | "conduit"
  | "box"
  | "outlet"
  | "dedicatedOutlet"
  | "switch"
  | "breaker"
  | "supplies"
  | "standardLabor"
  | "dedicatedLabor";

function whole(value: number): number {
  return Number.isFinite(value) && value > 0 ? Math.round(value) : 0;
}

/** Precios que el trabajo necesita, en el orden en que se muestran. */
export function relevantPriceTargets(counts: ElectricalCounts, scope: ElectricalScope): ElectricalPriceTarget[] {
  const light = whole(counts.lightPoints);
  const switches = whole(counts.switchPoints);
  const outlets = whole(counts.outletPoints);
  const dedicated = whole(counts.dedicatedPoints);
  const standard = light + switches + outlets;
  const total = standard + dedicated;
  const targets: ElectricalPriceTarget[] = [];

  if (outlets > 0) targets.push("outlet");
  if (dedicated > 0) targets.push("dedicatedOutlet");
  if (switches > 0) targets.push("switch");
  if (scope.includeLabor && standard > 0) targets.push("standardLabor");
  if (scope.includeLabor && dedicated > 0) targets.push("dedicatedLabor");
  if (scope.includeWiring && light + switches > 0) targets.push("lightingCable");
  if (scope.includeWiring && outlets + dedicated > 0) targets.push("powerCable");
  if (scope.includeWiring && total > 0) targets.push("conduit");
  if (scope.includeBoxes && total > 0) targets.push("box");
  if (scope.includeBreakers && total > 0) targets.push("breaker");
  if (scope.includeSupplies && total > 0) targets.push("supplies");
  return targets;
}

function plural(count: number, singular: string, pluralForm: string): string {
  return `${count} ${count === 1 ? singular : pluralForm}`;
}

function joinList(parts: string[]): string {
  if (parts.length <= 1) return parts[0] ?? "";
  return `${parts.slice(0, -1).join(", ")} y ${parts[parts.length - 1]}`;
}

/** Lista legible de lo que se cotiza: «6 tomacorrientes y 2 interruptores». */
export function electricalCountsLabel(counts: ElectricalCounts): string {
  const parts: string[] = [];
  const light = whole(counts.lightPoints);
  const switches = whole(counts.switchPoints);
  const outlets = whole(counts.outletPoints);
  const dedicated = whole(counts.dedicatedPoints);
  if (light) parts.push(plural(light, "punto de luz", "puntos de luz"));
  if (switches) parts.push(plural(switches, "interruptor", "interruptores"));
  if (outlets) parts.push(plural(outlets, "tomacorriente", "tomacorrientes"));
  if (dedicated) parts.push(plural(dedicated, "tomacorriente de 240 V", "tomacorrientes de 240 V"));
  return joinList(parts);
}

/** Qué incluye además de las piezas: «cableado, tubería, cajas y breakers». */
export function electricalIncludesLabel(scope: ElectricalScope): string {
  const parts: string[] = [];
  if (scope.includeWiring) parts.push("cableado", "tubería");
  if (scope.includeBoxes) parts.push("cajas");
  if (scope.includeBreakers) parts.push("breakers");
  if (scope.includeSupplies) parts.push("accesorios");
  return joinList(parts);
}

/**
 * Descripción, unidad y cantidad de la partida.
 *
 * - Un solo tipo de pieza → la cantidad es esa pieza («6 und.» de tomacorriente).
 * - Varios tipos → la cantidad son los puntos.
 * - «Suministro e instalación», «Suministro» o «Instalación» según haya
 *   materiales y mano de obra con costo.
 */
export function electricalBudgetLine(
  counts: ElectricalCounts,
  scope: ElectricalScope,
  costs: { materialsCost: number; laborCost: number },
): { description: string; unitName: string; quantity: number } {
  const light = whole(counts.lightPoints);
  const switches = whole(counts.switchPoints);
  const outlets = whole(counts.outletPoints);
  const dedicated = whole(counts.dedicatedPoints);
  const total = light + switches + outlets + dedicated;
  const kinds = [light, switches, outlets, dedicated].filter((value) => value > 0).length;

  const hasMaterials = costs.materialsCost > 0;
  const hasLabor = scope.includeLabor && costs.laborCost > 0;
  const action = hasMaterials && hasLabor
    ? "Suministro e instalación de"
    : hasMaterials
      ? "Suministro de"
      : "Instalación de";

  const includes = electricalIncludesLabel(scope);
  const suffix = includes ? ` (incluye ${includes})` : "";
  const description = `${action} ${electricalCountsLabel(counts)}${suffix}`;

  if (kinds === 1) {
    return { description, unitName: "und.", quantity: total };
  }
  return { description, unitName: "punto", quantity: total };
}
