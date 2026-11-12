import { Platform, Share } from "react-native";

export type ShareTextResult = "shared" | "copied" | "dismissed";

/**
 * Comparte un texto. En el teléfono abre la hoja de compartir. En la web usa
 * la función de compartir del navegador si existe y, si no (Firefox y la
 * mayoría de navegadores de escritorio), copia el texto al portapapeles.
 */
export async function shareText({
  title,
  message,
}: {
  title: string;
  message: string;
}): Promise<ShareTextResult> {
  if (Platform.OS !== "web") {
    const result = await Share.share({ title, message });
    return result.action === Share.dismissedAction ? "dismissed" : "shared";
  }

  const nav = typeof navigator !== "undefined" ? navigator : undefined;

  if (nav && typeof nav.share === "function") {
    try {
      await nav.share({ title, text: message });
      return "shared";
    } catch (error) {
      // El usuario cerró la hoja de compartir: no es un error.
      if (error instanceof Error && error.name === "AbortError") return "dismissed";
      // Otro fallo (permiso, contexto no seguro): se intenta copiar.
    }
  }

  if (nav?.clipboard?.writeText) {
    await nav.clipboard.writeText(message);
    return "copied";
  }

  throw new Error("Este navegador no permite compartir ni copiar el texto.");
}
