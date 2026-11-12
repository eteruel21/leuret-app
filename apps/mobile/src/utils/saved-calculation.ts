import type { BudgetLineDraft } from "@/services/budget-service";

/** Versión del formato de `input_data`; subirla si cambia la forma del estado. */
export const SAVED_CALCULATION_VERSION = 1;

function roundMoney(value: number): number {
  return Number.isFinite(value) && value > 0 ? Math.round(value * 100) / 100 : 0;
}

/**
 * Arma lo que se guarda de un cálculo:
 * - `inputData.state`: el estado de la calculadora para reabrirlo.
 * - `resultsData.lineItems`: la partida que se agregará al presupuesto
 *   (la misma que «Agregar al presupuesto»), con materiales.
 */
export function buildCalculationPayload<State extends object>({
  state,
  line,
  totalCost,
}: {
  state: State;
  line: BudgetLineDraft;
  totalCost: number;
}) {
  return {
    inputData: { version: SAVED_CALCULATION_VERSION, state },
    priceData: {},
    resultsData: { lineItems: [line] },
    totalCost: roundMoney(totalCost),
  };
}

/** Lee el estado guardado; `null` si el cálculo no trae uno reconocible. */
export function readCalculationState<State extends object>(
  inputData: Record<string, unknown> | null | undefined,
): Partial<State> | null {
  const state = inputData?.state;
  if (!state || typeof state !== "object" || Array.isArray(state)) return null;
  return state as Partial<State>;
}
