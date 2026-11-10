import assert from "node:assert/strict";
import { afterEach, test, vi } from "vitest";

const query = vi.fn();
const sendReminder = vi.fn();

vi.mock("../../db/pool.js", () => ({ pool: { query } }));
vi.mock("../../services/email.js", () => ({ sendInvoiceReminderEmail: sendReminder }));

const { formatReminderAmount, formatReminderDate, processInvoicePaymentReminders } = await import("../payment-reminders.js");
const { invoiceReminderCopy } = await vi.importActual<typeof import("../../services/email.js")>("../../services/email.js");

afterEach(() => {
  query.mockReset();
  sendReminder.mockReset();
});

const claimedRow = (overrides: Record<string, unknown> = {}) => ({
  reminder_id: "r-1",
  invoice_id: "f-1",
  kind: "overdue",
  client_email: "cliente@sol.com",
  client_name: "Ferretería Sol",
  company_name: "Obras Pérez",
  company_email: "info@obras.com",
  company_phone: "6000-0000",
  invoice_number: "F-1",
  due_date: "2026-11-05",
  balance_due: "700.00",
  currency_code: "USD",
  ...overrides
});

test("recordatorios: envía cada reclamo y cuenta los enviados", async () => {
  query.mockResolvedValueOnce({ rows: [claimedRow(), claimedRow({ reminder_id: "r-2", kind: "due_soon" })] });
  sendReminder.mockResolvedValue({ sent: true });

  const result = await processInvoicePaymentReminders({ limit: 10 });

  assert.deepEqual(result, { claimed: 2, sent: 2, failed: 0 });
  assert.equal(query.mock.calls[0]?.[1]?.[0], 10);
  const email = sendReminder.mock.calls[0]?.[0];
  assert.equal(email.to, "cliente@sol.com");
  assert.equal(email.invoiceNumber, "F-1");
  assert.ok(email.amount.includes("700.00"));
});

test("recordatorios: si el correo falla, libera el reclamo para reintentar", async () => {
  query.mockResolvedValueOnce({ rows: [claimedRow()] }).mockResolvedValueOnce({ rows: [] });
  sendReminder.mockResolvedValue({ sent: false, reason: "delivery_failed" });

  const result = await processInvoicePaymentReminders();

  assert.deepEqual(result, { claimed: 1, sent: 0, failed: 1 });
  assert.match(String(query.mock.calls[1]?.[0]), /release_invoice_payment_reminder/);
  assert.deepEqual(query.mock.calls[1]?.[1], ["r-1"]);
});

test("recordatorios: el tono cambia según el momento", () => {
  assert.match(invoiceReminderCopy("due_soon", "factura F-1", "$700", "5 nov").subject, /^Recordatorio/);
  assert.match(invoiceReminderCopy("overdue", "factura F-1", "$700", "5 nov").subject, /vencida/);
  assert.match(invoiceReminderCopy("overdue_week", "factura F-1", "$700", "5 nov").subject, /^Segundo aviso/);
});

test("recordatorios: formatea monto y fecha", () => {
  assert.ok(formatReminderAmount("1500.5", "USD").includes("1,500.50"));
  assert.equal(formatReminderDate("2026-11-05"), "5 de noviembre de 2026");
});
