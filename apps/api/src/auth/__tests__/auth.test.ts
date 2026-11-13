import { randomUUID } from "node:crypto";
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { buildApp } from "../../app.js";
import { adminPool } from "../../db/test-db.js";
import type { FastifyInstance } from "fastify";
import { installTurnstileTestMock } from "./turnstile-test-helper.js";
import { generateSecureToken, hashSecureToken } from "../tokens.js";
import * as emailService from "../../services/email.js";

describe("T-053: Suite de Pruebas de Autenticación (Auth)", () => {
  let app: FastifyInstance;
  const testSuffix = Math.floor(Math.random() * 1000000);
  const testEmail = `auth_test_${testSuffix}@example.com`;
  const testPassword = "Password123!";
  let userId: string;
  let accessToken: string;
  let refreshToken: string;

  beforeAll(async () => {
    installTurnstileTestMock();
    app = await buildApp();
    await app.ready();
  });

  afterAll(async () => {
    if (userId) {
      await adminPool.query("DELETE FROM app_auth.tokens WHERE user_id = $1", [userId]);
      await adminPool.query("DELETE FROM app_auth.sessions WHERE user_id = $1", [userId]);
      await adminPool.query("DELETE FROM public.profiles WHERE id = $1", [userId]);
      await adminPool.query("DELETE FROM app_auth.identities WHERE user_id = $1", [userId]);
      await adminPool.query("DELETE FROM app_auth.users WHERE id = $1", [userId]);
    }
    await app.close();
  });

  it("1. Registro (POST /auth/register)", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/auth/register",
      payload: {
        fullName: "Usuario Prueba Auth",
        firstName: "Usuario",
        lastName: "Prueba",
        phone: "60001111",
        email: testEmail,
        password: testPassword,
        role: "client",
        province: "Panamá",
        district: "Panamá",
        corregimiento: "Bella Vista",
        termsAccepted: true,
        captchaToken: "register-turnstile-token"
      }
    });

    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body);
    expect(body.requiresEmailConfirmation).toBe(true);

    const userRes = await adminPool.query("SELECT id FROM app_auth.users WHERE email = $1", [testEmail]);
    expect(userRes.rowCount).toBe(1);
    userId = userRes.rows[0].id;
  });

  it("2. Intentar Login sin confirmar correo debe fallar con 401", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: {
        email: testEmail,
        password: testPassword,
        captchaToken: "login-turnstile-token"
      }
    });

    expect(res.statusCode).toBe(401);
    const body = JSON.parse(res.body);
    expect(body.message).toContain("correo");
  });

  it("3. Verificar correo con enlace de un solo uso y hacer Login exitoso", async () => {
    const { token, hash } = generateSecureToken();
    await adminPool.query(
      `INSERT INTO app_auth.tokens (user_id, token_type, token_hash, expires_at)
       VALUES ($1, 'email_verification', $2, now() + interval '24 hours')`,
      [userId, hash]
    );

    const verifyResponse = await app.inject({
      method: "POST",
      url: "/auth/verify-email",
      payload: { token }
    });
    expect(verifyResponse.statusCode).toBe(200);
    expect(JSON.parse(verifyResponse.body).success).toBe(true);

    const verifiedUser = await adminPool.query(
      "SELECT email_confirmed_at FROM app_auth.users WHERE id = $1",
      [userId]
    );
    expect(verifiedUser.rows[0].email_confirmed_at).not.toBeNull();

    const reusedLink = await app.inject({
      method: "POST",
      url: "/auth/verify-email",
      payload: { token }
    });
    expect(reusedLink.statusCode).toBe(400);

    const res = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: {
        email: testEmail,
        password: testPassword,
        captchaToken: "login-turnstile-token"
      }
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.accessToken).toBeDefined();
    expect(body.refreshToken).toBeDefined();
    accessToken = body.accessToken;
    refreshToken = body.refreshToken;
  });

  it("4. Renovación de Token / Refresh (POST /auth/refresh)", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/auth/refresh",
      payload: {
        refreshToken
      }
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.accessToken).toBeDefined();
    expect(body.refreshToken).toBeDefined();
    expect(body.refreshToken).not.toBe(refreshToken);
    refreshToken = body.refreshToken;
    accessToken = body.accessToken;
  });

  it("5. Cierre de Sesión / Logout (POST /auth/logout)", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/auth/logout",
      headers: {
        authorization: `Bearer ${accessToken}`
      },
      payload: {
        refreshToken
      }
    });

    expect(res.statusCode).toBe(200);

    const refreshRes = await app.inject({
      method: "POST",
      url: "/auth/refresh",
      payload: {
        refreshToken
      }
    });
    expect(refreshRes.statusCode).toBe(401);
  });

  it("6. Revocación de Sesiones", async () => {
    const loginRes = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: {
        email: testEmail,
        password: testPassword,
        captchaToken: "login-turnstile-token"
      }
    });
    expect(loginRes.statusCode).toBe(200);

    const sessionsRes = await adminPool.query("SELECT COUNT(*) FROM app_auth.sessions WHERE user_id = $1 AND revoked_at IS NULL", [userId]);
    expect(Number(sessionsRes.rows[0].count)).toBeGreaterThan(0);

    await adminPool.query("UPDATE app_auth.sessions SET revoked_at = now() WHERE user_id = $1", [userId]);

    const activeSessionsRes = await adminPool.query("SELECT COUNT(*) FROM app_auth.sessions WHERE user_id = $1 AND revoked_at IS NULL", [userId]);
    expect(Number(activeSessionsRes.rows[0].count)).toBe(0);
  });

  it("7. Recuperación no revela si el correo existe ni si SMTP falló", async () => {
    const existingAccount = await app.inject({
      method: "POST",
      url: "/auth/recover-password",
      payload: { email: testEmail, captchaToken: "recover-turnstile-token" }
    });
    const unknownAccount = await app.inject({
      method: "POST",
      url: "/auth/recover-password",
      payload: { email: `missing_${testSuffix}@example.com`, captchaToken: "recover-turnstile-token" }
    });

    expect(existingAccount.statusCode).toBe(200);
    expect(unknownAccount.statusCode).toBe(200);
    expect(existingAccount.json()).toEqual(unknownAccount.json());
  });

  it("8. Reenvío de verificación no revela el estado de la cuenta", async () => {
    const confirmedAccount = await app.inject({
      method: "POST",
      url: "/auth/resend-verification",
      payload: { email: testEmail, captchaToken: "resend-turnstile-token" }
    });
    const unknownAccount = await app.inject({
      method: "POST",
      url: "/auth/resend-verification",
      payload: { email: `unknown_${testSuffix}@example.com`, captchaToken: "resend-turnstile-token" }
    });

    expect(confirmedAccount.statusCode).toBe(200);
    expect(unknownAccount.statusCode).toBe(200);
    expect(confirmedAccount.json()).toEqual(unknownAccount.json());
  });

  it("9. Un token de restablecimiento solo puede consumirse una vez bajo concurrencia", async () => {
    const resetToken = "b".repeat(64);
    await adminPool.query(
      `
        INSERT INTO app_auth.tokens (user_id, token_type, token_hash, expires_at)
        VALUES ($1, 'password_reset', $2, now() + interval '10 minutes')
      `,
      [userId, hashSecureToken(resetToken)]
    );

    const responses = await Promise.all([
      app.inject({
        method: "POST",
        url: "/auth/reset-password",
        payload: { token: resetToken, newPassword: "FirstPassword123!" }
      }),
      app.inject({
        method: "POST",
        url: "/auth/reset-password",
        payload: { token: resetToken, newPassword: "SecondPassword123!" }
      })
    ]);

    expect(responses.map((response) => response.statusCode).sort()).toEqual([200, 400]);

    const tokenResult = await adminPool.query(
      "SELECT used_at FROM app_auth.tokens WHERE token_hash = $1",
      [hashSecureToken(resetToken)]
    );
    expect(tokenResult.rows[0]?.used_at).not.toBeNull();
  });
});

it("invites a verified account into a team before approving its independent contractor space", async () => {
  const suffix = randomUUID();
  const ownerEmail = `team-owner-${suffix}@example.test`;
  const inviteeEmail = `team-invitee-${suffix}@example.test`;
  const otherEmail = `team-other-${suffix}@example.test`;
  const adminEmail = `team-admin-${suffix}@example.test`;
  const password = "Password123!";
  const emails = [ownerEmail, inviteeEmail, otherEmail, adminEmail];
  const companyIds: string[] = [];
  const send = vi.spyOn(emailService, "sendCompanyInvitationEmail").mockResolvedValue({ sent: true });
  installTurnstileTestMock();
  const app = await buildApp();
  await app.ready();

  async function register(email: string, role = "contractor") {
    const response = await app.inject({
      method: "POST",
      url: "/auth/register",
      payload: {
        email, password, role, firstName: "Ana", lastName: "Leuret", fullName: "Ana Leuret",
        phone: "60001111", province: "Panamá", district: "Panamá", corregimiento: "Bella Vista",
        termsAccepted: true, captchaToken: "register-turnstile-token"
      }
    });
    expect(response.statusCode).toBe(201);
    const result = await adminPool.query("SELECT id FROM app_auth.users WHERE email = $1", [email]);
    return result.rows[0].id as string;
  }

  async function confirm(userId: string) {
    const { token, hash } = generateSecureToken();
    await adminPool.query(
      `INSERT INTO app_auth.tokens (user_id, token_type, token_hash, expires_at)
       VALUES ($1, 'email_verification', $2, now() + interval '1 hour')`,
      [userId, hash]
    );
    expect((await app.inject({ method: "POST", url: "/auth/verify-email", payload: { token } })).statusCode).toBe(200);
  }

  async function login(email: string) {
    const response = await app.inject({
      method: "POST", url: "/auth/login", payload: { email, password, captchaToken: "login-turnstile-token" }
    });
    expect(response.statusCode).toBe(200);
    return { authorization: `Bearer ${response.json().accessToken}` };
  }

  try {
    const ownerId = await register(ownerEmail);
    const adminId = await register(adminEmail);
    await confirm(ownerId);
    await confirm(adminId);
    await adminPool.query(
      `UPDATE public.profiles SET active = true, approved_at = now(), contractor_approved_at = now()
       WHERE id = $1`, [ownerId]
    );
    await adminPool.query(
      "UPDATE public.profiles SET role = 'super_admin', active = true, approved_at = now() WHERE id = $1", [adminId]
    );
    const ownerHeaders = await login(ownerEmail);
    const company = await app.inject({
      method: "POST", url: "/companies", headers: ownerHeaders, payload: { name: "Equipo de prueba" }
    });
    expect(company.statusCode, company.body).toBe(201);
    const companyId = company.json().companyId;
    companyIds.push(companyId);

    const sent = await app.inject({
      method: "POST", url: `/companies/${companyId}/invitations`,
      headers: ownerHeaders, payload: { email: inviteeEmail.toUpperCase(), role: "member" }
    });
    expect(sent.statusCode, sent.body).toBe(201);
    const invitation = sent.json().invitation;
    expect(invitation.emailSent).toBe(true);
    expect(send).toHaveBeenCalledWith(expect.objectContaining({
      to: inviteeEmail, companyName: "Equipo de prueba", roleLabel: "Equipo de campo", token: invitation.acceptanceToken
    }));

    const otherId = await register(otherEmail);
    await confirm(otherId);
    const otherHeaders = await login(otherEmail);
    const otherInbox = await app.inject({ url: "/companies/invitations/received", headers: otherHeaders });
    expect(otherInbox.json().invitations).toEqual([]);
    const rejected = await app.inject({
      method: "POST", url: "/companies/invitations/accept",
      headers: otherHeaders, payload: { token: invitation.acceptanceToken }
    });
    expect(rejected.statusCode).toBe(400);

    const inviteeId = await register(inviteeEmail);
    await confirm(inviteeId);
    const inviteeHeaders = await login(inviteeEmail);
    const inbox = await app.inject({ url: "/companies/invitations/received", headers: inviteeHeaders });
    expect(inbox.json().invitations).toEqual([
      expect.objectContaining({ id: invitation.id, company_id: companyId, role: "member" })
    ]);
    const accepted = await app.inject({
      method: "POST", url: "/companies/invitations/accept",
      headers: inviteeHeaders, payload: { invitationId: invitation.id }
    });
    expect(accepted.statusCode, accepted.body).toBe(200);
    expect(accepted.json().companyId).toBe(companyId);

    const joined = await app.inject({ url: "/auth/me", headers: inviteeHeaders });
    expect(joined.json().user).toMatchObject({ active: true, contractor_approved_at: null, primary_category: null });
    const membership = await app.inject({ url: "/companies", headers: inviteeHeaders });
    expect(membership.json().memberships).toEqual([expect.objectContaining({ company_id: companyId, role: "member" })]);
    const ownCompany = () => app.inject({
      method: "POST", url: "/companies", headers: inviteeHeaders, payload: { name: "Mi empresa" }
    });
    expect((await ownCompany()).statusCode).toBe(403);

    const requested = await app.inject({
      method: "PATCH", url: "/profile/contractor", headers: inviteeHeaders,
      payload: {
        businessName: null, idDocument: "TEST-123", taxId: null, taxDv: null, primaryCategory: "Construcción",
        specialties: null, experienceYears: null, workAreas: null, professionalDescription: null, avatarUrl: null,
        companyLogoUrl: null, portfolioUrls: null, certifications: null, availability: null,
        preferredContactMethod: null, emitsInvoice: false, hasTransport: false, workMode: null, docIdUrl: null,
        docOperationNoticeUrl: null, docTechnicalCertsUrls: null, docReferencesUrl: null, docAddressProofUrl: null
      }
    });
    expect(requested.statusCode, requested.body).toBe(200);
    const awaiting = await app.inject({ url: "/auth/me", headers: inviteeHeaders });
    expect(awaiting.json().user.contractor_requested_at).toBeTruthy();
    expect((await ownCompany()).statusCode).toBe(403);

    const adminHeaders = await login(adminEmail);
    const approved = await app.inject({
      method: "PATCH", url: `/admin/users/${inviteeId}`, headers: adminHeaders,
      payload: { fullName: "Ana Leuret", phone: "60001111", role: "contractor", active: true, approveContractor: true }
    });
    expect(approved.statusCode, approved.body).toBe(200);
    const created = await ownCompany();
    expect(created.statusCode, created.body).toBe(201);
    const independentCompanyId = created.json().companyId;
    companyIds.push(independentCompanyId);
    const spaces = await app.inject({ url: "/companies", headers: inviteeHeaders });
    expect(spaces.json().memberships).toEqual(expect.arrayContaining([
      expect.objectContaining({ company_id: companyId, role: "member" }),
      expect.objectContaining({ company_id: independentCompanyId, role: "owner" })
    ]));
  } finally {
    send.mockRestore();
    await adminPool.query("DELETE FROM public.companies WHERE id = ANY($1::uuid[])", [companyIds]);
    await adminPool.query("DELETE FROM app_auth.users WHERE email = ANY($1::text[])", [emails]);
    await app.close();
  }
});
