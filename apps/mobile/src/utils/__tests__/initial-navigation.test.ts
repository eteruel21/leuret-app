import { describe, expect, it } from "vitest";

import { initialRouteFor, type InitialNavigationState } from "../initial-navigation";

const contractor: InitialNavigationState = {
  authenticated: true,
  role: "contractor",
  active: true,
  primaryCategory: "construccion",
  hasActiveCompany: true,
  hasContractorApproval: true,
};

describe("navegación inicial de Leuret", () => {
  it("muestra login cuando no hay sesión, aunque haya datos de un perfil anterior", () => {
    expect(initialRouteFor({ ...contractor, authenticated: false })).toBe("/login");
  });

  it("envía a completar perfil profesional antes de aprobar la cuenta", () => {
    expect(initialRouteFor({ ...contractor, active: false, primaryCategory: null })).toBe("/perfil-profesional");
  });

  it("envía a aprobación cuando el perfil profesional ya está completo", () => {
    expect(initialRouteFor({ ...contractor, active: false })).toBe("/pendiente");
  });

  it("envía al inicio del profesional que ya tiene empresa", () => {
    expect(initialRouteFor(contractor)).toBe("/(tabs)");
  });

  it("envía a crear o elegir empresa cuando no hay una activa", () => {
    expect(initialRouteFor({ ...contractor, hasActiveCompany: false })).toBe("/empresa");
  });

  it("abre el equipo de un invitado sin exigir un perfil de contratista", () => {
    expect(initialRouteFor({ ...contractor, primaryCategory: null, hasContractorApproval: false })).toBe("/(tabs)");
    expect(initialRouteFor({ ...contractor, role: "client", primaryCategory: null, hasContractorApproval: false })).toBe("/(tabs)");
  });

  it("permite revisar los espacios si el invitado pierde acceso al equipo", () => {
    expect(initialRouteFor({ ...contractor, hasActiveCompany: false, hasContractorApproval: false })).toBe("/espacios");
  });

  it("envía al inicio de clientes sin requerir empresa de contratista", () => {
    expect(initialRouteFor({ ...contractor, role: "client", primaryCategory: null, hasActiveCompany: false })).toBe("/(client-tabs)");
  });

  it("envía a aprobación a un cliente inactivo", () => {
    expect(initialRouteFor({ ...contractor, role: "client", active: false })).toBe("/pendiente");
  });

  it("no produce un bucle para usuarios administrativos sin espacio móvil", () => {
    expect(initialRouteFor({ ...contractor, role: "super_admin" })).toBeNull();
  });
});
