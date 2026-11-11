import { manipulateAsync, SaveFormat } from "expo-image-manipulator";
import * as ImagePicker from "expo-image-picker";
import { Platform } from "react-native";

export type AvatarPhotoSource = "camera" | "library";

export type PreparedAvatarPhoto = {
  fileData: string;
  mimeType: "image/jpeg";
  previewUri: string;
};

const AVATAR_SIZE = 512;

async function ensurePermission(source: AvatarPhotoSource): Promise<void> {
  if (Platform.OS === "web") return;
  const permission = source === "camera"
    ? await ImagePicker.requestCameraPermissionsAsync()
    : await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) {
    throw new Error(source === "camera"
      ? "Se necesita permiso para usar la cámara."
      : "Se necesita permiso para acceder a la galería.");
  }
}

/**
 * Selecciona una foto de perfil, la recorta en cuadrado (centrada)
 * y la reduce a 512 px para que cargue rápido en el avatar.
 */
export async function prepareAvatarPhoto(source: AvatarPhotoSource): Promise<PreparedAvatarPhoto | null> {
  await ensurePermission(source);
  const options: ImagePicker.ImagePickerOptions = {
    mediaTypes: ["images"],
    allowsEditing: Platform.OS !== "web",
    aspect: [1, 1],
    quality: 1,
  };
  const result = source === "camera"
    ? await ImagePicker.launchCameraAsync(options)
    : await ImagePicker.launchImageLibraryAsync(options);
  if (result.canceled || !result.assets?.length) return null;

  const asset = result.assets[0];
  const side = Math.min(asset.width, asset.height);
  const actions: NonNullable<Parameters<typeof manipulateAsync>[1]> = [];
  if (asset.width !== asset.height && side > 0) {
    actions.push({
      crop: {
        originX: Math.floor((asset.width - side) / 2),
        originY: Math.floor((asset.height - side) / 2),
        width: side,
        height: side,
      },
    });
  }
  if (side > AVATAR_SIZE) {
    actions.push({ resize: { width: AVATAR_SIZE, height: AVATAR_SIZE } });
  }

  const processed = await manipulateAsync(asset.uri, actions, {
    compress: 0.82,
    format: SaveFormat.JPEG,
    base64: true,
  });
  if (!processed.base64) throw new Error("No fue posible procesar la imagen seleccionada.");

  return { fileData: processed.base64, mimeType: "image/jpeg", previewUri: processed.uri };
}
