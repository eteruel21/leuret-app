import { useMemo } from "react";
import { Linking, StyleSheet, Text, View } from "react-native";
import { WebView } from "react-native-webview";

import {
  buildTurnstileChallengeUrl,
  type TurnstileChallengeProps,
} from "./TurnstileChallenge.types";

type TurnstileMessage = {
  source?: string;
  type?: string;
  action?: string;
  token?: string;
};

function originOf(url: string | null | undefined): string | null {
  if (!url) return null;
  const match = /^(https?:\/\/[^/?#]+)/i.exec(url);
  return match ? match[1].toLowerCase() : null;
}

export default function TurnstileChallenge({
  action,
  onToken,
  resetKey = 0,
}: TurnstileChallengeProps) {
  const challengeUrl = useMemo(
    () => buildTurnstileChallengeUrl(action, resetKey),
    [action, resetKey],
  );
  const challengeOrigin = useMemo(() => originOf(challengeUrl), [challengeUrl]);

  if (!challengeUrl) {
    return (
      <View style={styles.messageBox}>
        <Text style={styles.errorText}>
          La verificación de seguridad no está configurada.
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <WebView
        key={`${action}-${resetKey}`}
        source={{ uri: challengeUrl }}
        javaScriptEnabled
        domStorageEnabled
        originWhitelist={["https://*", "http://*"]}
        scrollEnabled={false}
        showsHorizontalScrollIndicator={false}
        showsVerticalScrollIndicator={false}
        style={styles.webView}
        // La página de verificación no navega fuera de su dominio; los enlaces
        // (privacidad, términos de Cloudflare) se abren en el navegador.
        onShouldStartLoadWithRequest={(request) => {
          if (request.isTopFrame === false || request.url.startsWith("about:")) return true;
          if (originOf(request.url) === challengeOrigin) return true;
          if (/^https:\/\//i.test(request.url)) void Linking.openURL(request.url);
          return false;
        }}
        onMessage={(event) => {
          // Solo se aceptan mensajes de la página de verificación propia.
          if (originOf(event.nativeEvent.url) !== challengeOrigin) return;
          try {
            const payload = JSON.parse(
              event.nativeEvent.data,
            ) as TurnstileMessage;

            if (
              payload.source !== "contractor-turnstile" ||
              payload.action !== action
            ) {
              return;
            }

            if (
              payload.type === "success" &&
              typeof payload.token === "string" &&
              payload.token.length > 0
            ) {
              onToken(payload.token);
              return;
            }

            if (
              payload.type === "expired" ||
              payload.type === "timeout" ||
              payload.type === "error"
            ) {
              onToken(null);
            }
          } catch {
            onToken(null);
          }
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    minHeight: 92,
    width: "100%",
    overflow: "hidden",
  },
  webView: {
    minHeight: 92,
    backgroundColor: "transparent",
  },
  messageBox: {
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  errorText: {
    color: "#991B1B",
    fontSize: 13,
    textAlign: "center",
  },
});
