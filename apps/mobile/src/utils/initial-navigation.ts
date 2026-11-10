/**
 * Define el destino del inicio para cada estado de sesión.
 * Debe mantenerse alineado con los guardias de app/_layout.tsx.
 */
export type InitialNavigationState = {
  authenticated: boolean;
  role: string | null | undefined;
  active: boolean;
  primaryCategory: string | null | undefined;
  hasActiveCompany: boolean;
};

export type InitialRoute =
  | "/login"
  | "/perfil-profesional"
  | "/pendiente"
  | "/empresa"
  | "/(tabs)"
  | "/(client-tabs)";

export function initialRouteFor(state: InitialNavigationState): InitialRoute | null {
  if (!state.authenticated) return "/login";
  if (state.role === "contractor" && !state.primaryCategory) {
    return "/perfil-profesional";
  }
  if (!state.active) return "/pendiente";
  if (state.role === "client") return "/(client-tabs)";
  if (state.role === "contractor") {
    return state.hasActiveCompany ? "/(tabs)" : "/empresa";
  }

  // Cuentas administrativas u otros roles sin espacio móvil.
  // Evitar redirigir a una ruta protegida que volvería al inicio.
  return null;
}
