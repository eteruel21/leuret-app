import { pool } from "../db/pool.js";
import { safeErrorDetails } from "../security/redaction.js";
import { sendInvoiceReminderEmail, type InvoiceReminderKind } from "../services/email.js";

type ClaimedReminder = {
  reminder_id: string;
  invoice_id: string;
  kind: InvoiceReminderKind;
  client_email: string;
  client_name: string | null;
  company_name: string;
  company_email: string | null;
  company_phone: string | null;
  invoice_number: string | null;
  due_date: string | Date;
  balance_due: string | number;
  currency_code: string | null;
};

export function formatReminderAmount(value: string | number, currency: string | null): string {
  const amount = Number(value);
  try {
    return new Intl.NumberFormat("es-PA", { style: "currency", currency: currency || "USD" }).format(Number.isFinite(amount) ? amount : 0);
  } catch {
    return (Number.isFinite(amount) ? amount : 0).toFixed(2);
  }
}

export function formatReminderDate(value: string | Date): string {
  const iso = value instanceof Date ? value.toISOString().slice(0, 10) : String(value).slice(0, 10);
  const date = new Date(`${iso}T12:00:00Z`);
  return Number.isNaN(date.getTime())
    ? iso
    : new Intl.DateTimeFormat("es-PA", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(date);
}

/**
 * Envía los recordatorios de cobro pendientes. La función de base de datos
 * reclama cada (factura, tipo) una sola vez; si el correo falla, se libera
 * para reintentar en la próxima corrida.
 */
export async function processInvoicePaymentReminders(options: { limit?: number } = {}) {
  const claimed = await pool.query<ClaimedReminder>(
    `SELECT * FROM private.claim_invoice_payment_reminders($1::integer)`,
    [options.limit ?? 25]
  );

  let sent = 0;
  let failed = 0;

  for (const reminder of claimed.rows) {
    const delivery = await sendInvoiceReminderEmail({
      to: reminder.client_email,
      kind: reminder.kind,
      clientName: reminder.client_name,
      companyName: reminder.company_name,
      companyEmail: reminder.company_email,
      companyPhone: reminder.company_phone,
      invoiceNumber: reminder.invoice_number,
      dueDate: formatReminderDate(reminder.due_date),
      amount: formatReminderAmount(reminder.balance_due, reminder.currency_code)
    }).catch(() => ({ sent: false as const, reason: "delivery_failed" as const }));

    if (delivery.sent) {
      sent += 1;
      continue;
    }

    failed += 1;
    try {
      await pool.query(`SELECT private.release_invoice_payment_reminder($1::uuid)`, [reminder.reminder_id]);
    } catch (error) {
      console.error("No se pudo liberar el recordatorio para reintento.", safeErrorDetails(error));
    }
  }

  return { claimed: claimed.rows.length, sent, failed };
}
