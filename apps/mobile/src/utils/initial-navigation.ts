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
  hasContractorApproval?: boolean;
};

export type InitialRoute =
  | "/login"
  | "/perfil-profesional"
  | "/pendiente"
  | "/empresa"
  | "/(tabs)"
  | "/espacios"
  | "/(client-tabs)";

export function initialRouteFor(state: InitialNavigationState): InitialRoute | null {
  if (!state.authenticated) return "/login";
  if (state.role === "contractor" && !state.primaryCategory && !state.active) {
    return "/perfil-profesional";
  }
  if (!state.active) return "/pendiente";
  if (state.role === "client") return state.hasActiveCompany ? "/(tabs)" : "/(client-tabs)";
  if (state.role === "contractor") {
    if (state.hasActiveCompany) return "/(tabs)";
    if (!state.hasContractorApproval) return "/espacios";
    // Sin categoría (cuentas anteriores a la 043): primero los espacios, donde ve
    // sus invitaciones de equipo y puede elegir «Trabajar por mi cuenta».
    return state.primaryCategory ? "/empresa" : "/espacios";
  }

  // Cuentas administrativas u otros roles sin espacio móvil.
  // Evitar redirigir a una ruta protegida que volvería al inicio.
  return null;
}
