/**
 * Detección de navegadores integrados (WhatsApp, Instagram, Facebook,
 * TikTok…). En ellos la verificación de Cloudflare Turnstile suele fallar o
 * no cargar, así que ofrecemos abrir la página en Chrome o Safari.
 */

export type InAppBrowserInfo = {
  /** Nombre amigable de la app que abrió el enlace, o null si no se reconoce. */
  appName: string | null;
  isInAppBrowser: boolean;
  platform: "android" | "ios" | "other";
};

const IN_APP_PATTERNS: Array<{ name: string; pattern: RegExp }> = [
  { name: "Instagram", pattern: /Instagram/i },
  { name: "WhatsApp", pattern: /WhatsApp/i },
  { name: "Facebook", pattern: /FBAN|FBAV|FB_IAB|FBIOS|FB4A/i },
  { name: "Messenger", pattern: /MessengerForiOS|Orca-Android/i },
  { name: "TikTok", pattern: /musical_ly|BytedanceWebview|TikTok/i },
  { name: "Snapchat", pattern: /Snapchat/i },
  { name: "LinkedIn", pattern: /LinkedInApp/i },
  { name: "Telegram", pattern: /Telegram/i },
  { name: "LINE", pattern: /\bLine\//i },
];

export function detectInAppBrowser(userAgent: string | null | undefined): InAppBrowserInfo {
  const ua = userAgent ?? "";
  const platform: InAppBrowserInfo["platform"] = /Android/i.test(ua)
    ? "android"
    : /iPhone|iPad|iPod/i.test(ua)
      ? "ios"
      : "other";

  const match = IN_APP_PATTERNS.find(({ pattern }) => pattern.test(ua));
  if (match) {
    return { appName: match.name, isInAppBrowser: true, platform };
  }

  // WebView genérico de Android ("; wv)") sin Chrome real.
  if (platform === "android" && /; wv\)/i.test(ua)) {
    return { appName: null, isInAppBrowser: true, platform };
  }

  // iOS: WebView sin la marca "Safari/" ni otros navegadores conocidos.
  if (
    platform === "ios" &&
    /AppleWebKit/i.test(ua) &&
    !/Safari\//i.test(ua) &&
    !/CriOS|FxiOS|EdgiOS/i.test(ua)
  ) {
    return { appName: null, isInAppBrowser: true, platform };
  }

  return { appName: null, isInAppBrowser: false, platform };
}

/**
 * En Android, un enlace intent:// abre la misma URL directamente en Chrome.
 * Devuelve null si la URL no es http(s).
 */
export function buildOpenInChromeIntent(url: string): string | null {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
      return null;
    }
    const scheme = parsed.protocol.replace(":", "");
    const rest = `${parsed.host}${parsed.pathname}${parsed.search}${parsed.hash}`;
    return `intent://${rest}#Intent;scheme=${scheme};package=com.android.chrome;S.browser_fallback_url=${encodeURIComponent(url)};end`;
  } catch {
    return null;
  }
}

export function openInBrowserHint(info: InAppBrowserInfo): string {
  const source = info.appName ? `el navegador de ${info.appName}` : "este navegador integrado";
  if (info.platform === "ios") {
    return `La verificación de seguridad no funciona bien en ${source}. Toca ••• o el ícono de compartir y elige «Abrir en Safari».`;
  }
  if (info.platform === "android") {
    return `La verificación de seguridad no funciona bien en ${source}. Ábrelo en Chrome con el botón de abajo o desde el menú ⋮ → «Abrir en Chrome».`;
  }
  return `La verificación de seguridad no funciona bien en ${source}. Abre esta página en tu navegador habitual.`;
}
