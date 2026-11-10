import { beforeEach, afterEach, describe, expect, test, vi } from "vitest";

const envMock = vi.hoisted(() => ({
  RESEND_ADMIN_MAIL_API_KEY: "re_mock_only_not_a_real_secret",
  RESEND_PRIVACY_INBOX_ID: "11111111-1111-4111-8111-111111111111",
  RESEND_LEGAL_INBOX_ID: "22222222-2222-4222-8222-222222222222"
}));

vi.mock("../../config/env.js", () => ({ env: envMock }));

import {
  listMailThreads,
  readMailMessage,
  replyToMailMessage,
  getMailAttachmentDownload,
  MailProviderError
} from "../mail-service.js";

const THREAD = "33333333-3333-4333-8333-333333333333";
const EMAIL = "44444444-4444-4444-8444-444444444444";
const KEY = "55555555-5555-4555-8555-555555555555";

describe("API Resend Inboxes - aislamiento de bandejas", () => {
  beforeEach(() => {
    envMock.RESEND_ADMIN_MAIL_API_KEY = "re_mock_only_not_a_real_secret";
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ data: [], has_more: false })
    }));
  });

  afterEach(() => vi.unstubAllGlobals());

  test("lee únicamente la bandeja Privacidad configurada en el servidor", async () => {
    const result = await listMailThreads("privacy", "inbox");
    expect(result).toEqual({ data: [], hasMore: false });
    const [url, init] = vi.mocked(fetch).mock.calls[0];
    expect(url).toBe(
      "https://api.resend.com/inboxes/11111111-1111-4111-8111-111111111111/threads?folders=inbox&limit=30"
    );
    expect((init?.headers as Record<string, string>).Authorization).toBe(
      "Bearer re_mock_only_not_a_real_secret"
    );
  });

  test("lee el mensaje en la bandeja Legal sin exponer secreto en URL", async () => {
    await readMailMessage("legal", THREAD, EMAIL);
    const [url] = vi.mocked(fetch).mock.calls[0];
    expect(String(url)).toContain("/inboxes/22222222-2222-4222-8222-222222222222/");
    expect(String(url)).not.toContain("mock_only");
  });

  test("respuesta mantiene el hilo e impide destinatarios arbitrarios", async () => {
    await replyToMailMessage("legal", THREAD, EMAIL, "Confirmamos recepción.", KEY);
    const [url, init] = vi.mocked(fetch).mock.calls[0];
    expect(url).toBe(
      `https://api.resend.com/inboxes/22222222-2222-4222-8222-222222222222/threads/${THREAD}/emails/${EMAIL}/reply`
    );
    expect((init?.headers as Record<string, string>)["Idempotency-Key"]).toBe(KEY);
    expect(JSON.parse(String(init?.body))).toEqual({
      text: "Confirmamos recepción.",
      reply_all: false
    });
  });


  test("el enlace de adjunto se emite solo tras verificar su pertenencia al correo", async () => {
    const calls: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      calls.push(url);
      return {
        ok: true,
        status: 200,
        json: async () => calls.length === 1
          ? { id: EMAIL, direction: "inbound", attachments: [{ id: KEY, filename: "evidencia.pdf" }] }
          : { download_url: "https://secure.example.com/signed-attachment", expires_at: "2026-11-10T18:00:00Z" }
      };
    }));
    const response = await getMailAttachmentDownload("privacy", THREAD, EMAIL, KEY);
    expect(response.filename).toBe("evidencia.pdf");
    expect(response.downloadUrl).toBe("https://secure.example.com/signed-attachment");
    expect(calls[1]).toBe(`https://api.resend.com/emails/receiving/${EMAIL}/attachments/${KEY}`);
  });

  test("bloquea adjuntos que no pertenecen al correo, sin solicitar URL", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ id: EMAIL, attachments: [] })
    }));
    await expect(getMailAttachmentDownload("legal", THREAD, EMAIL, KEY))
      .rejects.toBeInstanceOf(MailProviderError);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  test("falla cerrado si no existe la clave de acceso administrativo", async () => {
    envMock.RESEND_ADMIN_MAIL_API_KEY = "";
    await expect(listMailThreads("privacy", "inbox")).rejects.toBeInstanceOf(MailProviderError);
    expect(fetch).not.toHaveBeenCalled();
  });

  test("los errores de Resend no filtran contenido del proveedor", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      text: async () => "secret_upstream_should_not_be_exposed"
    }));
    try {
      await listMailThreads("privacy", "inbox");
      throw new Error("Expected failure");
    } catch (error) {
      expect(error).toBeInstanceOf(MailProviderError);
      expect(String(error)).not.toContain("secret_upstream");
    }
  });
});
