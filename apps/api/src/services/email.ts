import { env } from "../config/env.js";

type VerificationEmailInput = {
  to: string;
  fullName?: string | null;
  token: string;
};

type PasswordResetEmailInput = {
  to: string;
  fullName?: string | null;
  token: string;
};

export type EmailDeliveryResult =
  | { sent: true }
  | {
      sent: false;
      reason: "not_configured" | "delivery_failed";
    };

type ResendMessage = {
  to: string;
  subject: string;
  text: string;
  html: string;
  idempotencyKey?: string;
};

async function deliverWithResend({
  to,
  subject,
  text,
  html,
  idempotencyKey
}: ResendMessage): Promise<EmailDeliveryResult> {
  if (!env.RESEND_API_KEY || !env.EMAIL_FROM) {
    return { sent: false, reason: "not_configured" };
  }

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
        ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {})
      },
      body: JSON.stringify({
        from: env.EMAIL_FROM,
        to: [to],
        subject,
        text,
        html
      })
    });

    if (!response.ok) {
      return { sent: false, reason: "delivery_failed" };
    }

    return { sent: true };
  } catch {
    return { sent: false, reason: "delivery_failed" };
  }
}

export function buildVerificationLinks(token: string) {
  const deepLink = `leuret://confirm-email?token=${encodeURIComponent(token)}`;
  const webLink = `https://app.leurettech.com/confirm-email?token=${encodeURIComponent(token)}`;
  return { deepLink, webLink };
}

export function buildPasswordResetLinks(token: string) {
  const deepLink = `leuret://reset-password?token=${encodeURIComponent(token)}`;
  const webLink = `https://app.leurettech.com/reset-password?token=${encodeURIComponent(token)}`;
  return { deepLink, webLink };
}

export async function sendVerificationEmail({ to, fullName, token }: VerificationEmailInput): Promise<EmailDeliveryResult> {
  const name = fullName?.trim() || "Usuario";
  const htmlEntities: Record<string, string> = {
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  };
  const safeName = name.replace(/[&<>"']/g, (character) => htmlEntities[character] ?? character);
  const { webLink } = buildVerificationLinks(token);

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <title>Verifica tu cuenta - Leuret</title>
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #f8fafc; color: #1e293b; margin: 0; padding: 24px; }
        .container { max-width: 560px; margin: 0 auto; background: #ffffff; border-radius: 12px; border: 1px solid #e2e8f0; padding: 32px; }
        .header { text-align: center; border-bottom: 1px solid #f1f5f9; padding-bottom: 20px; margin-bottom: 24px; }
        .brand { font-size: 24px; font-weight: 700; color: #0f172a; text-decoration: none; }
        .title { font-size: 20px; font-weight: 600; color: #0f172a; margin-top: 0; }
        .btn-primary { display: inline-block; background-color: #2563eb; color: #ffffff !important; font-weight: 600; padding: 14px 28px; border-radius: 8px; text-decoration: none; margin: 16px 0; text-align: center; }
        .footer { font-size: 12px; color: #64748b; margin-top: 32px; border-top: 1px solid #f1f5f9; padding-top: 16px; text-align: center; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <span class="brand">🏗️ Leuret</span>
        </div>
        <h2 class="title">Verificación de Cuenta</h2>
        <p>Hola, <strong>${safeName}</strong>:</p>
        <p>Gracias por registrarte en Leuret. Por favor, confirma tu correo electrónico para activar tu cuenta:</p>
        
        <div style="text-align: center; margin: 24px 0;">
          <a href="${webLink}" class="btn-primary">Verificar</a>
        </div>

        <p>Al verificar tu correo, podrás volver a Leuret App y continuar tu registro.</p>
        <p>Este enlace vence en 24 horas y solo puede utilizarse una vez.</p>

        <p class="footer">Si no creaste esta cuenta, puedes ignorar este mensaje.<br />© Leuret</p>
      </div>
    </body>
    </html>
  `;

  const text = `
Hola ${name},

Gracias por registrarte en Leuret. Confirma tu correo para activar tu cuenta.

Verificar mi correo:
${webLink}

Este enlace vence en 24 horas y solo puede utilizarse una vez.
Después de verificar, vuelve a Leuret App para continuar.
  `.trim();

  return deliverWithResend({
    to,
    subject: "Verifica tu cuenta - Leuret",
    text,
    html
  });
}

export async function sendPasswordResetEmail({ to, token }: PasswordResetEmailInput): Promise<EmailDeliveryResult> {
  const { deepLink, webLink } = buildPasswordResetLinks(token);

  const html = `
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <title>Cambiar contraseña - Leuret</title>
</head>

<body style="margin:0; padding:0; background-color:#f4f7fb;">
  <table
    width="100%"
    cellpadding="0"
    cellspacing="0"
    border="0"
    role="presentation"
    style="width:100%; background-color:#f4f7fb;"
  >
    <tr>
      <td
        align="center"
        style="padding-top:40px; padding-right:16px; padding-bottom:40px; padding-left:16px;"
      >
        <table
          width="100%"
          cellpadding="0"
          cellspacing="0"
          border="0"
          role="presentation"
          style="width:100%; max-width:600px; background-color:#ffffff; border:1px solid #e2e8f0; border-radius:16px;"
        >
          <tr>
            <td
              bgcolor="#0f172a"
              style="background-color:#0f172a; padding-top:26px; padding-right:32px; padding-bottom:26px; padding-left:32px;"
            >
              <p
                style="margin:0; font-family:Arial, Helvetica, sans-serif; font-size:22px; line-height:28px; font-weight:700; color:#ffffff;"
              >
                Leuret
              </p>

              <p
                style="margin-top:6px; margin-right:0; margin-bottom:0; margin-left:0; font-family:Arial, Helvetica, sans-serif; font-size:13px; line-height:20px; color:#cbd5e1;"
              >
                Seguridad de tu cuenta
              </p>
            </td>
          </tr>

          <tr>
            <td
              style="padding-top:36px; padding-right:32px; padding-bottom:36px; padding-left:32px;"
            >
              <h1
                style="margin-top:0; margin-right:0; margin-bottom:20px; margin-left:0; font-family:Arial, Helvetica, sans-serif; font-size:26px; line-height:34px; font-weight:700; color:#0f172a;"
              >
                Cambia tu contraseña
              </h1>

              <p
                style="margin-top:0; margin-right:0; margin-bottom:14px; margin-left:0; font-family:Arial, Helvetica, sans-serif; font-size:15px; line-height:24px; color:#475569;"
              >
                Hola,
              </p>

              <p
                style="margin-top:0; margin-right:0; margin-bottom:26px; margin-left:0; font-family:Arial, Helvetica, sans-serif; font-size:15px; line-height:24px; color:#475569;"
              >
                Recibimos una solicitud para cambiar la contraseña de tu cuenta de Leuret.
                Utiliza el siguiente botón para establecer una nueva contraseña.
              </p>

              <table
                width="100%"
                cellpadding="0"
                cellspacing="0"
                border="0"
                role="presentation"
              >
                <tr>
                  <td align="center" style="padding-top:4px; padding-bottom:28px;">
                    <a
                      href="${webLink}"
                      style="display:inline-block; background-color:#2563eb; border-radius:10px; padding-top:14px; padding-right:28px; padding-bottom:14px; padding-left:28px; font-family:Arial, Helvetica, sans-serif; font-size:16px; line-height:20px; font-weight:700; color:#ffffff; text-decoration:none;"
                    >
                      Cambiar mi contraseña
                    </a>
                  </td>
                </tr>
              </table>

              <p
                style="margin-top:0; margin-right:0; margin-bottom:8px; margin-left:0; font-family:Arial, Helvetica, sans-serif; font-size:14px; line-height:22px; color:#64748b;"
              >
                ¿Estás usando Leuret desde tu teléfono?
              </p>

              <p
                style="margin-top:0; margin-right:0; margin-bottom:26px; margin-left:0; font-family:Arial, Helvetica, sans-serif; font-size:14px; line-height:22px;"
              >
                <a
                  href="${deepLink}"
                  style="font-family:Arial, Helvetica, sans-serif; font-size:14px; line-height:22px; font-weight:600; color:#2563eb; text-decoration:none;"
                >
                  Abrir en la aplicación móvil
                </a>
              </p>

              <table
                width="100%"
                cellpadding="0"
                cellspacing="0"
                border="0"
                role="presentation"
                style="margin-bottom:24px;"
              >
                <tr>
                  <td
                    bgcolor="#eff6ff"
                    style="background-color:#eff6ff; border-radius:10px; padding-top:16px; padding-right:18px; padding-bottom:16px; padding-left:18px;"
                  >
                    <p
                      style="margin:0; font-family:Arial, Helvetica, sans-serif; font-size:13px; line-height:21px; color:#1e40af;"
                    >
                      <strong>Importante:</strong> este enlace vence en 1 hora y solamente puede utilizarse para restablecer tu contraseña.
                    </p>
                  </td>
                </tr>
              </table>

              <p
                style="margin:0; font-family:Arial, Helvetica, sans-serif; font-size:13px; line-height:21px; color:#64748b;"
              >
                Si no solicitaste este cambio, puedes ignorar este mensaje. Tu contraseña actual seguirá funcionando.
              </p>
            </td>
          </tr>

          <tr>
            <td
              bgcolor="#f8fafc"
              style="background-color:#f8fafc; border-top:1px solid #e2e8f0; padding-top:20px; padding-right:32px; padding-bottom:20px; padding-left:32px;"
            >
              <p
                style="margin:0; font-family:Arial, Helvetica, sans-serif; font-size:12px; line-height:19px; text-align:center; color:#94a3b8;"
              >
                © 2026 Leuret · LEURET TECH
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `.trim();

  const text = `
Hola,

Recibimos una solicitud para cambiar la contraseña de tu cuenta de Leuret.

Cambiar mi contraseña:
${webLink}

Abrir en la aplicación móvil:
${deepLink}

Este enlace vence en 1 hora.

Si no solicitaste este cambio, puedes ignorar este mensaje. Tu contraseña actual seguirá funcionando.

Leuret
LEURET TECH
  `.trim();

  return deliverWithResend({
    to,
    subject: "Cambia tu contraseña | Leuret",
    text,
    html
  });
}

type CompanyInvitationEmailInput = {
  to: string;
  token: string;
  companyName: string;
  inviterName?: string | null;
  roleLabel: string;
  idempotencyKey?: string;
};

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function buildInvitationLinks(token: string) {
  const deepLink = `leuret://invitacion?codigo=${encodeURIComponent(token)}`;
  const webLink = `https://app.leurettech.com/invitacion?codigo=${encodeURIComponent(token)}`;
  return { deepLink, webLink };
}

export async function sendCompanyInvitationEmail({
  to,
  token,
  companyName,
  inviterName,
  roleLabel,
  idempotencyKey
}: CompanyInvitationEmailInput): Promise<EmailDeliveryResult> {
  const { deepLink, webLink } = buildInvitationLinks(token);
  const company = escapeHtml(companyName.trim() || "una empresa");
  const inviter = inviterName?.trim() ? escapeHtml(inviterName.trim()) : null;
  const role = escapeHtml(roleLabel);
  const email = escapeHtml(to);

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <title>Invitación a ${company} - Leuret</title>
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #f6f1e7; color: #1e2a3a; margin: 0; padding: 24px; }
        .container { max-width: 560px; margin: 0 auto; background: #ffffff; border-radius: 12px; border: 1px solid #ddd8cf; padding: 32px; }
        .brand { font-size: 22px; font-weight: 800; color: #1e2a3a; }
        .title { font-size: 20px; font-weight: 700; margin: 24px 0 8px; }
        .role { display: inline-block; background: #f9e5e3; color: #c83232; font-weight: 700; padding: 4px 10px; border-radius: 999px; }
        .btn-primary { display: inline-block; background-color: #e23d3d; color: #ffffff !important; font-weight: 700; padding: 14px 28px; border-radius: 8px; text-decoration: none; margin: 16px 0 8px; }
        .btn-secondary { display: inline-block; color: #1e2a3a !important; font-weight: 600; padding: 8px 0; text-decoration: underline; }
        .code-box { background-color: #efe9de; font-family: monospace; font-size: 13px; padding: 12px; border-radius: 6px; word-break: break-all; }
        .footer { font-size: 12px; color: #5e6d7d; margin-top: 28px; border-top: 1px solid #e7e1d7; padding-top: 16px; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="brand">Leuret</div>
        <h2 class="title">Te invitaron a ${company}</h2>
        <p>${inviter ? `<strong>${inviter}</strong> te invitó` : "Te invitaron"} a unirte al equipo de <strong>${company}</strong> como <span class="role">${role}</span>.</p>
        <p>Entra a Leuret con este mismo correo (<strong>${email}</strong>). Si todavía no tienes cuenta, puedes crearla con ese correo y confirmar que quieres unirte.</p>
        <div style="text-align: center;">
          <a href="${webLink}" class="btn-primary">Revisar invitación</a><br />
          <a href="${deepLink}" class="btn-secondary">Abrir en la app</a>
        </div>
        <p>También puedes pegar este código en <strong>Invitaciones de equipo</strong>:</p>
        <div class="code-box">${escapeHtml(token)}</div>
        <p class="footer">La invitación vence en 7 días. Si no esperabas este correo, puedes ignorarlo.</p>
      </div>
    </body>
    </html>
  `;

  const text = `
${inviterName?.trim() ? `${inviterName.trim()} te invitó` : "Te invitaron"} a unirte a ${companyName.trim() || "una empresa"} en Leuret como ${roleLabel}.

Entra a Leuret con este mismo correo (${to}).

Revisar invitación: ${webLink}
Abrir en la app: ${deepLink}

También puedes pegar este código en Invitaciones de equipo: ${token}

La invitación vence en 7 días.
  `.trim();

  return deliverWithResend({
    to,
    subject: `Te invitaron a ${companyName.trim() || "una empresa"} en Leuret`,
    text,
    html,
    ...(idempotencyKey ? { idempotencyKey } : {})
  });
}

export type InvoiceReminderKind = "due_soon" | "overdue" | "overdue_week";

type InvoiceReminderEmailInput = {
  to: string;
  kind: InvoiceReminderKind;
  clientName?: string | null;
  companyName: string;
  companyEmail?: string | null;
  companyPhone?: string | null;
  invoiceNumber?: string | null;
  dueDate: string;
  amount: string;
  paymentInstructions?: string | null;
};

/** Texto del recordatorio según el momento: cordial antes, más directo después. */
export function invoiceReminderCopy(kind: InvoiceReminderKind, invoiceLabel: string, amount: string, dueDate: string) {
  if (kind === "due_soon") {
    return {
      subject: `Recordatorio: ${invoiceLabel} vence el ${dueDate}`,
      lead: `Te recordamos que la ${invoiceLabel} por ${amount} vence el ${dueDate}.`
    };
  }
  if (kind === "overdue") {
    return {
      subject: `${invoiceLabel} vencida`,
      lead: `La ${invoiceLabel} por ${amount} venció el ${dueDate} y aún tiene saldo pendiente.`
    };
  }
  return {
    subject: `Segundo aviso: ${invoiceLabel} pendiente de pago`,
    lead: `La ${invoiceLabel} por ${amount} sigue pendiente desde el ${dueDate}. Te agradecemos ponerte al día.`
  };
}

export async function sendInvoiceReminderEmail(input: InvoiceReminderEmailInput): Promise<EmailDeliveryResult> {
  const invoiceLabel = input.invoiceNumber ? `factura ${input.invoiceNumber}` : "factura";
  const copy = invoiceReminderCopy(input.kind, invoiceLabel, input.amount, input.dueDate);
  const companyName = input.companyName.trim() || "tu contratista";
  const greeting = input.clientName?.trim() ? `Hola, ${input.clientName.trim()}:` : "Hola:";
  const contact = [input.companyPhone?.trim(), input.companyEmail?.trim()].filter(Boolean).join(" · ");
  const paymentInstructions = input.paymentInstructions?.trim() || null;
  const paymentBlockHtml = paymentInstructions
    ? `<div style="margin: 20px 0; padding: 14px 16px; border-radius: 8px; background: #efe9de;"><strong>Cómo pagar</strong><div style="margin-top: 6px; white-space: pre-line;">${escapeHtml(paymentInstructions)}</div></div>`
    : "";

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <title>${escapeHtml(copy.subject)}</title>
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #f6f1e7; color: #1e2a3a; margin: 0; padding: 24px; }
        .container { max-width: 560px; margin: 0 auto; background: #ffffff; border-radius: 12px; border: 1px solid #ddd8cf; padding: 32px; }
        .company { font-size: 18px; font-weight: 800; }
        .amount { font-size: 26px; font-weight: 800; margin: 16px 0 4px; }
        .muted { color: #5e6d7d; font-size: 14px; }
        .footer { font-size: 12px; color: #5e6d7d; margin-top: 28px; border-top: 1px solid #e7e1d7; padding-top: 16px; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="company">${escapeHtml(companyName)}</div>
        <p>${escapeHtml(greeting)}</p>
        <p>${escapeHtml(copy.lead)}</p>
        <div class="amount">${escapeHtml(input.amount)}</div>
        <div class="muted">Saldo pendiente · vence ${escapeHtml(input.dueDate)}</div>
        ${paymentBlockHtml}
        <p>Si ya realizaste el pago, ignora este mensaje. Para cualquier consulta, comunícate con ${escapeHtml(companyName)}${contact ? `: ${escapeHtml(contact)}` : "."}</p>
        <p class="footer">Enviado por Leuret en nombre de ${escapeHtml(companyName)}.</p>
      </div>
    </body>
    </html>
  `;

  const text = `
${greeting}

${copy.lead}

Saldo pendiente: ${input.amount} (vence ${input.dueDate})
${paymentInstructions ? `\nCómo pagar:\n${paymentInstructions}\n` : ""}
Si ya realizaste el pago, ignora este mensaje. Consultas: ${companyName}${contact ? ` (${contact})` : ""}.
  `.trim();

  return deliverWithResend({ to: input.to, subject: `${copy.subject} · ${companyName}`, text, html });
}
