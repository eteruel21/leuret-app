/** Si el widget no entrega token ni error en este tiempo, mostramos ayuda. */
export const TURNSTILE_STALL_MS = 15_000;

export type TurnstileStallGuard = {
  /**
   * El widget respondió: entregó token, dio error o pidió la casilla
   * («before-interactive-callback»). En los tres casos ya no está trabado.
   */
  stop: () => void;
  /** Indica si el aviso de «trabado» todavía puede mostrarse. */
  isPending: () => boolean;
};

/**
 * Temporizador que avisa cuando Turnstile no responde.
 *
 * En modo «managed», Cloudflare puede pedir a la persona que marque la
 * casilla. Eso no es una falla: el widget está esperando a la persona. Sin
 * detener el temporizador en ese momento, a los 15 s aparecía «No pudimos
 * completar la verificación de seguridad» junto a una casilla válida.
 */
export function createTurnstileStallGuard(
  onStall: () => void,
  timeoutMs: number = TURNSTILE_STALL_MS,
): TurnstileStallGuard {
  let timer: ReturnType<typeof setTimeout> | null = setTimeout(() => {
    timer = null;
    onStall();
  }, timeoutMs);

  return {
    stop: () => {
      if (timer !== null) {
        clearTimeout(timer);
        timer = null;
      }
    },
    isPending: () => timer !== null,
  };
}
