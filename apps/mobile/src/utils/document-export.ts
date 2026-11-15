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

const PRINT_ROOT_ID = "leuret-print-root";
const PRINT_STYLE_ID = "leuret-print-style";

/**
 * Adapta el CSS del documento al shadow root: `html`/`body` pasan a ser el
 * contenedor del documento y las reglas `@page` se sacan (solo funcionan en
 * la hoja de estilos de la página).
 */
export function scopeDocumentCss(css: string): { css: string; pageRules: string } {
  const pageRules: string[] = [];
  const withoutPage = css.replace(/@page\b[^{]*\{[^}]*\}/g, (rule) => {
    pageRules.push(rule);
    return "";
  });
  const scoped = withoutPage
    .replace(/(^|[\s,}])html(?=[\s,{.:#[])/g, "$1.leuret-doc")
    .replace(/(^|[\s,}])body(?=[\s,{.:#[])/g, "$1.leuret-doc");
  return { css: scoped, pageRules: pageRules.join("\n") };
}

/**
 * En la web, `expo-print` imprime la página de la app y no el HTML que se le
 * pasa, y Safari en iPhone/iPad imprime la página completa aunque se pida
 * imprimir un marco. Por eso el documento se monta dentro de la propia página
 * (en un shadow root, para que sus estilos no toquen la app), se oculta la
 * app solo al imprimir y se llama a `window.print()`: el navegador ofrece
 * «Guardar como PDF» con el documento real, no una captura de la pantalla.
 */
function printHtmlInBrowser(html: string, title: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (typeof document === "undefined" || typeof window === "undefined") {
      reject(new Error("La impresión solo está disponible en el navegador."));
      return;
    }

    document.getElementById(PRINT_ROOT_ID)?.remove();
    document.getElementById(PRINT_STYLE_ID)?.remove();

    const parsed = new DOMParser().parseFromString(html, "text/html");
    const rawCss = Array.from(parsed.querySelectorAll("style")).map((style) => style.textContent ?? "").join("\n");
    const { css, pageRules } = scopeDocumentCss(rawCss);

    const host = document.createElement("div");
    host.id = PRINT_ROOT_ID;
    host.setAttribute("aria-hidden", "true");
    const shadow = host.attachShadow({ mode: "open" });
    shadow.innerHTML = `<style>:host{display:block}.leuret-doc{display:block}${css}</style><div class="leuret-doc">${parsed.body.innerHTML}</div>`;

    const pageStyle = document.createElement("style");
    pageStyle.id = PRINT_STYLE_ID;
    pageStyle.textContent = `
      #${PRINT_ROOT_ID} { display: none; }
      ${pageRules || "@page { size: A4; margin: 14mm; }"}
      @media print {
        html, body { height: auto !important; min-height: 0 !important; overflow: visible !important; background: #fff !important; }
        body > *:not(#${PRINT_ROOT_ID}) { display: none !important; }
        #${PRINT_ROOT_ID} { display: block !important; }
      }
    `;

    document.head.appendChild(pageStyle);
    document.body.appendChild(host);

    const previousTitle = document.title;
    document.title = title;

    let cleaned = false;
    const cleanup = () => {
      if (cleaned) return;
      cleaned = true;
      document.title = previousTitle;
      window.removeEventListener("afterprint", onAfterPrint);
      // Safari en iPhone vuelve de `print()` antes de cerrar la vista previa:
      // se espera un poco antes de quitar el documento.
      window.setTimeout(() => {
        host.remove();
        pageStyle.remove();
      }, 1500);
    };
    const onAfterPrint = () => cleanup();
    window.addEventListener("afterprint", onAfterPrint);

    const images = Array.from(shadow.querySelectorAll("img"));
    const imagesReady = Promise.all(images.map((image) => image.complete
      ? Promise.resolve()
      : new Promise<void>((done) => {
          image.addEventListener("load", () => done(), { once: true });
          image.addEventListener("error", () => done(), { once: true });
          window.setTimeout(done, 2500);
        })));

    void imagesReady.then(() => {
      try {
        window.print();
        resolve();
      } catch (error) {
        cleanup();
        reject(error instanceof Error ? error : new Error("No se pudo abrir la impresión."));
      }
    });
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
