// Reglas del aporte de precio de un insumo (sin dependencias de React Native).

/** Margen que usa el catálogo de plataforma: venta = costo × 1.35. */
export const CATALOG_MARKUP = 1.35;

export function parseAmount(value: string): number {
  const parsed = Number(value.replace(",", ".").trim());
  return Number.isFinite(parsed) ? parsed : 0;
}

export function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/** Valida y prepara el aporte. Devuelve un mensaje de error o los valores limpios. */
export function preparePriceContribution(input: {
  unitCost: string;
  salePrice: string;
}): { error: string } | { unitCost: number; salePrice: number | null } {
  const unitCost = round2(parseAmount(input.unitCost));
  if (unitCost <= 0) return { error: "Escribe lo que te cuesta el insumo (mayor que cero)." };
  if (unitCost >= 1_000_000) return { error: "El precio es demasiado alto." };

  if (!input.salePrice.trim()) return { unitCost, salePrice: null };
  const salePrice = round2(parseAmount(input.salePrice));
  if (salePrice <= 0) return { error: "El precio de venta debe ser mayor que cero, o déjalo vacío." };
  if (salePrice >= 1_000_000) return { error: "El precio de venta es demasiado alto." };
  return { unitCost, salePrice };
}
