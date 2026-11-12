import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import { Platform } from "react-native";

type ExportHtmlInput = {
  html: string;
  /** Título del documento; en la web es el nombre sugerido al guardar el PDF. */
  title: string;
  /** Título de la hoja de compartir en el teléfono. */
  dialogTitle?: string;
};

export type ExportHtmlResult = {
  uri: string | null;
  error: string | null;
};

/** Pone el título en el <title> del HTML para que el PDF guardado lo use. */
export function withDocumentTitle(html: string, title: string): string {
  const safeTitle = title
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  if (/<title>[\s\S]*?<\/title>/i.test(html)) {
    return html.replace(/<title>[\s\S]*?<\/title>/i, `<title>${safeTitle}</title>`);
  }
  if (/<head[^>]*>/i.test(html)) {
    return html.replace(/<head[^>]*>/i, (head) => `${head}<title>${safeTitle}</title>`);
  }
  return `<title>${safeTitle}</title>${html}`;
}

/**
 * En la web, `expo-print` imprime la página de la app y no el HTML que se le
 * pasa. Aquí el documento se carga en un marco oculto y se imprime ese marco:
 * el navegador ofrece «Guardar como PDF».
 */
function printHtmlInBrowser(html: string, title: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (typeof document === "undefined") {
      reject(new Error("La impresión solo está disponible en el navegador."));
      return;
    }

    const frame = document.createElement("iframe");
    frame.setAttribute("aria-hidden", "true");
    frame.style.position = "fixed";
    frame.style.right = "0";
    frame.style.bottom = "0";
    frame.style.width = "0";
    frame.style.height = "0";
    frame.style.border = "0";

    let settled = false;
    const cleanup = () => {
      window.setTimeout(() => frame.remove(), 1000);
    };

    frame.onload = () => {
      if (settled) return;
      settled = true;
      const frameWindow = frame.contentWindow;
      if (!frameWindow) {
        cleanup();
        reject(new Error("El navegador bloqueó la vista de impresión."));
        return;
      }

      const previousTitle = document.title;
      document.title = title;
      frameWindow.addEventListener("afterprint", () => {
        document.title = previousTitle;
        cleanup();
      });

      // Deja que carguen fuentes e imágenes (logo) antes de imprimir.
      window.setTimeout(() => {
        try {
          frameWindow.focus();
          frameWindow.print();
          resolve();
        } catch (error) {
          document.title = previousTitle;
          cleanup();
          reject(error instanceof Error ? error : new Error("No se pudo abrir la impresión."));
        }
      }, 350);
    };

    frame.srcdoc = withDocumentTitle(html, title);
    document.body.appendChild(frame);
  });
}

/**
 * Genera un PDF a partir de HTML y lo comparte (teléfono) o abre la vista de
 * impresión para guardarlo como PDF (web).
 */
export async function exportHtmlDocument({
  html,
  title,
  dialogTitle,
}: ExportHtmlInput): Promise<ExportHtmlResult> {
  try {
    if (Platform.OS === "web") {
      await printHtmlInBrowser(html, title);
      return { uri: null, error: null };
    }

    const { uri } = await Print.printToFileAsync({ html, base64: false });

    if (!(await Sharing.isAvailableAsync())) {
      return {
        uri,
        error: "Este dispositivo no permite compartir archivos desde la app.",
      };
    }

    await Sharing.shareAsync(uri, {
      mimeType: "application/pdf",
      dialogTitle: dialogTitle ?? title,
      UTI: "com.adobe.pdf",
    });

    return { uri, error: null };
  } catch (error) {
    return {
      uri: null,
      error: error instanceof Error ? error.message : "No fue posible generar el PDF.",
    };
  }
}
