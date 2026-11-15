import type {
  FastifyInstance,
  FastifyReply,
  FastifyRequest
} from "fastify";

import {
  authenticateRequest,
  companyRoles,
  requireActiveUser,
  requireCompanyRole
} from "../auth/authenticate.js";

import {
  budgetQuerySchema,
  cancelInvoiceCreditNoteSchema,
  cancelInvoiceSchema,
  companyQuerySchema,
  createInvoiceCreditNoteSchema,
  createInvoicePaymentSchema,
  createInvoiceSchema,
  invoiceActionSchema,
  invoiceCreditNoteParamsSchema,
  invoiceParamsSchema,
  invoiceRequestsQuerySchema,
  invoicePaymentParamsSchema,
  invoiceStatusSchema,
  reverseInvoicePaymentSchema
} from "./schemas.js";

import {
  cancelInvoiceCreditNoteService,
  cancelInvoiceService,
  createAndIssueInvoiceService,
  createInvoiceService,
  getInvoiceByBudgetService,
  getInvoiceByIdService,
  getInvoiceCreditNotesService,
  getInvoiceHistoryService,
  getInvoiceRequestsService,
  getInvoicePaymentsService,
  getInvoicesService,
  issueInvoiceCreditNoteService,
  issueInvoiceService,
  recordInvoicePaymentService,
  reverseInvoicePaymentService,
  transitionInvoiceStatusService
} from "./services.js";

function authenticatedUserId(
  request: FastifyRequest,
  reply: FastifyReply
): string | null {
  const userId = request.authenticatedUser?.id;

  if (!userId) {
    reply.status(401).send({
      message: "Se requiere autenticación."
    });
    return null;
  }

  return userId;
}

/**
 * Las funciones de facturación lanzan mensajes en español (RAISE EXCEPTION).
 * Se devuelven al usuario con un código 4xx en lugar de un 500 genérico.
 */
function sendInvoiceDatabaseError(error: unknown, reply: FastifyReply): boolean {
  if (typeof error !== "object" || error === null || !("code" in error)) return false;
  const code = String((error as { code?: unknown }).code ?? "");
  const message = error instanceof Error && error.message ? error.message : "No se pudo completar la acción.";
  const status =
    code === "P0001" || code === "55000" || code === "23505" ? 409
      : code === "22023" || code === "22P02" ? 400
        : code === "42501" ? 403
          : code === "P0002" ? 404
            : null;
  if (!status) return false;
  reply.status(status).send({ message });
  return true;
}

export async function registerInvoiceRoutes(
  app: FastifyInstance
): Promise<void> {
  // Genera la factura de un presupuesto aprobado: crear y emitir en un solo paso.
  app.post(
    "/invoices/from-budget",
    {
      preHandler: [authenticateRequest, requireActiveUser, requireCompanyRole(["owner", "admin", "sales"], "body")]
    },
    async (request, reply) => {
      const userId = authenticatedUserId(request, reply);
      if (!userId) return;

      const body = createInvoiceSchema.safeParse(request.body);
      if (!body.success) {
        return reply.status(400).send({ message: "Los datos de la factura no son válidos." });
      }

      try {
        const invoice = await createAndIssueInvoiceService(userId, body.data);
        if (!invoice) return reply.status(500).send({ message: "No se pudo generar la factura." });
        return reply.status(201).send({ invoice });
      } catch (error) {
        if (sendInvoiceDatabaseError(error, reply)) return;
        throw error;
      }
    }
  );

  // Solicitudes de factura de los clientes (obras terminadas).
  app.get(
    "/companies/:companyId/invoice-requests",
    {
      preHandler: [authenticateRequest, requireActiveUser, requireCompanyRole(["owner", "admin", "sales"])]
    },
    async (request, reply) => {
      const userId = authenticatedUserId(request, reply);
      if (!userId) return;

      const companyId = (request.params as { companyId?: string }).companyId ?? "";
      const query = invoiceRequestsQuerySchema.safeParse(request.query ?? {});
      if (!/^[0-9a-f-]{36}$/i.test(companyId) || !query.success) {
        return reply.status(400).send({ message: "Parámetros no válidos." });
      }

      reply.header("Cache-Control", "private, no-store");
      return { requests: await getInvoiceRequestsService(userId, companyId, query.data.status) };
    }
  );

  app.get(
    "/invoices",
    {
      preHandler: [authenticateRequest, requireActiveUser, requireCompanyRole(companyRoles, "query")]
    },
    async (request, reply) => {
      const userId = authenticatedUserId(request, reply);
      if (!userId) return;

      const query = companyQuerySchema.safeParse(request.query);
      if (!query.success) {
        return reply.status(400).send({
          message: "La empresa no es válida."
        });
      }

      const invoices = await getInvoicesService(userId, query.data.companyId);
      return { invoices };
    }
  );

  app.get(
    "/invoices/by-budget",
    {
      preHandler: [authenticateRequest, requireActiveUser, requireCompanyRole(["owner", "admin", "sales"], "query")]
    },
    async (request, reply) => {
      const userId = authenticatedUserId(request, reply);
      if (!userId) return;

      const query = budgetQuerySchema.safeParse(request.query);
      if (!query.success) {
        return reply.status(400).send({
          message: "El presupuesto no es válido."
        });
      }

      const invoice = await getInvoiceByBudgetService(userId, query.data.companyId, query.data.budgetId);
      return { invoice };
    }
  );

  app.get(
    "/invoices/:invoiceId",
    {
      preHandler: [authenticateRequest, requireActiveUser, requireCompanyRole(companyRoles, "query")]
    },
    async (request, reply) => {
      const userId = authenticatedUserId(request, reply);
      if (!userId) return;

      const params = invoiceParamsSchema.safeParse(request.params);
      const query = companyQuerySchema.safeParse(request.query);

      if (!params.success || !query.success) {
        return reply.status(400).send({
          message: "La factura no es válida."
        });
      }

      const invoice = await getInvoiceByIdService(userId, params.data.invoiceId, query.data.companyId);

      if (!invoice) {
        return reply.status(404).send({
          message: "No se encontró la factura."
        });
      }

      return { invoice };
    }
  );

  app.post(
    "/invoices",
    {
      preHandler: [authenticateRequest, requireActiveUser, requireCompanyRole(["owner", "admin", "sales"], "body")]
    },
    async (request, reply) => {
      const userId = authenticatedUserId(request, reply);
      if (!userId) return;

      const body = createInvoiceSchema.safeParse(request.body);
      if (!body.success) {
        return reply.status(400).send({
          message: "Los datos de la factura no son válidos."
        });
      }

      const invoice = await createInvoiceService(userId, body.data);

      if (!invoice) {
        return reply.status(500).send({
          message: "No se pudo crear la factura."
        });
      }

      return reply.status(201).send({ invoice });
    }
  );

  app.get(
    "/invoices/:invoiceId/history",
    {
      preHandler: [authenticateRequest, requireActiveUser, requireCompanyRole(companyRoles, "query")]
    },
    async (request, reply) => {
      const userId = authenticatedUserId(request, reply);
      if (!userId) return;

      const params = invoiceParamsSchema.safeParse(request.params);
      const query = companyQuerySchema.safeParse(request.query);

      if (!params.success || !query.success) {
        return reply.status(400).send({
          message: "La factura no es válida."
        });
      }

      const history = await getInvoiceHistoryService(
        userId,
        params.data.invoiceId,
        query.data.companyId
      );

      return { history };
    }
  );

  app.patch(
    "/invoices/:invoiceId/status",
    {
      preHandler: [authenticateRequest, requireActiveUser, requireCompanyRole(["owner", "admin", "sales"], "body")]
    },
    async (request, reply) => {
      const userId = authenticatedUserId(request, reply);
      if (!userId) return;

      const params = invoiceParamsSchema.safeParse(request.params);
      const body = invoiceStatusSchema.safeParse(request.body);

      if (!params.success || !body.success) {
        return reply.status(400).send({
          message: "El estado de la factura no es válido."
        });
      }

      const invoice = await transitionInvoiceStatusService(
        userId,
        params.data.invoiceId,
        body.data
      );

      if (!invoice) {
        return reply.status(404).send({
          message: "No se encontró la factura."
        });
      }

      return { invoice };
    }
  );

  app.post(
    "/invoices/:invoiceId/issue",
    {
      preHandler: [authenticateRequest, requireActiveUser, requireCompanyRole(["owner", "admin", "sales"], "body")]
    },
    async (request, reply) => {
      const userId = authenticatedUserId(request, reply);
      if (!userId) return;

      const params = invoiceParamsSchema.safeParse(request.params);
      const body = invoiceActionSchema.safeParse(request.body);

      if (!params.success || !body.success) {
        return reply.status(400).send({
          message: "Los datos de emisión no son válidos."
        });
      }

      const invoice = await issueInvoiceService(
        userId,
        params.data.invoiceId,
        body.data.companyId
      );

      if (!invoice) {
        return reply.status(404).send({
          message: "No se encontró la factura."
        });
      }

      return { invoice };
    }
  );

  app.post(
    "/invoices/:invoiceId/cancel",
    {
      preHandler: [
        authenticateRequest,
        requireActiveUser,
        requireCompanyRole(["owner", "admin"], "body")
      ]
    },
    async (request, reply) => {
      const userId = authenticatedUserId(request, reply);
      if (!userId) return;

      const params = invoiceParamsSchema.safeParse(request.params);
      const body = cancelInvoiceSchema.safeParse(request.body);

      if (!params.success || !body.success) {
        return reply.status(400).send({
          message: "Los datos de cancelación no son válidos."
        });
      }

      const invoice = await cancelInvoiceService(
        userId,
        params.data.invoiceId,
        body.data
      );

      if (!invoice) {
        return reply.status(404).send({
          message: "No se encontró la factura."
        });
      }

      return { invoice };
    }
  );

  app.get(
    "/invoices/:invoiceId/credit-notes",
    {
      preHandler: [authenticateRequest, requireActiveUser, requireCompanyRole(companyRoles, "query")]
    },
    async (request, reply) => {
      const userId = authenticatedUserId(request, reply);
      if (!userId) return;

      const params = invoiceParamsSchema.safeParse(request.params);
      const query = companyQuerySchema.safeParse(request.query);

      if (!params.success || !query.success) {
        return reply.status(400).send({
          message: "La factura no es válida."
        });
      }

      const creditNotes = await getInvoiceCreditNotesService(
        userId,
        params.data.invoiceId,
        query.data.companyId
      );

      return { creditNotes };
    }
  );

  app.post(
    "/invoices/:invoiceId/credit-notes",
    {
      preHandler: [
        authenticateRequest,
        requireActiveUser,
        requireCompanyRole(["owner", "admin"], "body")
      ]
    },
    async (request, reply) => {
      const userId = authenticatedUserId(request, reply);
      if (!userId) return;

      const params = invoiceParamsSchema.safeParse(request.params);
      const body = createInvoiceCreditNoteSchema.safeParse(request.body);

      if (!params.success || !body.success) {
        return reply.status(400).send({
          message: "Los datos de la nota de crédito no son válidos."
        });
      }

      const result = await issueInvoiceCreditNoteService(
        userId,
        params.data.invoiceId,
        body.data
      );

      if (!result?.creditNote || !result.invoice) {
        return reply.status(500).send({
          message: "No se pudo emitir la nota de crédito."
        });
      }

      return reply.status(201).send(result);
    }
  );

  app.post(
    "/invoices/:invoiceId/credit-notes/:creditNoteId/cancel",
    {
      preHandler: [
        authenticateRequest,
        requireActiveUser,
        requireCompanyRole(["owner", "admin"], "body")
      ]
    },
    async (request, reply) => {
      const userId = authenticatedUserId(request, reply);
      if (!userId) return;

      const params = invoiceCreditNoteParamsSchema.safeParse(request.params);
      const body = cancelInvoiceCreditNoteSchema.safeParse(request.body);

      if (!params.success || !body.success) {
        return reply.status(400).send({
          message: "Los datos de cancelación no son válidos."
        });
      }

      const result = await cancelInvoiceCreditNoteService(
        userId,
        params.data.invoiceId,
        params.data.creditNoteId,
        body.data
      );

      if (!result?.creditNote || !result.invoice) {
        return reply.status(404).send({
          message: "No se encontró la nota de crédito."
        });
      }

      return result;
    }
  );

  app.get(
    "/invoices/:invoiceId/payments",
    {
      preHandler: [authenticateRequest, requireActiveUser, requireCompanyRole(companyRoles, "query")]
    },
    async (request, reply) => {
      const userId = authenticatedUserId(request, reply);
      if (!userId) return;

      const params = invoiceParamsSchema.safeParse(request.params);
      const query = companyQuerySchema.safeParse(request.query);

      if (!params.success || !query.success) {
        return reply.status(400).send({
          message: "La factura no es válida."
        });
      }

      const payments = await getInvoicePaymentsService(
        userId,
        params.data.invoiceId,
        query.data.companyId
      );

      return { payments };
    }
  );

  app.post(
    "/invoices/:invoiceId/payments",
    {
      preHandler: [authenticateRequest, requireActiveUser, requireCompanyRole(["owner", "admin", "sales"], "body")]
    },
    async (request, reply) => {
      const userId = authenticatedUserId(request, reply);
      if (!userId) return;

      const params = invoiceParamsSchema.safeParse(request.params);
      const body = createInvoicePaymentSchema.safeParse(request.body);

      if (!params.success || !body.success) {
        return reply.status(400).send({
          message: "Los datos del pago no son válidos."
        });
      }

      const result = await recordInvoicePaymentService(
        userId,
        params.data.invoiceId,
        body.data
      );

      if (!result?.payment || !result.invoice) {
        return reply.status(500).send({
          message: "No se pudo registrar el pago."
        });
      }

      return reply.status(201).send(result);
    }
  );

  app.post(
    "/invoices/:invoiceId/payments/:paymentId/reverse",
    {
      preHandler: [authenticateRequest, requireActiveUser, requireCompanyRole(["owner", "admin"], "body")]
    },
    async (request, reply) => {
      const userId = authenticatedUserId(request, reply);
      if (!userId) return;

      const params = invoicePaymentParamsSchema.safeParse(request.params);
      const body = reverseInvoicePaymentSchema.safeParse(request.body);

      if (!params.success || !body.success) {
        return reply.status(400).send({
          message: "Los datos de reversión no son válidos."
        });
      }

      const result = await reverseInvoicePaymentService(
        userId,
        params.data.invoiceId,
        params.data.paymentId,
        body.data
      );

      if (!result?.payment || !result.invoice) {
        return reply.status(404).send({
          message: "No se encontró el pago."
        });
      }

      return result;
    }
  );
}
