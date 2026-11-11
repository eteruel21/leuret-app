import { useState } from "react";
import {
  Image,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from "react-native";

type UserAvatarProps = {
  /** URL pública de la foto de perfil (profiles.avatar_url). */
  uri?: string | null;
  /** Texto a mostrar cuando no hay foto o no carga (inicial o iniciales). */
  fallback: string;
  size: number;
  style?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
};

/**
 * Avatar circular del usuario: muestra la foto de perfil y, si no existe
 * o falla la descarga, la inicial del nombre.
 */
export function UserAvatar({ uri, fallback, size, style, textStyle }: UserAvatarProps) {
  // Se guarda la URL que falló: si la foto cambia, se vuelve a intentar.
  const [failedUri, setFailedUri] = useState<string | null>(null);
  const showImage = Boolean(uri) && failedUri !== uri;

  return (
    <View
      style={[
        styles.base,
        { width: size, height: size, borderRadius: size / 2 },
        style,
      ]}
    >
      {showImage ? (
        <Image
          accessibilityIgnoresInvertColors
          accessibilityLabel="Foto de perfil"
          onError={() => setFailedUri(uri ?? null)}
          resizeMode="cover"
          source={{ uri: uri as string }}
          style={{ width: size, height: size, borderRadius: size / 2 }}
        />
      ) : (
        <Text style={textStyle}>{fallback}</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
});
