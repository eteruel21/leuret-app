import { safeErrorDetails } from "../security/redaction.js";
import { sendPushNotificationToUser } from "./push-service.js";
import { findCompanyManagerIdsRepo } from "./repository.js";

type UnknownRecord = Record<string, unknown>;

function asRecord(value: unknown): UnknownRecord | null {
  return value !== null && typeof value === "object"
    ? value as UnknownRecord
    : null;
}

function textField(record: UnknownRecord | null, field: string): string | null {
  const value = record?.[field];
  return typeof value === "string" && value.trim()
    ? value.trim()
    : null;
}

async function dispatchEventPush(
  recipientUserId: string | null,
  title: string,
  body: string,
  data: Record<string, unknown>
): Promise<void> {
  if (!recipientUserId) return;

  try {
    await sendPushNotificationToUser(recipientUserId, {
      title,
      body,
      data
    });
  } catch (error) {
    // El evento de negocio ya fue confirmado. Push es un efecto secundario
    // best-effort y nunca debe convertir la operación principal en un error.
    console.error(
      "No se pudo enviar la notificación push del evento:",
      safeErrorDetails(error)
    );
  }
}

function formatAmount(value: unknown, currency: string | null): string | null {
  const amount = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(amount) || amount <= 0) return null;
  try {
    return new Intl.NumberFormat("es-PA", { style: "currency", currency: currency || "USD" }).format(amount);
  } catch {
    return amount.toFixed(2);
  }
}

/** Destinatarios sin repetir: el creador primero y luego owners/admins. */
export function budgetDecisionRecipients(creatorId: string | null, managerIds: string[]): string[] {
  return [...new Set([creatorId, ...managerIds].filter((id): id is string => Boolean(id)))];
}

export async function notifyBudgetDecision(
  budgetValue: unknown,
  decision: "approved" | "rejected"
): Promise<void> {
  const budget = asRecord(budgetValue);
  const creatorId = textField(budget, "created_by");
  const budgetId = textField(budget, "id");
  const companyId = textField(budget, "company_id");
  const budgetNumber = textField(budget, "budget_number");
  const displayNumber = budgetNumber ? ` ${budgetNumber}` : "";
  const approved = decision === "approved";
  const amount = formatAmount(budget?.total, textField(budget, "currency_code"));
  const reason = textField(budget, "rejection_reason");

  // El dueño y los administradores también se enteran, no solo quien lo creó.
  let managerIds: string[] = [];
  if (creatorId && companyId) {
    try {
      managerIds = await findCompanyManagerIdsRepo(creatorId, companyId);
    } catch (error) {
      console.error("No se pudo obtener el equipo a notificar:", safeErrorDetails(error));
    }
  }

  const title = approved ? "Presupuesto aprobado" : "Presupuesto rechazado";
  const body = approved
    ? `El cliente aprobó el presupuesto${displayNumber}${amount ? ` por ${amount}` : ""}.`
    : `El cliente rechazó el presupuesto${displayNumber}${reason ? `: "${reason.slice(0, 120)}"` : "."}`;
  const data = {
    type: approved ? "budget.approved" : "budget.rejected",
    ...(budgetId ? { budgetId } : {}),
    ...(companyId ? { companyId } : {})
  };

  for (const recipientId of budgetDecisionRecipients(creatorId, managerIds)) {
    await dispatchEventPush(recipientId, title, body, data);
  }
}

export async function notifyInvoiceIssued(invoiceValue: unknown): Promise<void> {
  const invoice = asRecord(invoiceValue);
  const client = asRecord(invoice?.client);
  const recipientUserId = textField(client, "user_id");
  const invoiceId = textField(invoice, "id");
  const companyId = textField(invoice, "company_id");
  const invoiceNumber = textField(invoice, "invoice_number");
  const displayNumber = invoiceNumber ? ` ${invoiceNumber}` : "";

  await dispatchEventPush(
    recipientUserId,
    "Factura emitida",
    `Se emitió la factura${displayNumber}.`,
    {
      type: "invoice.issued",
      ...(invoiceId ? { invoiceId } : {}),
      ...(companyId ? { companyId } : {})
    }
  );
}

export async function notifyInvoicePaymentRegistered(
  invoiceValue: unknown,
  paymentValue: unknown
): Promise<void> {
  const invoice = asRecord(invoiceValue);
  const payment = asRecord(paymentValue);
  const client = asRecord(invoice?.client);
  const recipientUserId = textField(client, "user_id");
  const invoiceId = textField(invoice, "id");
  const companyId = textField(invoice, "company_id");
  const invoiceNumber = textField(invoice, "invoice_number");
  const paymentId = textField(payment, "id");
  const displayNumber = invoiceNumber ? ` ${invoiceNumber}` : "";

  await dispatchEventPush(
    recipientUserId,
    "Pago registrado",
    `Se registró un pago para la factura${displayNumber}.`,
    {
      type: "invoice.payment_registered",
      ...(invoiceId ? { invoiceId } : {}),
      ...(paymentId ? { paymentId } : {}),
      ...(companyId ? { companyId } : {})
    }
  );
}
