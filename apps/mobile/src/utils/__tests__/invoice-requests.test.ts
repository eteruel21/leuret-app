import { describe, expect, it } from "vitest";

import { clientInvoiceFooter, invoiceRequestsLabel, pendingRequestForBudget } from "../invoice-requests";

describe("pie de la obra del cliente", () => {
  const base = { status: "completed", invoices: [] as { id: string }[] };

  it("ofrece solicitar la factura cuando se puede", () => {
    expect(clientInvoiceFooter({ ...base, can_request_invoice: true })).toEqual({ kind: "request" });
  });

  it("muestra la solicitud pendiente", () => {
    expect(clientInvoiceFooter({ ...base, invoice_request: { status: "pending", invoice_id: null } }))
      .toEqual({ kind: "pending" });
  });

  it("abre la factura cuando ya existe", () => {
    expect(clientInvoiceFooter({ ...base, invoice_request: { status: "fulfilled", invoice_id: "f1" } }))
      .toEqual({ kind: "invoice", invoiceId: "f1" });
    expect(clientInvoiceFooter({ ...base, invoices: [{ id: "f2" }] })).toEqual({ kind: "invoice", invoiceId: "f2" });
  });

  it("no muestra nada en una obra en curso", () => {
    expect(clientInvoiceFooter({ status: "in_progress", invoices: [{ id: "f2" }] })).toBeNull();
  });
});

describe("solicitudes del contratista", () => {
  it("encuentra la solicitud pendiente del presupuesto", () => {
    const requests = [
      { id: "a", budget_id: "b1", status: "fulfilled" as const },
      { id: "b", budget_id: "b1", status: "pending" as const },
    ];
    expect(pendingRequestForBudget(requests, "b1")?.id).toBe("b");
    expect(pendingRequestForBudget(requests, "b2")).toBeNull();
  });

  it("resume cuántas hay", () => {
    expect(invoiceRequestsLabel(0)).toBe("");
    expect(invoiceRequestsLabel(1)).toBe("1 cliente pidió su factura");
    expect(invoiceRequestsLabel(3)).toBe("3 clientes pidieron su factura");
  });
});
