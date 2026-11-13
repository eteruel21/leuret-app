import { describe, expect, it } from "vitest";

import {
  addDaysKey,
  clientBudgetState,
  clientInvoiceState,
  daysUntil,
  matchesSearch,
  notificationRoute,
  relativeDayLabel,
  whatsappNumber,
} from "../client-portal";

const id = "3f2b8c9e-1d4a-4c5b-9e7f-0a1b2c3d4e5f";

describe("clientBudgetState", () => {
  it("marca como vencido un presupuesto enviado con vigencia pasada", () => {
    expect(clientBudgetState("sent", "2026-01-01", "2026-02-01").key).toBe("expired");
  });
  it("trata enviado y visto como pendientes de respuesta", () => {
    expect(clientBudgetState("sent", null, "2026-02-01").key).toBe("pending");
    expect(clientBudgetState("viewed", "2026-03-01", "2026-02-01").key).toBe("pending");
  });
  it("muestra el rechazo como cambios solicitados", () => {
    expect(clientBudgetState("rejected", null).label).toBe("Cambios solicitados");
  });
});

describe("clientInvoiceState", () => {
  it("distingue pagada, vencida y abono parcial", () => {
    expect(clientInvoiceState({ status: "issued", balance_due: 0 }).key).toBe("paid");
    expect(clientInvoiceState({ status: "issued", balance_due: 10, is_overdue: true }).key).toBe("overdue");
    expect(clientInvoiceState({ status: "partially_paid", balance_due: 10 }).label).toBe("Abono parcial");
    expect(clientInvoiceState({ status: "cancelled", balance_due: 10 }).key).toBe("cancelled");
  });
});

describe("fechas", () => {
  it("calcula días y etiquetas relativas", () => {
    expect(daysUntil("2026-11-15", "2026-11-10")).toBe(5);
    expect(relativeDayLabel("2026-11-11", "2026-11-10")).toBe("Mañana");
    expect(relativeDayLabel("2026-11-08", "2026-11-10")).toBe("Hace 2 días");
    expect(addDaysKey(30, "2026-11-10")).toBe("2026-12-10");
  });
});

describe("whatsappNumber", () => {
  it("agrega el código de Panamá a números locales", () => {
    expect(whatsappNumber("6123-4567")).toBe("50761234567");
    expect(whatsappNumber("+507 6123 4567")).toBe("50761234567");
    expect(whatsappNumber("12")).toBeNull();
  });
});

describe("matchesSearch", () => {
  it("ignora tildes y mayúsculas", () => {
    expect(matchesSearch("remodelacion", "Remodelación de cocina")).toBe(true);
    expect(matchesSearch("baño", "Cocina")).toBe(false);
    expect(matchesSearch("  ", "cualquiera")).toBe(true);
  });
});

describe("notificationRoute", () => {
  it("lleva al cliente al presupuesto y a la factura de su portal", () => {
    expect(notificationRoute({ type: "budget.sent", budgetId: id }, true)?.pathname).toBe("/cliente-presupuestos/[id]");
    expect(notificationRoute({ type: "invoice.issued", invoiceId: id }, true)?.pathname).toBe("/cliente-facturas/[id]");
  });
  it("lleva al contratista a sus pantallas", () => {
    expect(notificationRoute({ type: "budget.approved", budgetId: id }, false)?.pathname).toBe("/presupuestos/[id]");
    expect(notificationRoute({ type: "invoice.payment_registered", invoiceId: id }, false)?.pathname).toBe("/facturas/[id]");
  });
  it("abre las peticiones de trabajo y sus conversaciones", () => {
    expect(notificationRoute({ type: "job_request.created", requestId: id }, false)?.pathname).toBe("/peticiones/[id]");
    expect(notificationRoute({ type: "job_request.created", requestId: id }, true)).toBeNull();
    expect(notificationRoute({ type: "job_request.message", requestId: id, companyId: id }, true)).toEqual({
      pathname: "/cliente-peticiones/conversacion",
      params: { requestId: id, companyId: id },
    });
    expect(notificationRoute({ type: "job_request.message", requestId: id, companyId: id }, false)?.pathname).toBe(
      "/peticiones/conversacion",
    );
    expect(notificationRoute({ type: "job_request.message", requestId: id }, false)).toBeNull();
  });
  it("ignora tipos desconocidos e identificadores inválidos", () => {
    expect(notificationRoute({ type: "budget.sent", budgetId: "../admin" }, true)).toBeNull();
    expect(notificationRoute({ type: "otro" }, true)).toBeNull();
    expect(notificationRoute(null, true)).toBeNull();
  });
  it("abre la solicitud desde un aviso en cualquiera de los dos roles", () => {
    const data = { type: "client_connection.requested", requestId: id };
    expect(notificationRoute(data, true)).toEqual({ pathname: "/solicitudes", params: { id } });
    expect(notificationRoute(data, false)).toEqual({ pathname: "/solicitudes", params: { id } });
    expect(notificationRoute({ ...data, requestId: "../perfil" }, false)).toBeNull();
  });
});
