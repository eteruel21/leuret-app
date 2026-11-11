import type { BudgetItem, BudgetItemMaterial } from "../types/budget";
import { normalizeCatalogText } from "./calculators/catalog-pricing";

export type { BudgetItemMaterial };

/**
 * Crea una línea de material para guardar con la partida. Devuelve null si
 * la cantidad no es positiva, para poder filtrar con compactMaterials.
 */
export function material(
  name: string,
  quantity: number,
  unit: string,
  cost?: number,
): BudgetItemMaterial | null {
  if (!Number.isFinite(quantity) || quantity <= 0) return null;

  const line: BudgetItemMaterial = {
    name: name.trim(),
    quantity: roundTo(quantity, 3),
    unit: unit.trim() || "und.",
  };

  if (cost !== undefined && Number.isFinite(cost) && cost > 0) {
    line.cost = roundTo(cost, 2);
  }

  return line;
}

export function compactMaterials(
  lines: Array<BudgetItemMaterial | null | false | undefined>,
): BudgetItemMaterial[] {
  return lines.filter((line): line is BudgetItemMaterial => Boolean(line));
}

export type ShoppingListLine = {
  key: string;
  name: string;
  unit: string;
  quantity: number;
  cost: number | null;
  sources: string[];
};

export type ShoppingList = {
  lines: ShoppingListLine[];
  /** Partidas sin desglose de materiales (servicios, subcontratos, manuales). */
  unbrokenItems: BudgetItem[];
  /** Suma de los costos conocidos. */
  knownCost: number;
  /** Líneas sin costo estimado. */
  linesWithoutCost: number;
};

const DIRECT_TYPES = new Set(["material", "equipment"]);
const SKIPPED_TYPES = new Set(["labor"]);

/**
 * Agrupa los materiales de un presupuesto en una lista de compras:
 * - partidas de material o equipo del catálogo, tal cual;
 * - materiales guardados por las calculadoras en cada partida;
 * - el resto (servicios sin desglose, manuales) se listan aparte.
 * La mano de obra no entra.
 */
export function buildShoppingList(items: BudgetItem[]): ShoppingList {
  const lines = new Map<string, ShoppingListLine>();
  const unbrokenItems: BudgetItem[] = [];

  const add = (entry: BudgetItemMaterial, source: string) => {
    const key = `${normalizeCatalogText(entry.name)}|${normalizeCatalogText(entry.unit)}`;
    const current = lines.get(key);

    if (current) {
      current.quantity = roundTo(current.quantity + entry.quantity, 3);
      if (entry.cost !== undefined) {
        current.cost = roundTo((current.cost ?? 0) + entry.cost, 2);
      }
      if (!current.sources.includes(source)) current.sources.push(source);
      return;
    }

    lines.set(key, {
      key,
      name: entry.name,
      unit: entry.unit,
      quantity: entry.quantity,
      cost: entry.cost ?? null,
      sources: [source],
    });
  };

  for (const item of items) {
    if (SKIPPED_TYPES.has(item.item_type)) continue;

    const materials = Array.isArray(item.materials) ? item.materials : [];

    if (materials.length > 0) {
      for (const entry of materials) {
        if (entry && entry.quantity > 0 && entry.name) add(entry, item.description);
      }
      continue;
    }

    if (DIRECT_TYPES.has(item.item_type)) {
      const unitCost = item.unit_cost > 0 ? item.unit_cost : item.unit_price;
      const line = material(
        item.description,
        item.quantity,
        item.unit_name,
        unitCost * item.quantity,
      );
      if (line) add(line, item.description);
      continue;
    }

    unbrokenItems.push(item);
  }

  const sorted = [...lines.values()].sort((a, b) =>
    a.name.localeCompare(b.name, "es"),
  );

  return {
    lines: sorted,
    unbrokenItems,
    knownCost: roundTo(
      sorted.reduce((sum, line) => sum + (line.cost ?? 0), 0),
      2,
    ),
    linesWithoutCost: sorted.filter((line) => line.cost === null).length,
  };
}

type MatchableCatalogItem = {
  id: string;
  name: string;
  item_type: string;
  sku?: string | null;
  category?: { name: string } | null;
};

const STOP_WORDS = new Set(["con", "para", "por", "del", "las", "los", "una", "unidad", "unidades"]);

function words(value: string): string[] {
  return normalizeCatalogText(value)
    .split(/[^a-z0-9#]+/)
    .filter((word) => word.length >= 3 && !STOP_WORDS.has(word));
}

/**
 * Busca en el catálogo los insumos que más se parecen a una línea de la lista
 * de compras (por palabras en común), para que el usuario elija a cuál
 * agregarle el precio. Con búsqueda, filtra por el texto escrito.
 * Solo materiales y equipos; la mano de obra no va en la lista de compras.
 */
export function rankCatalogMatches<T extends MatchableCatalogItem>(
  lineName: string,
  items: T[],
  search = "",
  limit = 30,
): T[] {
  const candidates = items.filter(
    (item) => item.item_type === "material" || item.item_type === "equipment",
  );
  const query = normalizeCatalogText(search);

  if (query) {
    return candidates
      .filter((item) =>
        [item.name, item.sku ?? "", item.category?.name ?? ""].some((value) =>
          normalizeCatalogText(value).includes(query),
        ),
      )
      .slice(0, limit);
  }

  const target = words(lineName);
  if (!target.length) return [];

  return candidates
    .map((item, index) => {
      const itemWords = new Set(words(item.name));
      const score = target.filter((word) =>
        [...itemWords].some((candidate) => candidate.startsWith(word) || word.startsWith(candidate)),
      ).length;
      return { item, index, score };
    })
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .slice(0, limit)
    .map((entry) => entry.item);
}

/**
 * Aplica a la lista los costos unitarios que el usuario agregó en la sesión
 * (por clave de línea) a las líneas que no tenían costo.
 */
export function withAddedUnitCosts(
  list: ShoppingList,
  unitCosts: Record<string, number>,
): ShoppingList {
  const lines = list.lines.map((line) => {
    const unitCost = unitCosts[line.key];
    if (line.cost !== null || !unitCost || unitCost <= 0) return line;
    return { ...line, cost: roundTo(unitCost * line.quantity, 2) };
  });

  return {
    ...list,
    lines,
    knownCost: roundTo(lines.reduce((sum, line) => sum + (line.cost ?? 0), 0), 2),
    linesWithoutCost: lines.filter((line) => line.cost === null).length,
  };
}

export function formatQuantity(value: number): string {
  const rounded = roundTo(value, 2);
  return Number.isInteger(rounded)
    ? String(rounded)
    : rounded.toFixed(2).replace(/0$/, "");
}

/** Texto plano para compartir por WhatsApp o correo. */
export function shoppingListText(
  list: ShoppingList,
  options: {
    title: string;
    formatMoney: (value: number) => string;
  },
): string {
  const rows = list.lines.map((line) => {
    const cost = line.cost !== null ? ` (${options.formatMoney(line.cost)})` : "";
    return `• ${formatQuantity(line.quantity)} ${line.unit} — ${line.name}${cost}`;
  });

  const parts = [`Lista de compras · ${options.title}`, "", ...rows];

  if (list.knownCost > 0) {
    parts.push("", `Costo estimado: ${options.formatMoney(list.knownCost)}`);
  }

  if (list.unbrokenItems.length > 0) {
    parts.push("", "Partidas sin desglose de materiales:");
    for (const item of list.unbrokenItems) {
      const notes = item.notes ? ` — ${item.notes}` : "";
      parts.push(
        `• ${item.description} (${formatQuantity(item.quantity)} ${item.unit_name})${notes}`,
      );
    }
  }

  return parts.join("\n");
}

function roundTo(value: number, digits: number) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}
