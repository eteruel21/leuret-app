import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";

import {
  notifyBudgetDecision,
  notifyClientConnectionRequest,
  notifyInvoiceIssued,
  notifyInvoicePaymentRegistered,
  notifyJobRequestCreated,
  notifyJobRequestMessage,
  pushSpaceData
} from "../event-service.js";
import * as pushService from "../push-service.js";
import * as notificationRepository from "../repository.js";
import { budgetDecisionRecipients } from "../event-service.js";

describe("notificaciones push de eventos de negocio", () => {
  let recordSpy: MockInstance<typeof notificationRepository.recordUserNotificationRepo>;

  beforeEach(() => {
    recordSpy = vi.spyOn(notificationRepository, "recordUserNotificationRepo").mockResolvedValue("notification-1");
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("guarda el aviso en la bandeja del destinatario y manda su id en el push", async () => {
    vi.spyOn(notificationRepository, "findCompanyManagerIdsRepo").mockResolvedValue([]);
    const sendSpy = vi.spyOn(pushService, "sendPushNotificationToUser").mockResolvedValue({ sent: 0, failed: 0 });

    await notifyBudgetDecision({ id: "b-9", company_id: "company-1", created_by: "contractor-1" }, "approved");

    expect(recordSpy).toHaveBeenCalledWith("contractor-1", expect.objectContaining({
      space: "company",
      companyId: "company-1",
      type: "budget.approved",
      title: "Presupuesto aprobado",
      data: expect.objectContaining({ budgetId: "b-9" })
    }));
    expect(sendSpy).toHaveBeenCalledWith("contractor-1", expect.objectContaining({
      data: expect.objectContaining({ type: "budget.approved", notificationId: "notification-1" })
    }));
  });

  it("los avisos del cliente quedan en su espacio y las peticiones nuevas sin empresa", async () => {
    vi.spyOn(pushService, "sendPushNotificationToUser").mockResolvedValue({ sent: 0, failed: 0 });

    await notifyInvoiceIssued({ id: "i-1", company_id: "company-1", client: { user_id: "client-1" } });
    await notifyJobRequestCreated(["contractor-1", "contractor-2"], { id: "r-1", title: "Pintar", category: "Pintura", province: "Panamá" });

    expect(recordSpy).toHaveBeenCalledWith("client-1", expect.objectContaining({ space: "client", companyId: "company-1", type: "invoice.issued" }));
    expect(recordSpy).toHaveBeenCalledWith("contractor-2", expect.objectContaining({ space: "company", companyId: null, type: "job_request.created" }));
  });

  it("el push indica el espacio y la empresa del aviso para abrirlo en el lugar correcto", async () => {
    vi.spyOn(notificationRepository, "findCompanyManagerIdsRepo").mockResolvedValue([]);
    const sendSpy = vi.spyOn(pushService, "sendPushNotificationToUser").mockResolvedValue({ sent: 0, failed: 0 });

    await notifyBudgetDecision({ id: "b-1", company_id: "company-1", created_by: "contractor-1" }, "approved");
    await notifyInvoiceIssued({ id: "i-3", company_id: "company-1", client: { user_id: "client-1" } });

    expect(sendSpy).toHaveBeenCalledWith("contractor-1", expect.objectContaining({
      data: expect.objectContaining({ space: "company", spaceCompanyId: "company-1" })
    }));
    const clientCall = sendSpy.mock.calls.find((call) => call[0] === "client-1");
    expect(clientCall?.[1].data).toMatchObject({ space: "client" });
    expect(clientCall?.[1].data).not.toHaveProperty("spaceCompanyId");
    // El espacio no se guarda en los datos de la bandeja.
    expect(recordSpy).toHaveBeenCalledWith("client-1", expect.objectContaining({
      data: expect.not.objectContaining({ space: expect.anything() })
    }));
  });

  it("los mensajes de peticiones van al espacio del otro lado de la conversación", async () => {
    const sendSpy = vi.spyOn(pushService, "sendPushNotificationToUser").mockResolvedValue({ sent: 0, failed: 0 });
    const base = { requestId: "r-1", companyId: "company-1", companyName: "Obras SA", requesterFirstName: "Ana", title: "Pintar", body: "Hola" };

    await notifyJobRequestMessage(["client-1"], { ...base, senderSide: "company" });
    await notifyJobRequestMessage(["owner-1"], { ...base, senderSide: "client" });

    expect(sendSpy.mock.calls.find((call) => call[0] === "client-1")?.[1].data).toMatchObject({ space: "client", companyId: "company-1" });
    expect(sendSpy.mock.calls.find((call) => call[0] === "owner-1")?.[1].data).toMatchObject({ space: "company", spaceCompanyId: "company-1" });
    expect(pushSpaceData(null)).toBeNull();
    expect(pushSpaceData({ space: null, companyId: "company-1" })).toBeNull();
  });

  it("no duplica en la bandeja lo que ya se muestra en la campana (solicitudes de vinculación)", async () => {
    vi.spyOn(pushService, "sendPushNotificationToUser").mockResolvedValue({ sent: 0, failed: 0 });

    await notifyClientConnectionRequest("request-1", ["owner-1"]);

    expect(recordSpy).not.toHaveBeenCalled();
  });

  it("si no se puede guardar el aviso, igual envía el push", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    recordSpy.mockRejectedValue(new Error("db caída"));
    const sendSpy = vi.spyOn(pushService, "sendPushNotificationToUser").mockResolvedValue({ sent: 1, failed: 0 });

    await notifyInvoiceIssued({ id: "i-2", company_id: "company-1", client: { user_id: "client-1" } });

    expect(sendSpy).toHaveBeenCalledWith("client-1", expect.objectContaining({
      data: expect.not.objectContaining({ notificationId: expect.anything() })
    }));
  });

  it("notifica al creador cuando el cliente aprueba o rechaza un presupuesto", async () => {
    vi.spyOn(notificationRepository, "findCompanyManagerIdsRepo").mockResolvedValue([]);
    const sendSpy = vi
      .spyOn(pushService, "sendPushNotificationToUser")
      .mockResolvedValue({ sent: 1, failed: 0 });
    const budget = {
      id: "budget-104",
      company_id: "company-1",
      created_by: "contractor-1",
      budget_number: "PRE-104"
    };

    await notifyBudgetDecision(budget, "approved");
    await notifyBudgetDecision(budget, "rejected");

    expect(sendSpy).toHaveBeenNthCalledWith(
      1,
      "contractor-1",
      expect.objectContaining({
        title: "Presupuesto aprobado",
        data: expect.objectContaining({
          type: "budget.approved",
          budgetId: "budget-104"
        })
      })
    );
    expect(sendSpy).toHaveBeenNthCalledWith(
      2,
      "contractor-1",
      expect.objectContaining({
        title: "Presupuesto rechazado",
        data: expect.objectContaining({ type: "budget.rejected" })
      })
    );
  });

  it("también avisa a owners y admins, sin repetir y con el monto aprobado", async () => {
    vi.spyOn(notificationRepository, "findCompanyManagerIdsRepo").mockResolvedValue(["owner-1", "contractor-1", "admin-2"]);
    const sendSpy = vi
      .spyOn(pushService, "sendPushNotificationToUser")
      .mockResolvedValue({ sent: 1, failed: 0 });

    await notifyBudgetDecision(
      { id: "b-1", company_id: "company-1", created_by: "contractor-1", budget_number: "PRE-7", total: 2500, currency_code: "USD" },
      "approved"
    );

    expect(sendSpy.mock.calls.map((call) => call[0])).toEqual(["contractor-1", "owner-1", "admin-2"]);
    expect(sendSpy.mock.calls[0]?.[1].body).toContain("PRE-7");
    expect(sendSpy.mock.calls[0]?.[1].body).toContain("2,500.00");
  });

  it("si no se puede leer el equipo, igual avisa al creador", async () => {
    vi.spyOn(notificationRepository, "findCompanyManagerIdsRepo").mockRejectedValue(new Error("db caída"));
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const sendSpy = vi
      .spyOn(pushService, "sendPushNotificationToUser")
      .mockResolvedValue({ sent: 1, failed: 0 });

    await notifyBudgetDecision(
      { id: "b-2", company_id: "company-1", created_by: "contractor-1", rejection_reason: "Muy caro" },
      "rejected"
    );

    expect(sendSpy).toHaveBeenCalledTimes(1);
    expect(sendSpy.mock.calls[0]?.[1].body).toContain("Muy caro");
  });

  it("calcula destinatarios únicos", () => {
    expect(budgetDecisionRecipients("a", ["b", "a", "c"])).toEqual(["a", "b", "c"]);
    expect(budgetDecisionRecipients(null, ["b"])).toEqual(["b"]);
  });

  it("notifica al usuario cliente al emitir una factura y registrar un pago", async () => {
    const sendSpy = vi
      .spyOn(pushService, "sendPushNotificationToUser")
      .mockResolvedValue({ sent: 1, failed: 0 });
    const invoice = {
      id: "invoice-22",
      company_id: "company-1",
      invoice_number: "FAC-22",
      client: { user_id: "client-1" }
    };

    await notifyInvoiceIssued(invoice);
    await notifyInvoicePaymentRegistered(invoice, { id: "payment-7" });

    expect(sendSpy).toHaveBeenNthCalledWith(
      1,
      "client-1",
      expect.objectContaining({
        title: "Factura emitida",
        data: expect.objectContaining({
          type: "invoice.issued",
          invoiceId: "invoice-22"
        })
      })
    );
    expect(sendSpy).toHaveBeenNthCalledWith(
      2,
      "client-1",
      expect.objectContaining({
        title: "Pago registrado",
        data: expect.objectContaining({
          type: "invoice.payment_registered",
          paymentId: "payment-7"
        })
      })
    );
  });

  it("omite clientes sin cuenta vinculada", async () => {
    const sendSpy = vi
      .spyOn(pushService, "sendPushNotificationToUser")
      .mockResolvedValue({ sent: 0, failed: 0 });

    await notifyInvoiceIssued({
      id: "invoice-22",
      client: { user_id: null }
    });

    expect(sendSpy).not.toHaveBeenCalled();
  });

  it("absorbe un fallo inesperado del emisor para no romper la operación principal", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.spyOn(pushService, "sendPushNotificationToUser")
      .mockRejectedValue(new Error("Expo unavailable"));

    await expect(notifyInvoiceIssued({
      id: "invoice-22",
      client: { user_id: "client-1" }
    })).resolves.toBeUndefined();
  });
});
