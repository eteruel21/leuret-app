import { describe, expect, it } from "vitest";

import { type SavedScreen, resumableScreen, startupScreen } from "../screen-resume";

const paths = new Set([
  "/", "/(tabs)", "/(tabs)/calculos", "/(client-tabs)/facturas",
  "/calculos/concreto", "/facturas", "/facturas/[id]",
  "/contratistas/[id]", "/solicitudes",
  "/empresa", "/empresa/unirme", "/invitacion", "/(auth)/reset-password",
]);

const scope = "/(tabs)";
const saved: SavedScreen = {
  scopeKey: "session-user-company",
  screen: { pathname: "/facturas/[id]", params: { id: "invoice-123" } },
};
const appLaunch = { pathname: "/", hasParams: false, isWeb: false };

describe("retomar la última pantalla de Leuret", () => {
  it("recupera un detalle para la misma sesión y empresa", () => {
    expect(startupScreen(saved, scope, saved.scopeKey, paths, appLaunch)).toEqual(saved.screen);
    expect(startupScreen(saved, scope, "different-session", paths, appLaunch)).toBeNull();
    expect(startupScreen(saved, "/(client-tabs)", saved.scopeKey, paths, appLaunch)).toBeNull();
  });

  it("prioriza la ruta de entrada cuando se abre un enlace", () => {
    const link = { ...appLaunch, pathname: "/invitacion", hasParams: true };
    expect(startupScreen(saved, scope, saved.scopeKey, paths, link)).toBeNull();
    expect(startupScreen(saved, scope, saved.scopeKey, paths, { ...appLaunch, pathname: "/facturas" })).toBeNull();
  });

  it("abre la pestaña del cliente cuando la URL web coincide con una ruta de contratista", () => {
    const entry = { pathname: "/facturas", hasParams: false, isWeb: true };
    expect(startupScreen(null, "/(client-tabs)", null, paths, entry)).toEqual({
      pathname: "/(client-tabs)/facturas", params: {},
    });
    expect(startupScreen(saved, scope, saved.scopeKey, paths, entry)).toBeNull();
  });

  it("conserva los parámetros de Concreto y omite datos ajenos a la navegación", () => {
    expect(resumableScreen(scope, paths, "/calculos/concreto", {
      uso: "viga", budgetId: ["budget-123"], token: "never-store",
    })).toEqual({
      pathname: "/calculos/concreto", params: { uso: "viga", budgetId: "budget-123" },
    });
  });

  it("recupera la ficha del contratista y la solicitud abierta", () => {
    const params = { id: "item-123" };
    expect(resumableScreen("/(client-tabs)", paths, "/contratistas/[id]", params)).toEqual({ pathname: "/contratistas/[id]", params });
    expect(resumableScreen(scope, paths, "/solicitudes", params)).toEqual({ pathname: "/solicitudes", params });
  });

  it("omite rutas transitorias, de autenticación, eliminadas o sin un identificador válido", () => {
    expect(resumableScreen("/empresa", paths, "/empresa", {})).toBeNull();
    expect(resumableScreen(scope, paths, "/invitacion", { codigo: "secret" })).toBeNull();
    expect(resumableScreen(scope, paths, "/(auth)/reset-password", { token: "secret" })).toBeNull();
    expect(resumableScreen(scope, paths, "/calculos/eliminado", {})).toBeNull();
    expect(resumableScreen(scope, paths, "/facturas/[id]", { id: "../login" })).toBeNull();
  });
});
