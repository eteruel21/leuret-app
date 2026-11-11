import { authenticatedRequest } from "./api";

export type MailboxName = "privacy" | "legal";
export type MailFolder = "inbox" | "sent" | "trash";

export interface MailThread {
  id: string;
  subject?: string | null;
  from?: string | null;
  to?: string[];
  read?: boolean;
  folder?: string;
  email_count?: number;
  received_at?: string | null;
  has_attachment?: boolean;
}

export interface MailAttachment {
  id: string;
  filename: string;
  size?: number;
}

export interface MailMessage {
  id: string;
  direction?: "inbound" | "outbound";
  from?: string;
  to?: string[];
  cc?: string[];
  reply_to?: string[];
  subject?: string;
  received_at?: string;
  read?: boolean;
  text?: string | null;
  html?: string | null;
  attachments?: MailAttachment[];
}

export interface MailPage<T> {
  data: T[];
  hasMore: boolean;
}

function root(box: MailboxName, threadId?: string): string {
  const prefix = `/admin/mail/${box}/threads`;
  return threadId ? `${prefix}/${encodeURIComponent(threadId)}` : prefix;
}

export async function listThreads(
  box: MailboxName,
  folder: MailFolder,
  after?: string
): Promise<MailPage<MailThread>> {
  const qs = new URLSearchParams({ folder });
  if (after) qs.set("after", after);
  return authenticatedRequest<MailPage<MailThread>>(`${root(box)}?${qs}`);
}

export async function listMessages(
  box: MailboxName,
  threadId: string,
  after?: string
): Promise<MailPage<MailMessage>> {
  const qs = new URLSearchParams();
  if (after) qs.set("after", after);
  const suffix = qs.toString();
  return authenticatedRequest<MailPage<MailMessage>>(
    `${root(box, threadId)}/emails${suffix ? `?${suffix}` : ""}`
  );
}

export async function getMessage(
  box: MailboxName,
  threadId: string,
  emailId: string
): Promise<MailMessage> {
  return authenticatedRequest<MailMessage>(
    `${root(box, threadId)}/emails/${encodeURIComponent(emailId)}`
  );
}

export async function markRead(box: MailboxName, threadId: string): Promise<void> {
  await authenticatedRequest(`${root(box, threadId)}/read`, {
    method: "PATCH"
  });
}

/** Mueve la conversación a la papelera (Resend la borra a los 30 días). */
export async function deleteThread(box: MailboxName, threadId: string): Promise<void> {
  await authenticatedRequest(root(box, threadId), { method: "DELETE" });
}

/** Devuelve una conversación de la papelera a Recibidos. */
export async function restoreThread(box: MailboxName, threadId: string): Promise<void> {
  await authenticatedRequest(`${root(box, threadId)}/restore`, {
    method: "POST",
    body: JSON.stringify({})
  });
}

export async function sendReply(
  box: MailboxName,
  threadId: string,
  emailId: string,
  text: string,
  idempotencyKey: string
): Promise<void> {
  await authenticatedRequest(
    `${root(box, threadId)}/emails/${encodeURIComponent(emailId)}/reply`,
    {
      method: "POST",
      body: JSON.stringify({ text, idempotencyKey })
    }
  );
}

export async function getAttachmentDownload(
  box: MailboxName,
  threadId: string,
  emailId: string,
  attachmentId: string
): Promise<{ filename: string; downloadUrl: string; expiresAt?: string }> {
  return authenticatedRequest(
    `${root(box, threadId)}/emails/${encodeURIComponent(emailId)}/attachments/${encodeURIComponent(attachmentId)}`
  );
}
