import {
  createElement,
  useEffect,
  useRef,
  useState,
} from "react";
import { Pressable, Text, View } from "react-native";

import {
  buildOpenInChromeIntent,
  detectInAppBrowser,
  openInBrowserHint,
} from "@/utils/in-app-browser";

import type {
  TurnstileChallengeProps,
} from "./TurnstileChallenge.types";

type TurnstileWidgetId = string;

type TurnstileOptions = {
  sitekey: string;
  action?: string;
  theme?: "light" | "dark" | "auto";
  size?: "normal" | "compact" | "flexible";
  callback?: (token: string) => void;
  "expired-callback"?: () => void;
  "timeout-callback"?: () => void;
  "error-callback"?: (code?: string) => void;
};

type TurnstileApi = {
  render: (
    container: HTMLElement | string,
    options: TurnstileOptions,
  ) => TurnstileWidgetId;
  remove: (widgetId: TurnstileWidgetId) => void;
};

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

/** Si el widget no entrega token ni error en este tiempo, mostramos ayuda. */
const TURNSTILE_STALL_MS = 15_000;

const TURNSTILE_SCRIPT_ID = "cloudflare-turnstile-script";
const TURNSTILE_SCRIPT_URL =
  "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

let turnstileLoader: Promise<TurnstileApi> | null = null;

function loadTurnstile(): Promise<TurnstileApi> {
  if (window.turnstile) {
    return Promise.resolve(window.turnstile);
  }

  if (turnstileLoader) {
    return turnstileLoader;
  }

  turnstileLoader = new Promise<TurnstileApi>((resolve, reject) => {
    const existing = document.getElementById(
      TURNSTILE_SCRIPT_ID,
    ) as HTMLScriptElement | null;

    const resolveWhenReady = () => {
      if (window.turnstile) {
        resolve(window.turnstile);
      } else {
        reject(new Error("Cloudflare Turnstile no quedó disponible."));
      }
    };

    if (existing) {
      if (window.turnstile) {
        resolve(window.turnstile);
        return;
      }

      existing.addEventListener("load", resolveWhenReady, { once: true });
      existing.addEventListener(
        "error",
        () => reject(new Error("No se pudo cargar Cloudflare Turnstile.")),
        { once: true },
      );
      return;
    }

    const script = document.createElement("script");
    script.id = TURNSTILE_SCRIPT_ID;
    script.src = TURNSTILE_SCRIPT_URL;
    script.async = true;
    script.defer = true;
    script.onload = resolveWhenReady;
    script.onerror = () =>
      reject(new Error("No se pudo cargar Cloudflare Turnstile."));

    document.head.appendChild(script);
  }).catch((error) => {
    turnstileLoader = null;
    throw error;
  });

  return turnstileLoader;
}

export default function TurnstileChallenge({
  action,
  onToken,
  resetKey = 0,
}: TurnstileChallengeProps) {
  const [containerElement, setContainerElement] = useState<HTMLDivElement | null>(null);
  const widgetIdRef = useRef<TurnstileWidgetId | null>(null);
  const onTokenRef = useRef(onToken);
  const [failed, setFailed] = useState(false);
  const [retryNonce, setRetryNonce] = useState(0);
  const [copied, setCopied] = useState(false);
  const browserInfo =
    typeof navigator === "undefined"
      ? null
      : detectInAppBrowser(navigator.userAgent);

  useEffect(() => {
    onTokenRef.current = onToken;
  }, [onToken]);

  useEffect(() => {
    const siteKey =
      process.env.EXPO_PUBLIC_TURNSTILE_SITE_KEY?.trim() ?? "";

    if (!siteKey || !containerElement) {
      onTokenRef.current(null);
      return;
    }

    let cancelled = false;
    let api: TurnstileApi | null = null;
    let settled = false;

    onTokenRef.current(null);
    setFailed(false);

    const markFailed = () => {
      if (!cancelled) {
        setFailed(true);
        onTokenRef.current(null);
      }
    };

    const stallTimer = setTimeout(() => {
      if (!settled) {
        markFailed();
      }
    }, TURNSTILE_STALL_MS);

    loadTurnstile()
      .then((turnstile) => {
        if (cancelled || !containerElement) {
          return;
        }

        api = turnstile;

        if (widgetIdRef.current) {
          try {
            turnstile.remove(widgetIdRef.current);
          } catch {
            // El widget ya pudo haber sido eliminado.
          }
          widgetIdRef.current = null;
        }

        containerElement.innerHTML = "";

        widgetIdRef.current = turnstile.render(containerElement, {
          sitekey: siteKey,
          action,
          theme: "auto",
          size: "flexible",

          callback: (token) => {
            settled = true;
            if (!cancelled) {
              setFailed(false);
              onTokenRef.current(token);
            }
          },

          "expired-callback": () => {
            if (!cancelled) {
              onTokenRef.current(null);
            }
          },

          "timeout-callback": () => {
            if (!cancelled) {
              onTokenRef.current(null);
            }
          },

          "error-callback": (code) => {
            console.error("[Cloudflare Turnstile] Error:", code);
            settled = true;
            markFailed();
          },
        });
      })
      .catch((error) => {
        console.error("[Cloudflare Turnstile]", error);
        settled = true;
        markFailed();
      });

    return () => {
      cancelled = true;
      clearTimeout(stallTimer);

      if (api && widgetIdRef.current) {
        try {
          api.remove(widgetIdRef.current);
        } catch {
          // El widget ya pudo haber sido eliminado.
        }
      }

      widgetIdRef.current = null;

      containerElement.innerHTML = "";
    };
  }, [action, containerElement, resetKey, retryNonce]);

  const siteKey =
    process.env.EXPO_PUBLIC_TURNSTILE_SITE_KEY?.trim() ?? "";

  if (!siteKey) {
    return (
      <View style={{ paddingVertical: 12, paddingHorizontal: 14 }}>
        <Text
          style={{
            color: "#991B1B",
            fontSize: 13,
            textAlign: "center",
          }}
        >
          La verificación de seguridad no está configurada.
        </Text>
      </View>
    );
  }

  const currentUrl =
    typeof window === "undefined" ? "" : window.location.href;
  const chromeIntent =
    browserInfo?.isInAppBrowser && browserInfo.platform === "android"
      ? buildOpenInChromeIntent(currentUrl)
      : null;
  const showHelp = failed || Boolean(browserInfo?.isInAppBrowser);

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(currentUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      setCopied(false);
    }
  };

  return (
    <View style={{ width: "100%" }}>
      {createElement("div", {
        ref: setContainerElement,
        style: {
          width: "100%",
          minHeight: 65,
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
        },
      })}

      {showHelp ? (
        <View
          accessibilityRole="alert"
          style={{
            marginTop: 8,
            padding: 12,
            borderRadius: 10,
            borderWidth: 1,
            borderColor: failed ? "#FCA5A5" : "#FCD34D",
            backgroundColor: failed ? "#FEF2F2" : "#FFFBEB",
            gap: 8,
          }}
        >
          <Text style={{ color: "#1F2937", fontSize: 13, lineHeight: 18 }}>
            {browserInfo?.isInAppBrowser
              ? openInBrowserHint(browserInfo)
              : "No pudimos completar la verificación de seguridad. Revisa tu conexión y vuelve a intentarlo."}
          </Text>

          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {failed ? (
              <Pressable
                onPress={() => setRetryNonce((value) => value + 1)}
                accessibilityRole="button"
                style={helpButtonStyle}
              >
                <Text style={helpButtonTextStyle}>Reintentar</Text>
              </Pressable>
            ) : null}

            {chromeIntent ? (
              <Pressable
                onPress={() => {
                  window.location.href = chromeIntent;
                }}
                accessibilityRole="button"
                style={helpButtonStyle}
              >
                <Text style={helpButtonTextStyle}>Abrir en Chrome</Text>
              </Pressable>
            ) : null}

            {browserInfo?.isInAppBrowser ? (
              <Pressable
                onPress={copyLink}
                accessibilityRole="button"
                style={helpButtonStyle}
              >
                <Text style={helpButtonTextStyle}>
                  {copied ? "Enlace copiado" : "Copiar enlace"}
                </Text>
              </Pressable>
            ) : null}
          </View>
        </View>
      ) : null}
    </View>
  );
}

const helpButtonStyle = {
  paddingVertical: 8,
  paddingHorizontal: 12,
  borderRadius: 8,
  borderWidth: 1,
  borderColor: "#D1D5DB",
  backgroundColor: "#FFFFFF",
} as const;

const helpButtonTextStyle = {
  color: "#1F2937",
  fontSize: 13,
  fontWeight: "600",
} as const;