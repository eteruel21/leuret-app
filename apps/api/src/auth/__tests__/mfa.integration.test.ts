import { randomBytes } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { buildApp } from "../../app.js";
import { env } from "../../config/env.js";
import { adminPool } from "../../db/test-db.js";
import { decryptMfaSecret } from "../mfa-crypto.js";
import { hashPassword } from "../services.js";
import { currentTotpStep, hotp } from "../totp.js";
import { installTurnstileTestMock } from "./turnstile-test-helper.js";

const mutableEnv = env as unknown as { MFA_ENCRYPTION_KEY?: string; ADMIN_MFA_REQUIRED: boolean };

describe("MFA (TOTP) del superadministrador", () => {
  let app: FastifyInstance;
  const suffix = Math.floor(Math.random() * 1_000_000);
  const password = "Password123!";
  const adminEmail = `mfa_admin_${suffix}@example.com`;
  const contractorEmail = `mfa_contractor_${suffix}@example.com`;
  let adminId: string;
  let contractorId: string;
  let recoveryCodes: string[] = [];
  let secret: Buffer;

  async function createUser(email: string, role: "super_admin" | "contractor") {
    const hash = await hashPassword(password);
    const result = await adminPool.query<{ id: string }>(
      `INSERT INTO app_auth.users (email, password_hash, email_confirmed_at) VALUES ($1, $2, now()) RETURNING id`,
      [email, hash]
    );
    const id = result.rows[0]!.id;
    await adminPool.query(
      `UPDATE public.profiles SET active = true, approved_at = now(), role = $2::public.global_user_role WHERE id = $1`,
      [id, role]
    );
    return id;
  }

  async function login(email: string) {
    return app.inject({
      method: "POST",
      url: "/auth/login",
      payload: { email, password, captchaToken: "login-test", clientType: "native" }
    });
  }

  function auth(accessToken: string) {
    return { authorization: `Bearer ${accessToken}` };
  }

  async function verify(mfaToken: string, body: { code?: string; recoveryCode?: string }) {
    return app.inject({
      method: "POST",
      url: "/auth/mfa/verify",
      payload: { mfaToken, clientType: "native", ...body }
    });
  }

  async function freshChallenge() {
    const response = await login(adminEmail);
    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.mfaRequired).toBe(true);
    expect(body.accessToken).toBeUndefined();
    return body.mfaToken as string;
  }

  beforeAll(async () => {
    installTurnstileTestMock();
    mutableEnv.MFA_ENCRYPTION_KEY = randomBytes(32).toString("base64");
    mutableEnv.ADMIN_MFA_REQUIRED = true;

    adminId = await createUser(adminEmail, "super_admin");
    contractorId = await createUser(contractorEmail, "contractor");

    app = await buildApp();
    await app.ready();
  });

  afterAll(async () => {
    mutableEnv.ADMIN_MFA_REQUIRED = false;
    delete mutableEnv.MFA_ENCRYPTION_KEY;
    for (const id of [adminId, contractorId]) {
      if (!id) continue;
      await adminPool.query("DELETE FROM public.admin_audit_logs WHERE user_id = $1", [id]);
      await adminPool.query("DELETE FROM app_auth.tokens WHERE user_id = $1", [id]);
      await adminPool.query("DELETE FROM app_auth.sessions WHERE user_id = $1", [id]);
      await adminPool.query("DELETE FROM public.profiles WHERE id = $1", [id]);
      await adminPool.query("DELETE FROM app_auth.users WHERE id = $1", [id]);
    }
    await app.close();
  });

  it("sin MFA el login indica que falta activarlo y /admin responde 403 mfa_required", async () => {
    const response = await login(adminEmail);
    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.accessToken).toBeTruthy();
    expect(body.mfaEnrollmentRequired).toBe(true);

    const admin = await app.inject({ method: "GET", url: "/admin/overview", headers: auth(body.accessToken) });
    expect(admin.statusCode).toBe(403);
    expect(admin.json().code).toBe("mfa_required");
  });

  it("solo el superadministrador puede activar MFA", async () => {
    const body = (await login(contractorEmail)).json();
    const response = await app.inject({
      method: "POST",
      url: "/auth/mfa/enroll",
      headers: auth(body.accessToken)
    });
    expect(response.statusCode).toBe(403);
  });

  it("activación: código incorrecto falla; el correcto entrega 10 códigos y verifica la sesión", async () => {
    const session = (await login(adminEmail)).json();
    const headers = auth(session.accessToken);

    const enroll = await app.inject({ method: "POST", url: "/auth/mfa/enroll", headers });
    expect(enroll.statusCode).toBe(200);
    expect(enroll.json().otpauthUri).toContain("otpauth://totp/Leuret:");

    const stored = await adminPool.query<{ secret_ciphertext: string; secret_iv: string }>(
      "SELECT secret_ciphertext, secret_iv FROM app_auth.user_mfa WHERE user_id = $1",
      [adminId]
    );
    expect(stored.rows[0]!.secret_ciphertext).not.toContain(enroll.json().secret);
    secret = decryptMfaSecret(stored.rows[0]!.secret_ciphertext, stored.rows[0]!.secret_iv);

    const wrong = await app.inject({ method: "POST", url: "/auth/mfa/confirm", headers, payload: { code: "000000" } });
    expect(wrong.statusCode).toBe(400);

    const confirm = await app.inject({
      method: "POST",
      url: "/auth/mfa/confirm",
      headers,
      payload: { code: hotp(secret, currentTotpStep()) }
    });
    expect(confirm.statusCode).toBe(200);
    recoveryCodes = confirm.json().recoveryCodes;
    expect(recoveryCodes).toHaveLength(10);

    const admin = await app.inject({ method: "GET", url: "/admin/overview", headers });
    expect(admin.statusCode).not.toBe(403);

    const again = await app.inject({ method: "POST", url: "/auth/mfa/enroll", headers });
    expect(again.statusCode).toBe(409);
  });

  it("con MFA activo el login devuelve un desafío y no una sesión", async () => {
    const mfaToken = await freshChallenge();
    expect(mfaToken.length).toBeGreaterThanOrEqual(32);
  });

  it("verificación: código incorrecto 401; correcto crea una sesión con acceso a /admin", async () => {
    const mfaToken = await freshChallenge();

    const wrong = await verify(mfaToken, { code: "000000" });
    expect(wrong.statusCode).toBe(401);

    // El paso actual ya se usó al activar; el siguiente entra en la ventana de ±1.
    const next = hotp(secret, currentTotpStep() + 1);
    const ok = await verify(mfaToken, { code: next });
    expect(ok.statusCode).toBe(200);
    const body = ok.json();
    expect(body.accessToken).toBeTruthy();

    const admin = await app.inject({ method: "GET", url: "/admin/overview", headers: auth(body.accessToken) });
    expect(admin.statusCode).not.toBe(403);

    // El desafío es de un solo uso.
    const reused = await verify(mfaToken, { code: next });
    expect(reused.statusCode).toBe(401);
  });

  it("un código TOTP ya usado no sirve otra vez", async () => {
    const mfaToken = await freshChallenge();
    const replay = await verify(mfaToken, { code: hotp(secret, currentTotpStep() + 1) });
    expect(replay.statusCode).toBe(401);
  });

  it("un código de recuperación funciona una sola vez", async () => {
    const first = await verify(await freshChallenge(), { recoveryCode: recoveryCodes[0]! });
    expect(first.statusCode).toBe(200);
    expect(first.json().recoveryCodesRemaining).toBe(9);

    const second = await verify(await freshChallenge(), { recoveryCode: recoveryCodes[0]! });
    expect(second.statusCode).toBe(401);
  });

  it("cinco fallos bloquean el segundo factor y quedan auditados", async () => {
    // Los fallos de pruebas anteriores (código repetido, recuperación repetida) se acumulan.
    await adminPool.query(
      "UPDATE app_auth.user_mfa SET failed_attempts = 0, locked_until = NULL WHERE user_id = $1",
      [adminId]
    );
    const mfaToken = await freshChallenge();
    for (let attempt = 1; attempt <= 4; attempt += 1) {
      expect((await verify(mfaToken, { code: "000000" })).statusCode).toBe(401);
    }
    expect((await verify(mfaToken, { code: "000000" })).statusCode).toBe(429);

    const blocked = await verify(await freshChallenge(), { recoveryCode: recoveryCodes[1]! });
    expect(blocked.statusCode).toBe(429);

    const actions = await adminPool.query<{ action: string }>(
      "SELECT DISTINCT action FROM public.admin_audit_logs WHERE user_id = $1",
      [adminId]
    );
    const names = actions.rows.map((row) => row.action);
    expect(names).toEqual(expect.arrayContaining([
      "MFA_ENROLLED", "MFA_VERIFIED", "MFA_FAILED", "MFA_LOCKED", "MFA_RECOVERY_CODE_USED"
    ]));
  });
});
