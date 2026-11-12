import { type Href, useGlobalSearchParams, usePathname, useSegments, useSitemap } from "expo-router";
import { createContext, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Platform } from "react-native";

import { loadLocalData, removeLocalData, saveLocalData } from "@/utils/local-storage";
import {
  LAST_SCREEN_KEY,
  type ResumeScope,
  type SavedScreen,
  resumableScreen,
  screenPaths,
  startupScreen,
} from "@/utils/screen-resume";

export const ScreenResumeContext = createContext<() => Href | null>(() => null);

export function useScreenResume({
  authenticated,
  loading,
  scope,
  scopeKey,
}: {
  authenticated: boolean;
  loading: boolean;
  scope: ResumeScope | null;
  scopeKey: string | null;
}) {
  const pathname = usePathname();
  const segments = useSegments();
  const params = useGlobalSearchParams();
  const sitemap = useSitemap();
  const paths = useMemo(() => screenPaths(sitemap), [sitemap]);
  const [entry] = useState(() => {
    if (Platform.OS === "web" && typeof window !== "undefined") {
      const url = window.location;
      return { pathname: url.pathname, hasParams: Boolean(url.search || url.hash), isWeb: true };
    }
    return { pathname, hasParams: Object.keys(params).length > 0, isWeb: false };
  });
  const [saved, setSaved] = useState<SavedScreen | null>();
  const startupAvailable = useRef(true);
  const lastWritten = useRef<string | null>(null);

  useEffect(() => {
    let mounted = true;
    void loadLocalData<SavedScreen>(LAST_SCREEN_KEY).then((screen) => {
      if (!mounted) return;
      lastWritten.current = screen ? JSON.stringify(screen) : null;
      setSaved(screen);
    });
    return () => {
      mounted = false;
    };
  }, []);

  const route = "/" + segments.join("/");
  useEffect(() => {
    if (loading || saved === undefined) return;

    if (!authenticated) {
      if (lastWritten.current !== null) {
        lastWritten.current = null;
        void removeLocalData(LAST_SCREEN_KEY);
      }
      return;
    }

    const screen = resumableScreen(scope, paths, route, params);
    if (!scopeKey || !screen) return;

    startupAvailable.current = false;
    const location: SavedScreen = { scopeKey, screen };
    const serialized = JSON.stringify(location);
    if (lastWritten.current === serialized) return;
    lastWritten.current = serialized;
    void saveLocalData(LAST_SCREEN_KEY, location);
  }, [authenticated, loading, params, paths, route, saved, scope, scopeKey]);

  const takeStartupScreen = useCallback(() => {
    if (!startupAvailable.current) return null;
    startupAvailable.current = false;
    return startupScreen(saved ?? null, scope, scopeKey, paths, entry);
  }, [entry, paths, saved, scope, scopeKey]);

  return { ready: saved !== undefined, takeStartupScreen };
}
