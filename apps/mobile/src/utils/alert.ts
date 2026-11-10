import { Alert, type AlertButton, Platform } from "react-native";

/**
 * Muestra una alerta compatible con web y nativo.
 * En web, usa `window.alert` (sin soporte de múltiples botones con callback).
 * En nativo, delega a `Alert.alert` de React Native.
 */
export function showAlert(
  title: string,
  message: string,
  buttons?: AlertButton[],
): void {
  if (Platform.OS === "web") {
    alert(`${title}\n\n${message}`);
    if (buttons && buttons.length > 0) {
      const okButton =
        buttons.find(
          (b) =>
            b.text === "Entendido" ||
            b.text === "OK" ||
            Boolean(b.onPress),
        ) ?? buttons[0];
      if (okButton?.onPress) {
        okButton.onPress();
      }
    }
  } else {
    Alert.alert(title, message, buttons);
  }
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
