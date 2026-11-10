import { describe, expect, it } from "vitest";

import {
  buildOpenInChromeIntent,
  detectInAppBrowser,
  openInBrowserHint,
} from "../in-app-browser";

const UA = {
  instagramIos:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 330.0.0.0 (iPhone14,5; iOS 17_5; es_PA)",
  whatsappAndroid:
    "Mozilla/5.0 (Linux; Android 14; SM-A546E Build/UP1A; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/124.0 Mobile Safari/537.36 WhatsApp/2.24",
  facebookAndroid:
    "Mozilla/5.0 (Linux; Android 13; Pixel 7; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/120.0 Mobile Safari/537.36 [FB_IAB/FB4A;FBAV/450.0;]",
  genericAndroidWebView:
    "Mozilla/5.0 (Linux; Android 12; moto g; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/118.0 Mobile Safari/537.36",
  genericIosWebView:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148",
  chromeAndroid:
    "Mozilla/5.0 (Linux; Android 14; SM-A546E) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Mobile Safari/537.36",
  safariIos:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1",
  chromeIos:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/124.0 Mobile/15E148",
  desktopChrome:
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
};

describe("detectInAppBrowser", () => {
  it("reconoce apps conocidas", () => {
    expect(detectInAppBrowser(UA.instagramIos)).toEqual({ appName: "Instagram", isInAppBrowser: true, platform: "ios" });
    expect(detectInAppBrowser(UA.whatsappAndroid)).toMatchObject({ appName: "WhatsApp", isInAppBrowser: true, platform: "android" });
    expect(detectInAppBrowser(UA.facebookAndroid)).toMatchObject({ appName: "Facebook", isInAppBrowser: true });
  });

  it("reconoce WebViews genéricos", () => {
    expect(detectInAppBrowser(UA.genericAndroidWebView)).toMatchObject({ appName: null, isInAppBrowser: true });
    expect(detectInAppBrowser(UA.genericIosWebView)).toMatchObject({ appName: null, isInAppBrowser: true });
  });

  it("no marca navegadores reales", () => {
    for (const ua of [UA.chromeAndroid, UA.safariIos, UA.chromeIos, UA.desktopChrome, "", null]) {
      expect(detectInAppBrowser(ua).isInAppBrowser).toBe(false);
    }
  });
});

describe("buildOpenInChromeIntent", () => {
  it("arma un intent con fallback", () => {
    const intent = buildOpenInChromeIntent("https://app.leurettech.com/login?x=1#a");
    expect(intent).toContain("intent://app.leurettech.com/login?x=1#a#Intent;scheme=https;package=com.android.chrome;");
    expect(intent).toContain("S.browser_fallback_url=https%3A%2F%2Fapp.leurettech.com%2Flogin");
  });

  it("rechaza URLs no web", () => {
    expect(buildOpenInChromeIntent("javascript:alert(1)")).toBeNull();
    expect(buildOpenInChromeIntent("no es url")).toBeNull();
  });
});

describe("openInBrowserHint", () => {
  it("adapta el mensaje a la plataforma", () => {
    expect(openInBrowserHint(detectInAppBrowser(UA.instagramIos))).toContain("Safari");
    expect(openInBrowserHint(detectInAppBrowser(UA.whatsappAndroid))).toContain("Chrome");
    expect(openInBrowserHint(detectInAppBrowser(UA.whatsappAndroid))).toContain("WhatsApp");
  });
});
