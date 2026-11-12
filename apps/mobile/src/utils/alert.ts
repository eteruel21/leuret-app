import { Alert, type AlertButton, Platform } from "react-native";

import { runWebDialog, type BrowserDialogs } from "./web-dialogs";

function browserDialogs(): BrowserDialogs | null {
  if (typeof window === "undefined") return null;
  return {
    alert: (text) => window.alert(text),
    confirm: (text) => window.confirm(text),
  };
}

/**
 * Muestra una alerta compatible con web y nativo.
 * En web usa los diálogos del navegador (ver `runWebDialog`): con una acción y
 * un «Cancelar» pide confirmación en vez de ejecutar la acción sin preguntar.
 */
export function showAlert(
  title: string,
  message: string,
  buttons?: AlertButton[],
): void {
  if (Platform.OS === "web") {
    const dialogs = browserDialogs();
    if (dialogs) runWebDialog(title, message, buttons, dialogs);
    return;
  }

  Alert.alert(title, message, buttons);
}

let webAlertInstalled = false;

/**
 * En React Native Web, `Alert.alert` no hace nada. Se reemplaza una sola vez
 * al iniciar la app para que todas las pantallas que lo usan muestren sus
 * mensajes y confirmaciones también en el navegador.
 */
export function installWebAlert(): void {
  if (Platform.OS !== "web" || webAlertInstalled) return;
  webAlertInstalled = true;

  const webAlert: typeof Alert.alert = (title, message, buttons) => {
    const dialogs = browserDialogs();
    if (dialogs) runWebDialog(title, message, buttons, dialogs);
  };
  (Alert as unknown as { alert: typeof Alert.alert }).alert = webAlert;
}

/**
 * Pide confirmación en web y nativo. En web `Alert.alert` con botones no
 * muestra nada, así que se usa `window.confirm`.
 */
export function confirmAction({
  title,
  message,
  confirmText = "Aceptar",
  cancelText = "Cancelar",
  destructive = false,
}: {
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  destructive?: boolean;
}): Promise<boolean> {
  if (Platform.OS === "web") {
    return Promise.resolve(
      typeof window !== "undefined" && window.confirm(`${title}\n\n${message}`),
    );
  }

  return new Promise((resolve) => {
    Alert.alert(
      title,
      message,
      [
        { text: cancelText, style: "cancel", onPress: () => resolve(false) },
        {
          text: confirmText,
          style: destructive ? "destructive" : "default",
          onPress: () => resolve(true),
        },
      ],
      { cancelable: true, onDismiss: () => resolve(false) },
    );
  });
}
