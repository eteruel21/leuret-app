import type { Href, SitemapType } from "expo-router";

import type { InitialRoute } from "./initial-navigation";

export const LAST_SCREEN_KEY = "@leuret:last-screen:v1";

export type ResumeScope = Exclude<InitialRoute, "/login">;

export type ScreenLocation = {
  pathname: string;
  params: Record<string, string>;
};

export type SavedScreen = {
  scopeKey: string;
  screen: ScreenLocation;
};

const SCREEN_GROUPS: Record<ResumeScope, readonly string[]> = {
  "/(tabs)": [
    "(tabs)", "agenda", "calculos", "catalogo", "clientes", "equipo",
    "facturas", "perfil", "presupuestos", "proyectos", "solicitudes", "tareas",
  ],
  "/(client-tabs)": [
    "(client-tabs)", "cliente-facturas", "cliente-presupuestos", "cliente-proyectos", "contratistas", "perfil", "solicitudes",
  ],
  "/empresa": ["empresa"],
  "/pendiente": ["pendiente"],
  "/perfil-profesional": ["perfil-profesional"],
};

export function screenPaths(sitemap: SitemapType | null): Set<string> {
  const paths = new Set<string>();

  function visit(node: SitemapType) {
    if (node.isInternal || node.isGenerated) return;
    if (node.children.length === 0 && typeof node.href === "string") {
      paths.add(node.href);
    }
    node.children.forEach(visit);
  }

  if (sitemap) visit(sitemap);
  return paths;
}

function routeParameter(params: unknown, name: string): string | undefined {
  if (!params || typeof params !== "object" || !(name in params)) return;
  const raw: unknown = (params as Record<string, unknown>)[name];
  const value: unknown = Array.isArray(raw) ? raw[0] : raw;
  if (typeof value === "string" && /^[a-zA-Z0-9_-]{1,128}$/.test(value)) {
    return value;
  }
}

export function resumableScreen(
  scope: ResumeScope | null,
  paths: ReadonlySet<string>,
  pathname: unknown,
  params: unknown,
): ScreenLocation | null {
  if (!scope || typeof pathname !== "string" || !paths.has(pathname)) return null;
  const [, group] = pathname.split("/");
  if (!SCREEN_GROUPS[scope].includes(group) || pathname === "/empresa") return null;

  const screenParams: ScreenLocation["params"] = {};
  if (pathname.endsWith("/[id]")) {
    const id = routeParameter(params, "id");
    if (!id) return null;
    screenParams.id = id;
  }
  if (pathname === "/solicitudes") {
    const id = routeParameter(params, "id");
    if (id) screenParams.id = id;
  }
  if (group === "calculos") {
    const budgetId = routeParameter(params, "budgetId");
    if (budgetId) screenParams.budgetId = budgetId;
  }
  if (pathname === "/calculos/concreto") {
    const use = routeParameter(params, "uso");
    if (use) screenParams.uso = use;
  }

  return { pathname, params: screenParams };
}

export function startupScreen(
  saved: SavedScreen | null,
  scope: ResumeScope | null,
  scopeKey: string | null,
  paths: ReadonlySet<string>,
  entry: { pathname: string; hasParams: boolean; isWeb: boolean },
): Href | null {
  if (entry.hasParams) return null;

  if (entry.pathname !== "/") {
    // Browser URLs omit route groups. A client tab can share its URL with
    // a contractor stack screen, such as /facturas.
    if (entry.isWeb && scope === "/(client-tabs)") {
      return resumableScreen(scope, paths, scope + entry.pathname, {}) as Href | null;
    }
    return null;
  }

  if (!scopeKey || saved?.scopeKey !== scopeKey) return null;
  return resumableScreen(scope, paths, saved.screen?.pathname, saved.screen?.params) as Href | null;
}
