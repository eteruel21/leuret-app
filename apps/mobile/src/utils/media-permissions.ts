import * as ImagePicker from "expo-image-picker";
import { Alert, Linking, Platform } from "react-native";

export type PhotoSource = "camera" | "library";

/**
 * Permiso para tomar o elegir fotos.
 * - Galería: el selector del sistema (iOS 14+, Android) no necesita permiso,
 *   así que no se pide: el usuario elige la foto y la app solo recibe esa.
 * - Cámara: se pide al momento. Si el usuario la bloqueó antes, se ofrece
 *   abrir los ajustes del teléfono en lugar de mostrar un error.
 * Devuelve false si no hay permiso (se trata como «cancelado»).
 */
export async function ensurePhotoPermission(source: PhotoSource): Promise<boolean> {
  if (Platform.OS === "web" || source === "library") return true;

  const current = await ImagePicker.getCameraPermissionsAsync();
  if (current.granted) return true;

  if (current.canAskAgain) {
    const requested = await ImagePicker.requestCameraPermissionsAsync();
    if (requested.granted) return true;
    if (requested.canAskAgain) return false;
  }

  Alert.alert(
    "Permiso de cámara",
    "Leuret no tiene acceso a la cámara. Puedes activarlo en los ajustes del teléfono o elegir una foto de la galería.",
    [
      { text: "Ahora no", style: "cancel" },
      { text: "Abrir ajustes", onPress: () => void Linking.openSettings() },
    ],
  );
  return false;
}
