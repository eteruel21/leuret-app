import { useCallback, useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { Inbox, Send, Mail, RefreshCw, Paperclip, Loader2, Trash2, RotateCcw } from "lucide-react";
import {
  type MailboxName,
  type MailFolder,
  type MailThread,
  type MailMessage,
  listThreads,
  listMessages,
  getMessage,
  getAttachmentDownload,
  markRead,
  deleteThread,
  restoreThread,
  sendReply
} from "../mail-api";
import { errorMessage } from "../utils/helpers";
import "./mail.css";

const FOLDERS: { id: MailFolder; name: string; icon: typeof Inbox }[] = [
  { id: "inbox", name: "Recibidos", icon: Inbox },
  { id: "sent", name: "Enviados", icon: Send },
  { id: "trash", name: "Papelera", icon: Trash2 }
];

const BOXES: { id: MailboxName; name: string; address: string }[] = [
  { id: "privacy", name: "Privacidad", address: "privacidad@leurettech.com" },
  { id: "legal", name: "Asuntos legales", address: "legal@leurettech.com" }
];

function dateTime(value: string | null | undefined): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("es-PA", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "America/Panama"
  }).format(date);
}

function readableEmail(message: MailMessage | null): string {
  if (!message) return "";
  if (message.text?.trim()) return message.text;
  if (!message.html) return "(Mensaje sin texto)";
  // Mail from external senders is never inserted as HTML into the admin DOM.
  return message.html
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<br\s*\/?\s*>|<\/p>|<\/div>/gi, "\n")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .trim();
}

export function MailTab() {
  const [mailbox, setMailbox] = useState<MailboxName>("privacy");
  const [folder, setFolder] = useState<MailFolder>("inbox");
  const [threads, setThreads] = useState<MailThread[]>([]);
  const [hasMoreThreads, setHasMoreThreads] = useState(false);
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null);
  const [messages, setMessages] = useState<MailMessage[]>([]);
  const [hasMoreMessages, setHasMoreMessages] = useState(false);
  const [selectedMessageId, setSelectedMessageId] = useState<string | null>(null);
  const [message, setMessage] = useState<MailMessage | null>(null);
  const [replyText, setReplyText] = useState("");
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const [isLoadingList, setIsLoadingList] = useState(false);
  const [isLoadingThread, setIsLoadingThread] = useState(false);
  const [isLoadingMessage, setIsLoadingMessage] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [sending, setSending] = useState(false);
  const [downloading, setDownloading] = useState<string | null>(null);
  const [movingThreadId, setMovingThreadId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [refreshNumber, setRefreshNumber] = useState(0);
  const listSequence = useRef(0);

  const refresh = useCallback(() => setRefreshNumber((n) => n + 1), []);

  useEffect(() => {
    const sequence = ++listSequence.current;
    setThreads([]);
    setSelectedThreadId(null);
    setHasMoreThreads(false);
    setError(null);
    setNotice(null);
    setIsLoadingList(true);

    listThreads(mailbox, folder)
      .then((page) => {
        if (listSequence.current !== sequence) return;
        setThreads(page.data);
        setHasMoreThreads(page.hasMore);
      })
      .catch((cause: unknown) => {
        if (listSequence.current === sequence) setError(errorMessage(cause));
      })
      .finally(() => {
        if (listSequence.current === sequence) setIsLoadingList(false);
      });

    return () => {
      listSequence.current += 1;
    };
  }, [mailbox, folder, refreshNumber]);

  useEffect(() => {
    let current = true;
    setMessages([]);
    setSelectedMessageId(null);
    setMessage(null);
    setReplyText("");
    setPendingKey(null);
    setHasMoreMessages(false);
    if (!selectedThreadId) return () => { current = false; };

    setIsLoadingThread(true);
    setError(null);
    listMessages(mailbox, selectedThreadId)
      .then((page) => {
        if (!current) return;
        setMessages(page.data);
        setHasMoreMessages(page.hasMore);
        const selected = [...page.data].reverse().find((item) => item.direction === "inbound")
          ?? page.data[page.data.length - 1];
        setSelectedMessageId(selected?.id ?? null);
        if (folder === "inbox") {
          void markRead(mailbox, selectedThreadId).then(() => {
            if (current) {
              setThreads((items) => items.map((item) =>
                item.id === selectedThreadId ? { ...item, read: true } : item
              ));
            }
          }).catch(() => {
            if (current) setNotice("No se pudo actualizar el estado de lectura.");
          });
        }
      })
      .catch((cause: unknown) => {
        if (current) setError(errorMessage(cause));
      })
      .finally(() => {
        if (current) setIsLoadingThread(false);
      });

    return () => { current = false; };
  }, [mailbox, folder, selectedThreadId]);

  useEffect(() => {
    let current = true;
    setMessage(null);
    if (!selectedThreadId || !selectedMessageId) return () => { current = false; };
    setIsLoadingMessage(true);
    setError(null);
    getMessage(mailbox, selectedThreadId, selectedMessageId)
      .then((detail) => {
        if (current) setMessage(detail);
      })
      .catch((cause: unknown) => {
        if (current) setError(errorMessage(cause));
      })
      .finally(() => {
        if (current) setIsLoadingMessage(false);
      });
    return () => { current = false; };
  }, [mailbox, selectedThreadId, selectedMessageId]);

  async function loadMoreThreads() {
    const last = threads[threads.length - 1];
    if (!last || isLoadingMore) return;
    const sequence = listSequence.current;
    setIsLoadingMore(true);
    try {
      const page = await listThreads(mailbox, folder, last.id);
      if (listSequence.current !== sequence) return;
      setThreads((items) => [
        ...items,
        ...page.data.filter((thread) => !items.some((existing) => existing.id === thread.id))
      ]);
      setHasMoreThreads(page.hasMore);
    } catch (cause) {
      if (listSequence.current === sequence) setError(errorMessage(cause));
    } finally {
      if (listSequence.current === sequence) setIsLoadingMore(false);
    }
  }

  async function loadMoreMessages() {
    const last = messages[messages.length - 1];
    if (!last || !selectedThreadId || isLoadingMore) return;
    const threadId = selectedThreadId;
    setIsLoadingMore(true);
    try {
      const page = await listMessages(mailbox, threadId, last.id);
      if (threadId !== selectedThreadId) return;
      setMessages((items) => [
        ...items,
        ...page.data.filter((item) => !items.some((existing) => existing.id === item.id))
      ]);
      setHasMoreMessages(page.hasMore);
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setIsLoadingMore(false);
    }
  }

  async function openAttachment(attachmentId: string) {
    if (!selectedThreadId || !message || downloading) return;
    // Open a blank tab during the click event to avoid popup blockers.
    const preview = window.open("about:blank", "_blank");
    if (preview) preview.opener = null;
    setDownloading(attachmentId);
    setError(null);
    try {
      const link = await getAttachmentDownload(mailbox, selectedThreadId, message.id, attachmentId);
      if (preview) preview.location.href = link.downloadUrl;
      else {
        const anchor = document.createElement("a");
        anchor.href = link.downloadUrl;
        anchor.target = "_blank";
        anchor.rel = "noopener noreferrer";
        document.body.append(anchor);
        anchor.click();
        anchor.remove();
      }
    } catch (cause) {
      preview?.close();
      setError(errorMessage(cause));
    } finally {
      setDownloading(null);
    }
  }

  /**
   * Quita la conversación de la carpeta actual. No abre la siguiente de forma
   * automática para no marcarla como leída sin que el administrador la abra.
   */
  function removeFromList(threadId: string) {
    setThreads((items) => items.filter((thread) => thread.id !== threadId));
    setSelectedThreadId((current) => (current === threadId ? null : current));
  }

  async function handleDelete(thread: MailThread) {
    if (movingThreadId) return;
    const confirmed = window.confirm(
      `¿Eliminar la conversación «${thread.subject || "(Sin asunto)"}»?\n\n` +
      "Se moverá a la Papelera y se borrará definitivamente en 30 días. Hasta entonces puedes restaurarla."
    );
    if (!confirmed) return;
    setMovingThreadId(thread.id);
    setError(null);
    setNotice(null);
    try {
      await deleteThread(mailbox, thread.id);
      removeFromList(thread.id);
      setNotice("Conversación movida a la Papelera. Puedes restaurarla durante 30 días.");
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setMovingThreadId(null);
    }
  }

  async function handleRestore(thread: MailThread) {
    if (movingThreadId) return;
    setMovingThreadId(thread.id);
    setError(null);
    setNotice(null);
    try {
      await restoreThread(mailbox, thread.id);
      removeFromList(thread.id);
      setNotice("Conversación restaurada en Recibidos.");
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setMovingThreadId(null);
    }
  }

  async function handleReply(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedThreadId || !message || !replyText.trim() || sending) return;
    const target = message.direction === "inbound" ? (message.reply_to?.length ? message.reply_to.join(", ") : message.from ?? "el remitente") : (message.to ?? []).join(", ");
    const confirmed = window.confirm(
      `¿Enviar esta respuesta desde ${BOXES.find((box) => box.id === mailbox)?.address} a ${target}? El envío no se puede deshacer.`
    );
    if (!confirmed) return;
    const key = pendingKey ?? crypto.randomUUID();
    setPendingKey(key);
    setSending(true);
    setError(null);
    setNotice(null);
    try {
      await sendReply(mailbox, selectedThreadId, message.id, replyText.trim(), key);
      setReplyText("");
      setPendingKey(null);
      setNotice("Respuesta enviada correctamente al correo del destinatario.");
      try {
        const page = await listMessages(mailbox, selectedThreadId);
        setMessages(page.data);
        setHasMoreMessages(page.hasMore);
        setSelectedMessageId(page.data[page.data.length - 1]?.id ?? null);
      } catch {
        setNotice("Respuesta enviada. Actualiza la bandeja si todavía no aparece en la conversación.");
      }
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setSending(false);
    }
  }

  const selectedThread = threads.find((thread) => thread.id === selectedThreadId);
  const recipient = message?.direction === "inbound"
    ? (message.reply_to?.length ? message.reply_to.join(", ") : message.from ?? "Remitente")
    : (message?.to ?? []).join(", ");
  const currentBox = BOXES.find((item) => item.id === mailbox)!;
  const currentFolder = FOLDERS.find((item) => item.id === folder)!;
  const inTrash = folder === "trash";

  return (
    <section className="mail-section" aria-label="Gestión de correo electrónico">
      <div className="mail-toolbar">
        <div className="mail-mailboxes" role="group" aria-label="Bandeja">
          {BOXES.map((box) => (
            <button key={box.id} type="button"
              className={`mail-box-choice ${mailbox === box.id ? "selected" : ""}`}
              onClick={() => setMailbox(box.id)}
              aria-pressed={mailbox === box.id}>
              <Mail size={16} />
              <span><strong>{box.name}</strong><small>{box.address}</small></span>
            </button>
          ))}
        </div>
        <button type="button" className="button button-secondary" onClick={refresh} disabled={isLoadingList}>
          <RefreshCw size={16} className={isLoadingList ? "spin" : ""} /> Actualizar correos
        </button>
      </div>
      <div className="mail-folder-tabs" role="group" aria-label="Carpeta">
        {FOLDERS.map(({ id, name, icon: Icon }) => (
          <button key={id} type="button" className={folder === id ? "selected" : ""}
            onClick={() => setFolder(id)} aria-pressed={folder === id}>
            <Icon size={16} /> {name}
          </button>
        ))}
      </div>
      {error && <div role="alert" className="mail-alert">{error}</div>}
      {notice && <div role="status" className="mail-notice">{notice}</div>}
      <div className="mail-workspace">
        <aside className="mail-thread-list" aria-label="Lista de correos">
          <div className="mail-pane-heading">
            <strong>{currentFolder.name} · {currentBox.name}</strong>
            <small>
              {threads.length} conversaciones
              {inTrash && " · se borran definitivamente a los 30 días"}
            </small>
          </div>
          {isLoadingList && <p className="mail-placeholder"><Loader2 className="spin" size={18}/> Cargando correos...</p>}
          {!isLoadingList && threads.length === 0 && <p className="mail-placeholder">No hay correos en esta carpeta.</p>}
          {threads.map((thread) => (
            <div key={thread.id} className={`mail-thread-row ${selectedThreadId === thread.id ? "selected" : ""}`}>
            <button type="button"
              className={`mail-thread ${selectedThreadId === thread.id ? "selected" : ""}`}
              onClick={() => { setSelectedThreadId(thread.id); setNotice(null); }}>
              <span className="mail-thread-title">
                <strong>{thread.subject || "(Sin asunto)"}</strong>
                {thread.read === false && <span className="mail-unread" title="Sin leer" aria-label="Sin leer"/>}
              </span>
              <span className="mail-thread-from">{thread.from || thread.to?.join(", ") || "Correo"}</span>
              <span className="mail-thread-meta">
                <small>{dateTime(thread.received_at)}</small>
                {thread.has_attachment && <Paperclip size={14} aria-label="Incluye adjunto"/>}
              </span>
            </button>
            <button type="button" className="mail-thread-action"
              onClick={() => void (inTrash ? handleRestore(thread) : handleDelete(thread))}
              disabled={movingThreadId !== null}
              title={inTrash ? "Restaurar en Recibidos" : "Eliminar conversación"}
              aria-label={`${inTrash ? "Restaurar" : "Eliminar"} «${thread.subject || "Sin asunto"}»`}>
              {movingThreadId === thread.id
                ? <Loader2 size={15} className="spin"/>
                : inTrash ? <RotateCcw size={15}/> : <Trash2 size={15}/>}
            </button>
            </div>
          ))}
          {hasMoreThreads && (
            <button className="mail-more" onClick={() => void loadMoreThreads()} disabled={isLoadingMore}>
              {isLoadingMore ? "Cargando..." : "Cargar más correos"}
            </button>
          )}
        </aside>
        <div className="mail-reader">
          {!selectedThreadId ? (
            <div className="mail-empty"><Mail size={40}/><h3>Selecciona un correo para leerlo</h3>
              <p>Las respuestas se enviarán por correo electrónico, no mediante chat.</p>
            </div>
          ) : (
            <>
              <div className="mail-pane-heading mail-reader-heading">
                <div>
                  <strong>{selectedThread?.subject || "(Sin asunto)"}</strong>
                  <small>{messages.length} mensajes en esta conversación</small>
                </div>
                {selectedThread && (
                  inTrash ? (
                    <button type="button" className="button button-secondary"
                      onClick={() => void handleRestore(selectedThread)} disabled={movingThreadId !== null}>
                      {movingThreadId === selectedThread.id ? <Loader2 size={16} className="spin"/> : <RotateCcw size={16}/>}
                      Restaurar
                    </button>
                  ) : (
                    <button type="button" className="button mail-delete-button"
                      onClick={() => void handleDelete(selectedThread)} disabled={movingThreadId !== null || sending}>
                      {movingThreadId === selectedThread.id ? <Loader2 size={16} className="spin"/> : <Trash2 size={16}/>}
                      Eliminar
                    </button>
                  )
                )}
              </div>
              {isLoadingThread && <p className="mail-placeholder"><Loader2 size={18} className="spin"/> Abriendo correo...</p>}
              {messages.length > 0 && (
                <div className="mail-messages">
                  {messages.map((entry) => (
                    <button key={entry.id} type="button"
                      className={`mail-message-choice ${selectedMessageId === entry.id ? "selected" : ""}`}
                      onClick={() => { setSelectedMessageId(entry.id); setReplyText(""); setPendingKey(null); }}>
                      <strong>{entry.direction === "outbound" ? "Enviado" : "Recibido"}</strong>
                      <span>{entry.from || "Remitente"}</span>
                      <small>{dateTime(entry.received_at)}</small>
                    </button>
                  ))}
                  {hasMoreMessages && (
                    <button className="mail-more" disabled={isLoadingMore} onClick={() => void loadMoreMessages()}>
                      {isLoadingMore ? "Cargando..." : "Cargar más mensajes"}
                    </button>
                  )}
                </div>
              )}
              {isLoadingMessage && <p className="mail-placeholder">Cargando contenido...</p>}
              {message && !isLoadingMessage && (
                <article className="mail-detail">
                  <div className="mail-envelope">
                    <p><strong>De:</strong> {message.from || "Sin remitente"}</p>
                    <p><strong>Para:</strong> {(message.to ?? []).join(", ") || currentBox.address}</p>
                    <p><strong>Fecha:</strong> {dateTime(message.received_at)}</p>
                  </div>
                  <div className="mail-message-body">{readableEmail(message)}</div>
                  {(message.attachments?.length ?? 0) > 0 && (
                    <div className="mail-attachments">
                      <strong>Archivos adjuntos</strong>
                      {message.attachments?.map((attachment) => (
                        <button className="mail-attachment-button" key={attachment.id} type="button"
                          onClick={() => void openAttachment(attachment.id)} disabled={downloading !== null}>
                          {downloading === attachment.id ? <Loader2 className="spin" size={14}/> : <Paperclip size={14}/>}
                          <span>{attachment.filename} {attachment.size ? `(${Math.ceil(attachment.size / 1024)} KB)` : ""}</span>
                          <small>Abrir adjunto</small>
                        </button>
                      ))}
                      <small>Abre archivos únicamente si conoces y confías en el remitente.</small>
                    </div>
                  )}
                  {inTrash ? (
                    <p className="mail-trash-hint">
                      Esta conversación está en la Papelera. Restáurala para responder.
                    </p>
                  ) : (
                  <form className="mail-reply-form" onSubmit={(event) => void handleReply(event)}>
                    <label htmlFor="admin-mail-reply">Responder por correo a {recipient}</label>
                    <textarea id="admin-mail-reply" value={replyText} rows={6} maxLength={20000}
                      placeholder="Escribe tu respuesta..." onChange={(event) => {
                        setReplyText(event.target.value);
                        setPendingKey(null);
                      }} disabled={sending}/>
                    <div className="mail-reply-actions">
                      <span>Desde: {currentBox.address}</span>
                      <button className="button button-primary" type="submit"
                        disabled={sending || !replyText.trim() || !message.id}>
                        {sending ? <Loader2 className="spin" size={16}/> : <Send size={16}/>}
                        {sending ? "Enviando..." : "Enviar respuesta"}
                      </button>
                    </div>
                  </form>
                  )}
                </article>
              )}
            </>
          )}
        </div>
      </div>
    </section>
  );
}
