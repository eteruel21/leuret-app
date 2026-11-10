import assert from "node:assert/strict";
import { afterEach, beforeEach, test, vi } from "vitest";

import { env } from "../../config/env.js";
import {
  buildVerificationLinks,
  buildPasswordResetLinks,
  sendVerificationEmail,
  sendPasswordResetEmail,
  buildInvitationLinks,
  sendCompanyInvitationEmail,
  sendInvoiceReminderEmail
} from "../email.js";

type MutableEmailEnvironment = {
  NODE_ENV: string;
  RESEND_API_KEY: string | undefined;
  EMAIL_FROM: string | undefined;
};

const mutableEnv = env as MutableEmailEnvironment;

const originalEmailEnvironment = {
  NODE_ENV: mutableEnv.NODE_ENV,
  RESEND_API_KEY: mutableEnv.RESEND_API_KEY,
  EMAIL_FROM: mutableEnv.EMAIL_FROM
};

const fetchMock = vi.fn();

function configureResend(): void {
  Object.assign(mutableEnv, {
    NODE_ENV: "production",
    RESEND_API_KEY: "re_test_api_key",
    EMAIL_FROM: "Leuret <noreply@example.test>"
  });
}

function captureConsole() {
  return [
    vi.spyOn(console, "log").mockImplementation(() => undefined),
    vi.spyOn(console, "warn").mockImplementation(() => undefined),
    vi.spyOn(console, "error").mockImplementation(() => undefined)
  ];
}

beforeEach(() => {
  Object.assign(mutableEnv, {
    NODE_ENV: "production",
    RESEND_API_KEY: undefined,
    EMAIL_FROM: undefined
  });

  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  Object.assign(mutableEnv, originalEmailEnvironment);
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

test("buildVerificationLinks: genera enlaces profundos y web correctos", () => {
  const token = "tok_test_verification_123";
  const { deepLink, webLink } = buildVerificationLinks(token);

  assert.equal(
    deepLink,
    "leuret://confirm-email?token=tok_test_verification_123"
  );

  assert.equal(
    webLink,
    "https://app.leurettech.com/confirm-email?token=tok_test_verification_123"
  );
});

test("buildPasswordResetLinks: genera enlaces profundos y web de recuperación correctos", () => {
  const token = "tok_test_reset_456";
  const { deepLink, webLink } = buildPasswordResetLinks(token);

  assert.equal(
    deepLink,
    "leuret://reset-password?token=tok_test_reset_456"
  );

  assert.equal(
    webLink,
    "https://app.leurettech.com/reset-password?token=tok_test_reset_456"
  );
});

test("email: producción sin Resend falla de forma segura", async () => {
  const result = await sendVerificationEmail({
    to: "sensitive-user@example.test",
    fullName: "Usuario Prueba",
    token: "sensitive-token-value"
  });

  assert.deepEqual(result, {
    sent: false,
    reason: "not_configured"
  });

  assert.equal(fetchMock.mock.calls.length, 0);
});

test("email: una entrega Resend exitosa informa sent true", async () => {
  configureResend();

  fetchMock.mockResolvedValueOnce({
    ok: true
  });

  const result = await sendVerificationEmail({
    to: "testuser@example.test",
    fullName: "Usuario Prueba",
    token: "verification-token"
  });

  assert.deepEqual(result, { sent: true });
  assert.equal(fetchMock.mock.calls.length, 1);

  const [url, options] = fetchMock.mock.calls[0] as [
    string,
    RequestInit
  ];

  assert.equal(url, "https://api.resend.com/emails");
  assert.equal(options.method, "POST");

  const headers = options.headers as Record<string, string>;

  assert.equal(
    headers.Authorization,
    "Bearer re_test_api_key"
  );

  assert.equal(
    headers["Content-Type"],
    "application/json"
  );

  const body = JSON.parse(String(options.body));

  assert.equal(
    body.from,
    "Leuret <noreply@example.test>"
  );

  assert.deepEqual(
    body.to,
    ["testuser@example.test"]
  );

  assert.equal(
    body.subject,
    "Verifica tu cuenta - Leuret"
  );
});

test("email: Resend responde con error y se informa delivery_failed", async () => {
  configureResend();

  fetchMock.mockResolvedValueOnce({
    ok: false
  });

  const result = await sendPasswordResetEmail({
    to: "testuser@example.test",
    fullName: "Usuario Prueba",
    token: "reset-token"
  });

  assert.deepEqual(result, {
    sent: false,
    reason: "delivery_failed"
  });
});

test("email: un error de red no filtra destinatario ni token", async () => {
  configureResend();

  const recipient = "private-user@example.test";
  const token = "private-reset-token";

  fetchMock.mockRejectedValueOnce(
    new Error(`Falló envío a ${recipient} usando ${token}`)
  );

  const consoleSpies = captureConsole();

  const result = await sendPasswordResetEmail({
    to: recipient,
    fullName: "Usuario Prueba",
    token
  });

  assert.deepEqual(result, {
    sent: false,
    reason: "delivery_failed"
  });

  const loggedOutput = JSON.stringify(
    consoleSpies.flatMap((spy) => spy.mock.calls)
  );

  assert.equal(loggedOutput.includes(recipient), false);
  assert.equal(loggedOutput.includes(token), false);
});
test("buildInvitationLinks: abre la invitación en la app y en la web", () => {
  const { deepLink, webLink } = buildInvitationLinks("abc_DEF-123");
  assert.equal(deepLink, "leuret://invitacion?codigo=abc_DEF-123");
  assert.equal(webLink, "https://app.leurettech.com/invitacion?codigo=abc_DEF-123");
});

test("email de invitación: incluye empresa, rol, enlaces y código, y escapa HTML", async () => {
  configureResend();
  fetchMock.mockResolvedValueOnce({ ok: true });

  const result = await sendCompanyInvitationEmail({
    to: "nuevo@example.test",
    token: "invite_token_123",
    companyName: "Obras <b>Sol</b>",
    inviterName: "Ana & Luis",
    roleLabel: "Supervisor"
  });

  assert.deepEqual(result, { sent: true });
  const [, request] = fetchMock.mock.calls[0] as [string, { body: string }];
  const payload = JSON.parse(request.body) as { to: string[]; subject: string; html: string; text: string };

  assert.deepEqual(payload.to, ["nuevo@example.test"]);
  assert.equal(payload.subject, "Te invitaron a Obras <b>Sol</b> en Leuret");
  assert.ok(payload.html.includes("Obras &lt;b&gt;Sol&lt;/b&gt;"));
  assert.ok(!payload.html.includes("<b>Sol</b>"));
  assert.ok(payload.html.includes("Ana &amp; Luis"));
  assert.ok(payload.html.includes("leuret://invitacion?codigo=invite_token_123"));
  assert.ok(payload.text.includes("Supervisor"));
  assert.ok(payload.text.includes("invite_token_123"));
});

test("email de invitación: sin Resend configurado no se envía", async () => {
  const result = await sendCompanyInvitationEmail({
    to: "nuevo@example.test",
    token: "t",
    companyName: "Sol",
    roleLabel: "Ventas"
  });
  assert.deepEqual(result, { sent: false, reason: "not_configured" });
  assert.equal(fetchMock.mock.calls.length, 0);
});

test("recordatorio de cobro: incluye las instrucciones de pago escapadas", async () => {
  configureResend();
  fetchMock.mockResolvedValueOnce({ ok: true });

  await sendInvoiceReminderEmail({
    to: "cliente@example.test",
    kind: "overdue",
    companyName: "Obras Sol",
    invoiceNumber: "F-1",
    dueDate: "5 de noviembre de 2026",
    amount: "US$700.00",
    paymentInstructions: "Yappy: 6000-0000\n<b>Banco</b> cta. 123"
  });

  const [, request] = fetchMock.mock.calls[0] as [string, { body: string }];
  const payload = JSON.parse(request.body) as { html: string; text: string };
  assert.ok(payload.html.includes("Cómo pagar"));
  assert.ok(payload.html.includes("&lt;b&gt;Banco&lt;/b&gt;"));
  assert.ok(payload.text.includes("Yappy: 6000-0000"));
});
