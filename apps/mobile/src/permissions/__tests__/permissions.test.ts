import { describe, expect, it } from "vitest";

import {
  CAPABILITIES,
  HOME_QUICK_ACTIONS,
  can,
  quickActionsFor,
} from "../permissions";
import type { CompanyRole } from "../../types/company";

const ROLES: CompanyRole[] = [
  "owner",
  "admin",
  "supervisor",
  "sales",
  "estimator",
  "member",
];

describe("permisos por rol (deben coincidir con la API)", () => {
  it("sin rol no hay acceso a nada", () => {
    for (const capability of Object.keys(CAPABILITIES) as (keyof typeof CAPABILITIES)[]) {
      expect(can(null, capability)).toBe(false);
      expect(can(undefined, capability)).toBe(false);
    }
  });

  it("owner y admin pueden todo", () => {
    for (const capability of Object.keys(CAPABILITIES) as (keyof typeof CAPABILITIES)[]) {
      expect(can("owner", capability)).toBe(true);
      expect(can("admin", capability)).toBe(true);
    }
  });

  it("presupuestos: solo owner, admin y estimator", () => {
    const allowed = ROLES.filter((role) => can(role, "budgets.view"));
    expect(allowed).toEqual(["owner", "admin", "estimator"]);
  });

  it("todo el equipo abre la obra, pero solo algunos ven sus montos", () => {
    expect(ROLES.filter((role) => can(role, "projects.view"))).toEqual(ROLES);
    expect(ROLES.filter((role) => can(role, "projects.financials"))).toEqual(["owner", "admin", "supervisor", "sales"]);
    expect(ROLES.filter((role) => can(role, "progress.record"))).toEqual(["owner", "admin", "supervisor"]);
  });

  it("facturas, clientes y catálogo se consultan con cualquier rol", () => {
    for (const role of ROLES) {
      expect(can(role, "invoices.view")).toBe(true);
      expect(can(role, "clients.view")).toBe(true);
      expect(can(role, "catalog.view")).toBe(true);
    }
  });

  it("solo owner, admin y sales editan clientes y registran abonos", () => {
    expect(ROLES.filter((role) => can(role, "clients.edit"))).toEqual(["owner", "admin", "sales"]);
    expect(ROLES.filter((role) => can(role, "invoices.payments.record"))).toEqual(["owner", "admin", "sales"]);
  });

  it("borrar direcciones/contactos y gestionar finanzas es solo de owner y admin", () => {
    expect(ROLES.filter((role) => can(role, "clients.delete"))).toEqual(["owner", "admin"]);
    expect(ROLES.filter((role) => can(role, "invoices.manageFinancial"))).toEqual(["owner", "admin"]);
    expect(ROLES.filter((role) => can(role, "company.manage"))).toEqual(["owner", "admin"]);
  });
});

describe("inicio por rol", () => {
  it("ningún rol ve un acceso rápido que la API le niega", () => {
    for (const role of ROLES) {
      const actions = quickActionsFor(role);
      expect(actions.length).toBeGreaterThan(0);
      if (!can(role, "budgets.view")) expect(actions).not.toContain("budget");
    }
  });

  it("cada rol empieza por lo que más usa", () => {
    expect(quickActionsFor("estimator")[0]).toBe("budget");
    expect(quickActionsFor("sales")[0]).toBe("client");
    expect(quickActionsFor("supervisor")[0]).toBe("project");
    expect(quickActionsFor("member")[0]).toBe("tasks");
  });

  it("la configuración por rol no incluye accesos prohibidos", () => {
    for (const role of ROLES) {
      expect(quickActionsFor(role)).toEqual(HOME_QUICK_ACTIONS[role]);
    }
  });

  it("el equipo de campo tiene sus tareas en el inicio", () => {
    expect(quickActionsFor("member")).toContain("tasks");
    expect(quickActionsFor("supervisor")).toContain("tasks");
    for (const role of ROLES) expect(can(role, "tasks.mine")).toBe(true);
  });

  it("sin rol no hay accesos", () => {
    expect(quickActionsFor(null)).toEqual([]);
  });
});
