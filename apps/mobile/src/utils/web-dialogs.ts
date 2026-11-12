/**
 * Diálogos para la versión web.
 *
 * En React Native Web, `Alert.alert` no muestra nada: los mensajes de error no
 * se veían y los botones que pedían confirmación (eliminar, salir, anular…)
 * nunca ejecutaban su acción. Este módulo traduce un `Alert.alert` a los
 * diálogos del navegador:
 *
 * - Sin botones o con un solo botón → `alert` y luego la acción del botón.
 * - Una acción y un «Cancelar» → `confirm`: Aceptar ejecuta la acción.
 * - Varias acciones → un `confirm` por acción hasta que el usuario acepte una.
 *
 * No depende de React Native para poder probarse sin el entorno de la app.
 */

export type WebDialogButton = {
  text?: string;
  style?: "default" | "cancel" | "destructive";
  onPress?: (value?: string) => unknown;
};

export type BrowserDialogs = {
  alert: (message: string) => void;
  confirm: (message: string) => boolean;
};

export function dialogText(title: string, message?: string): string {
  const cleanTitle = (title ?? "").trim();
  const cleanMessage = (message ?? "").trim();
  if (!cleanMessage) return cleanTitle;
  if (!cleanTitle) return cleanMessage;
  return `${cleanTitle}\n\n${cleanMessage}`;
}

/**
 * Muestra el diálogo y devuelve el botón elegido (o `null` si no hubo botón).
 * Ejecuta el `onPress` del botón elegido.
 */
export function runWebDialog(
  title: string,
  message: string | undefined,
  buttons: readonly WebDialogButton[] | undefined,
  dialogs: BrowserDialogs,
): WebDialogButton | null {
  const text = dialogText(title, message);
  const list = (buttons ?? []).filter(Boolean);
  const cancelButton = list.find((button) => button.style === "cancel") ?? null;
  const actions = list.filter((button) => button.style !== "cancel");

  const choose = (button: WebDialogButton | null) => {
    if (button?.onPress) void button.onPress();
    return button;
  };

  // Solo informativo: un aviso y, si existe, la acción de su único botón.
  if (actions.length === 0) {
    dialogs.alert(text);
    return choose(cancelButton);
  }

  if (actions.length === 1 && !cancelButton) {
    dialogs.alert(text);
    return choose(actions[0]);
  }

  if (actions.length === 1) {
    const label = actions[0].text?.trim();
    const prompt = label ? `${text}\n\nAceptar: ${label}` : text;
    return choose(dialogs.confirm(prompt) ? actions[0] : cancelButton);
  }

  for (const action of actions) {
    const label = action.text?.trim() || "Continuar";
    if (dialogs.confirm(`${text}\n\n¿${label}?`)) {
      return choose(action);
    }
  }

  return choose(cancelButton);
}
