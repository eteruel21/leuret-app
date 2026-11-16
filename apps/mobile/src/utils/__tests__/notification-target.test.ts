import { describe, expect, it } from "vitest";

import { notificationRoute } from "../client-portal";
import { resolveNotificationTarget, type NotificationSpaceContext } from "../notification-target";

const companyA = "3f2b8c9e-1d4a-4c5b-9e7f-0a1b2c3d4e5f";
const companyB = "8a1c2d3e-4f50-4a6b-8c7d-9e0f1a2b3c4d";
const budgetId = "11111111-2222-4333-8444-555555555555";
const invoiceId = "66666666-7777-4888-9999-aaaaaaaaaaaa";

const inCompanyA: NotificationSpaceContext = {
  isClient: false,
  activeCompanyId: companyA,
  memberCompanyIds: [companyA, companyB],
  hasClientSpace: true,
};

describe("resolveNotificationTarget", () => {
  it("abre en el espacio actual cuando el aviso no indica espacio (versiones anteriores de la API)", () => {
    const target = resolveNotificationTarget({ type: "budget.approved", budgetId }, inCompanyA);
    expect(target).toMatchObject({ switchTo: null, route: { pathname: "/presupuestos/[id]" } });
  });

  it("cambia de empresa si el aviso es de otra empresa del usuario", () => {
    const target = resolveNotificationTarget(
      { type: "budget.approved", budgetId, space: "company", spaceCompanyId: companyB },
      inCompanyA,
    );
    expect(target?.switchTo).toEqual({ kind: "company", companyId: companyB });
    expect(target?.companyId).toBe(companyB);
    expect(target?.route.pathname).toBe("/presupuestos/[id]");
  });

  it("no cambia si ya está en la empresa del aviso", () => {
    const target = resolveNotificationTarget(
      { type: "invoice.requested", budgetId, space: "company", spaceCompanyId: companyA },
      inCompanyA,
    );
    expect(target?.switchTo).toBeNull();
  });

  it("ignora avisos de una empresa a la que ya no pertenece", () => {
    const outsider = "99999999-8888-4777-8666-555555555555";
    expect(resolveNotificationTarget(
      { type: "budget.approved", budgetId, space: "company", spaceCompanyId: outsider },
      inCompanyA,
    )).toBeNull();
  });

  it("pasa al espacio de cliente para un presupuesto recibido", () => {
    const target = resolveNotificationTarget({ type: "budget.sent", budgetId, space: "client" }, inCompanyA);
    expect(target).toMatchObject({
      switchTo: { kind: "client" },
      isClient: true,
      route: { pathname: "/cliente-presupuestos/[id]", params: { id: budgetId } },
    });
  });

  it("desde el espacio de cliente pasa a la empresa para una petición nueva", () => {
    const target = resolveNotificationTarget(
      { type: "job_request.created", requestId: budgetId, space: "company" },
      { ...inCompanyA, isClient: true, activeCompanyId: null },
    );
    expect(target?.switchTo).toEqual({ kind: "company", companyId: companyA });
    expect(target?.route.pathname).toBe("/peticiones/[id]");
  });

  it("no abre avisos de cliente en cuentas sin espacio de cliente", () => {
    expect(resolveNotificationTarget(
      { type: "invoice.issued", invoiceId, space: "client" },
      { ...inCompanyA, hasClientSpace: false },
    )).toBeNull();
  });
});

describe("notificationRoute: recordatorio de agenda", () => {
  it("abre la agenda en el espacio de empresa", () => {
    expect(notificationRoute({ type: "appointment.reminder" }, false)).toEqual({ pathname: "/(tabs)/agenda", params: {} });
    expect(notificationRoute({ type: "appointment.reminder" }, true)).toBeNull();
  });
});
