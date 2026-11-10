import { describe, expect, it } from "vitest";

import {
  describeAuditAction,
  extractInvitationCode,
  invitationMessage,
  isValidInvitationCode,
  memberActions,
  normalizeMember,
  sortMembers,
  type TeamMember,
} from "../team";

const member = (overrides: Partial<TeamMember>): TeamMember => ({
  id: "m",
  userId: "u",
  role: "member",
  active: true,
  name: "Ana",
  email: "ana@ejemplo.com",
  joinedAt: null,
  ...overrides,
});

describe("normalizeMember", () => {
  it("lee los datos anidados que devuelve la API", () => {
    const result = normalizeMember({
      id: "m1",
      user_id: "u1",
      role: "sales",
      active: true,
      created_at: "2026-01-01T00:00:00Z",
      user: { email: "luis@ejemplo.com", full_name: "Luis Gómez" },
    });
    expect(result).toEqual({
      id: "m1",
      userId: "u1",
      role: "sales",
      active: true,
      name: "Luis Gómez",
      email: "luis@ejemplo.com",
      joinedAt: "2026-01-01T00:00:00Z",
    });
  });

  it("si el nombre es el correo, muestra la parte antes de la arroba", () => {
    const result = normalizeMember({
      id: "m1",
      user_id: "u1",
      role: "member",
      active: true,
      user: { email: "pedro@ejemplo.com", full_name: "pedro@ejemplo.com" },
    });
    expect(result.name).toBe("pedro");
  });
});

describe("sortMembers", () => {
  it("ordena activos primero y por jerarquía", () => {
    const sorted = sortMembers([
      member({ id: "1", role: "member", name: "Zoe" }),
      member({ id: "2", role: "owner", name: "Bea", active: false }),
      member({ id: "3", role: "admin", name: "Carla" }),
      member({ id: "4", role: "owner", name: "Dani" }),
    ]);
    expect(sorted.map((m) => m.id)).toEqual(["4", "3", "1", "2"]);
  });
});

describe("memberActions (mismas reglas que la API)", () => {
  it("roles sin gestión de equipo no tienen acciones", () => {
    for (const callerRole of ["supervisor", "sales", "estimator", "member"] as const) {
      const actions = memberActions({ callerRole, callerUserId: "x", target: member({}), activeOwnerCount: 1 });
      expect(actions.changeRole).toBe(false);
      expect(actions.remove).toBe(false);
    }
  });

  it("nadie puede desactivarse ni quitarse a sí mismo", () => {
    const actions = memberActions({
      callerRole: "admin",
      callerUserId: "u1",
      target: member({ userId: "u1", role: "admin" }),
      activeOwnerCount: 1,
    });
    expect(actions.toggleActive).toBe(false);
    expect(actions.remove).toBe(false);
  });

  it("un admin no puede tocar a un propietario ni asignar ese rol", () => {
    const onOwner = memberActions({
      callerRole: "admin",
      callerUserId: "a",
      target: member({ role: "owner", userId: "o" }),
      activeOwnerCount: 2,
    });
    expect(onOwner.changeRole).toBe(false);

    const onMember = memberActions({ callerRole: "admin", callerUserId: "a", target: member({}), activeOwnerCount: 1 });
    expect(onMember.assignableRoles).not.toContain("owner");
    expect(onMember.assignableRoles).not.toContain("member");
    expect(onMember.changeRole).toBe(true);
  });

  it("el único propietario activo no se puede degradar, desactivar ni quitar", () => {
    const actions = memberActions({
      callerRole: "owner",
      callerUserId: "otro",
      target: member({ role: "owner", userId: "o" }),
      activeOwnerCount: 1,
    });
    expect(actions).toEqual({ changeRole: false, toggleActive: false, remove: false, assignableRoles: [] });
  });

  it("con dos propietarios, un propietario puede cambiar al otro", () => {
    const actions = memberActions({
      callerRole: "owner",
      callerUserId: "o1",
      target: member({ role: "owner", userId: "o2" }),
      activeOwnerCount: 2,
    });
    expect(actions.changeRole).toBe(true);
    expect(actions.remove).toBe(true);
  });
});

describe("códigos de invitación", () => {
  const code = "a".repeat(20) + "B_c-" + "9".repeat(20);

  it("el mensaje incluye el código y el correo", () => {
    const message = invitationMessage({ companyName: "Leuret SA", code, roleLabel: "Ventas", email: "x@y.com" });
    expect(message).toContain(code);
    expect(message).toContain("x@y.com");
  });

  it("extrae el código aunque peguen el mensaje completo", () => {
    const message = invitationMessage({ companyName: "Leuret SA", code, roleLabel: "Ventas", email: "x@y.com" });
    expect(extractInvitationCode(message)).toBe(code);
    expect(extractInvitationCode(`  ${code}  `)).toBe(code);
  });

  it("valida el formato que exige la API", () => {
    expect(isValidInvitationCode(code)).toBe(true);
    expect(isValidInvitationCode("corto")).toBe(false);
    expect(isValidInvitationCode("a".repeat(40) + "!")).toBe(false);
  });
});

describe("describeAuditAction", () => {
  const labels = { admin: "Administrador", sales: "Ventas" };

  it("describe cambios de rol con el antes y el después", () => {
    expect(describeAuditAction("MEMBER_ROLE_UPDATED", { oldRole: "sales", newRole: "admin" }, labels)).toBe(
      "cambió el rol de un miembro: Ventas → Administrador"
    );
  });

  it("incluye el correo afectado cuando existe", () => {
    expect(describeAuditAction("MEMBER_REMOVED", { email: "a@b.com" }, labels)).toBe(
      "quitó a un miembro de la empresa (a@b.com)"
    );
  });

  it("traduce la creación de la empresa", () => {
    expect(describeAuditAction("COMPANY_CREATED", { name: "TCT Services" }, labels)).toBe("creó la empresa");
  });

  it("acciones desconocidas se muestran legibles", () => {
    expect(describeAuditAction("SOMETHING_NEW", null, labels)).toBe("something new");
  });
});
