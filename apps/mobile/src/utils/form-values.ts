/** Convierte un texto con coma o punto decimal en número (NaN si no es válido). */
export function parseDecimal(value: string): number {
  const clean = value.trim().replace(/\s/g, "").replace(",", ".");
  if (!clean) return Number.NaN;
  return Number(clean);
}

/** Fecha AAAA-MM-DD que existe en el calendario. */
export function isDateKey(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number) as [number, number, number];
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}
