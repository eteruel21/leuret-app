import { env } from "../config/env.js";

export type MailboxName = "privacy" | "legal";

type MailboxConfig = { id: string; address: string };

export class MailProviderError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number = 503
  ) {
    super(message);
    this.name = "MailProviderError";
  }
}

function configuration(mailbox: MailboxName): { apiKey: string; inbox: MailboxConfig } {
  const id = mailbox === "privacy"
    ? env.RESEND_PRIVACY_INBOX_ID
    : env.RESEND_LEGAL_INBOX_ID;

  if (!env.RESEND_ADMIN_MAIL_API_KEY || !id) {
    throw new MailProviderError(
      "El buzón todavía no está configurado en el servidor. Comprueba la clave administrativa de Resend y el identificador de la bandeja."
    );
  }

  return {
    apiKey: env.RESEND_ADMIN_MAIL_API_KEY,
    inbox: {
      id,
      address: mailbox === "privacy" ? "privacidad@leurettech.com" : "legal@leurettech.com"
    }
  };
}

async function requestResend(
  mailbox: MailboxName,
  path: string,
  options: { method?: "GET" | "PATCH" | "POST"; body?: unknown; idempotencyKey?: string } = {}
): Promise<unknown> {
  const { apiKey } = configuration(mailbox);
  let response: Response;

  try {
    response = await fetch(`https://api.resend.com${path}`, {
      method: options.method ?? "GET",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        Accept: "application/json",
        "Content-Type": "application/json",
        "User-Agent": "leuret-admin/1.0",
        ...(options.idempotencyKey ? { "Idempotency-Key": options.idempotencyKey } : {})
      },
      ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
      signal: AbortSignal.timeout(12000)
    });
  } catch {
    throw new MailProviderError("No fue posible comunicarse con el servicio de correo.");
  }

  if (!response.ok) {
    if (response.status === 401 || response.status === 403) {
      throw new MailProviderError(
        "La clave de Resend no tiene acceso a las bandejas. Se requiere una clave con acceso completo para leer correos."
      );
    }
    if (response.status === 404) {
      throw new MailProviderError("No se encontró el mensaje o la bandeja solicitados.", 404);
    }
    if (response.status === 429) {
      throw new MailProviderError("El servicio de correo alcanzó su límite temporal. Inténtalo más tarde.", 503);
    }
    // Do not expose provider response bodies: they might contain sensitive data.
    throw new MailProviderError("Resend no pudo completar la operación solicitada.");
  }

  try {
    return await response.json();
  } catch {
    throw new MailProviderError("El proveedor devolvió una respuesta no válida.");
  }
}

function basePath(mailbox: MailboxName): string {
  return `/inboxes/${configuration(mailbox).inbox.id}`;
}

export function mailboxAddress(mailbox: MailboxName): string {
  return configuration(mailbox).inbox.address;
}

function page(data: unknown): { data: unknown[]; hasMore: boolean } {
  if (!data || typeof data !== "object") {
    throw new MailProviderError("La bandeja devolvió una respuesta no válida.");
  }
  const result = data as { data?: unknown; has_more?: unknown };
  if (!Array.isArray(result.data)) {
    throw new MailProviderError("La bandeja devolvió una lista no válida.");
  }
  return { data: result.data, hasMore: result.has_more === true };
}

export async function listMailThreads(
  mailbox: MailboxName,
  folder: "inbox" | "sent",
  cursor?: string
): Promise<{ data: unknown[]; hasMore: boolean }> {
  const qs = new URLSearchParams({ folders: folder, limit: "30" });
  if (cursor) qs.set("after", cursor);
  return page(await requestResend(mailbox, `${basePath(mailbox)}/threads?${qs.toString()}`));
}

export async function listMailMessages(
  mailbox: MailboxName,
  threadId: string,
  cursor?: string
): Promise<{ data: unknown[]; hasMore: boolean }> {
  const qs = new URLSearchParams({ limit: "30" });
  if (cursor) qs.set("after", cursor);
  return page(await requestResend(
    mailbox,
    `${basePath(mailbox)}/threads/${threadId}/emails?${qs.toString()}`
  ));
}

export async function readMailMessage(
  mailbox: MailboxName,
  threadId: string,
  emailId: string
): Promise<unknown> {
  return requestResend(mailbox, `${basePath(mailbox)}/threads/${threadId}/emails/${emailId}`);
}

export async function markMailThreadRead(
  mailbox: MailboxName,
  threadId: string
): Promise<void> {
  await requestResend(mailbox, `${basePath(mailbox)}/threads/${threadId}`, {
    method: "PATCH",
    body: { read: true }
  });
}

export async function replyToMailMessage(
  mailbox: MailboxName,
  threadId: string,
  emailId: string,
  text: string,
  idempotencyKey: string
): Promise<unknown> {
  return requestResend(
    mailbox,
    `${basePath(mailbox)}/threads/${threadId}/emails/${emailId}/reply`,
    { method: "POST", body: { text, reply_all: false }, idempotencyKey }
  );
}
