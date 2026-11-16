import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { buildApp } from "../../app.js";
import { createAccessToken } from "../../auth/tokens.js";
import { adminPool } from "../../db/test-db.js";
import { notifyBudgetDecision, notifyBudgetSent, notifyJobRequestCreated } from "../../notifications/event-service.js";
import * as push from "../../notifications/push-service.js";

/**
 * Migración 047: ajustes por usuario (calculadoras, guía de inicio) y bandeja
 * de avisos en public.notifications, con el rol real de la API.
 */
describe("Ajustes del usuario y bandeja de avisos (migración 047)", () => {
  let app: FastifyInstance;
  const users: string[] = [];
  const companies: string[] = [];
  const pushSpy = vi.spyOn(push, "sendPushNotificationToUser").mockResolvedValue({ sent: 0, failed: 0 });

  async function account(role: "contractor" | "client" = "contractor") {
    const email = `${randomUUID()}@example.com`;
    const result = await adminPool.query<{ id: string }>(`
      INSERT INTO app_auth.users (email, email_confirmed_at, raw_user_meta_data)
      VALUES ($1, now(), jsonb_build_object('role', $2::text, 'full_name', 'Ana Pérez', 'first_name', 'Ana'))
      RETURNING id`, [email, role]);
    const { id } = result.rows[0]!;
    users.push(id);
    await adminPool.query("UPDATE public.profiles SET role = $2, active = true, approved_at = now() WHERE id = $1", [id, role]);
    const session = await adminPool.query<{ id: string }>(`
      INSERT INTO app_auth.sessions (user_id, refresh_token_hash, expires_at)
      VALUES ($1, $2, now() + interval '1 hour') RETURNING id`, [id, randomUUID()]);
    return { id, headers: { authorization: `Bearer ${await createAccessToken(id, session.rows[0]!.id)}` } };
  }

  async function company(ownerId: string) {
    const result = await adminPool.query<{ id: string }>(
      "INSERT INTO public.companies (name, created_by) VALUES ('Constructora Avisos', $1) RETURNING id", [ownerId]);
    const companyId = result.rows[0]!.id;
    companies.push(companyId);
    await adminPool.query("INSERT INTO public.company_members (company_id, user_id, role) VALUES ($1, $2, 'owner')", [companyId, ownerId]);
    return companyId;
  }

  async function asApi<T extends Record<string, unknown>>(userId: string, sql: string, params: unknown[] = []) {
    const client = await adminPool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SET LOCAL ROLE contractor_api");
      await client.query("SELECT set_config('app.user_id', $1, true)", [userId]);
      const result = await client.query<T>(sql, params);
      await client.query("COMMIT");
      return result.rows;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  beforeAll(async () => {
    app = await buildApp();
    await app.ready();
  });

  afterAll(async () => {
    await app?.close();
    await adminPool.query("DELETE FROM public.companies WHERE id = ANY($1::uuid[])", [companies]);
    await adminPool.query("DELETE FROM app_auth.users WHERE id = ANY($1::uuid[])", [users]);
    await adminPool.end();
    pushSpy.mockRestore();
  });

  it("guarda los ajustes de una calculadora en la base y los devuelve en otro dispositivo", async () => {
    const user = await account();
    const value = { wastePercent: 10, bagWeightKg: 42.5, mixRatio: "1:2:3" };

    const saved = await app.inject({ method: "PUT", url: "/me/settings/calculator.concreto", headers: user.headers, payload: { value } });
    expect(saved.statusCode, saved.body).toBe(200);
    expect(saved.json().setting).toMatchObject({ key: "calculator.concreto", value });

    const updated = await app.inject({
      method: "PUT", url: "/me/settings/calculator.concreto", headers: user.headers,
      payload: { value: { ...value, wastePercent: 7 } }
    });
    expect(updated.statusCode).toBe(200);

    const rows = await adminPool.query("SELECT value FROM public.user_app_settings WHERE user_id = $1", [user.id]);
    expect(rows.rows).toEqual([{ value: { ...value, wastePercent: 7 } }]);

    const list = await app.inject({ method: "GET", url: "/me/settings?prefix=calculator.", headers: user.headers });
    expect(list.statusCode).toBe(200);
    expect(list.json().settings).toEqual([expect.objectContaining({ key: "calculator.concreto", value: { ...value, wastePercent: 7 } })]);

    const removed = await app.inject({ method: "DELETE", url: "/me/settings/calculator.concreto", headers: user.headers });
    expect(removed.json()).toEqual({ deleted: true });
  });

  it("rechaza claves fuera de los espacios de nombres, valores que no son objeto y ajustes enormes", async () => {
    const user = await account();
    const badKey = await app.inject({ method: "PUT", url: "/me/settings/secret", headers: user.headers, payload: { value: {} } });
    expect(badKey.statusCode).toBe(400);
    const notObject = await app.inject({ method: "PUT", url: "/me/settings/ui.theme", headers: user.headers, payload: { value: "dark" } });
    expect(notObject.statusCode).toBe(400);
    const huge = await app.inject({
      method: "PUT", url: "/me/settings/ui.big", headers: user.headers,
      payload: { value: { text: "x".repeat(17_000) } }
    });
    expect(huge.statusCode).toBe(413);
  });

  it("cada usuario ve y cambia solo sus ajustes (RLS)", async () => {
    const owner = await account();
    const other = await account();
    await asApi(owner.id, "INSERT INTO public.user_app_settings (user_id, setting_key, value) VALUES (app.current_user_id(), 'calculator.pintura', '{\"coats\":2}')");

    expect(await asApi(other.id, "SELECT * FROM public.user_app_settings WHERE user_id = $1", [owner.id])).toEqual([]);
    expect(await asApi(other.id, "UPDATE public.user_app_settings SET value = '{}' WHERE user_id = $1 RETURNING 1", [owner.id])).toEqual([]);
    await expect(asApi(other.id,
      "INSERT INTO public.user_app_settings (user_id, setting_key, value) VALUES ($1, 'calculator.pisos', '{}')", [owner.id]))
      .rejects.toThrow(/row-level security/);
  });

  it("al eliminar la cuenta se borran sus ajustes", async () => {
    const user = await account();
    await adminPool.query("INSERT INTO public.user_app_settings (user_id, setting_key, value) VALUES ($1, 'onboarding.checklist', '{\"dismissed\":true}')", [user.id]);
    await adminPool.query("INSERT INTO private.account_deletion_records (user_id, summary) VALUES ($1, '{}'::jsonb)", [user.id]);
    const rows = await adminPool.query("SELECT 1 FROM public.user_app_settings WHERE user_id = $1", [user.id]);
    expect(rows.rowCount).toBe(0);
  });

  it("guarda en la bandeja los avisos de presupuesto (contratista y cliente) y los separa por espacio y empresa", async () => {
    const owner = await account();
    const customer = await account("client");
    const companyId = await company(owner.id);
    const otherCompanyId = await company(owner.id);
    const budgetId = randomUUID();

    await notifyBudgetDecision({ id: budgetId, company_id: companyId, created_by: owner.id, budget_number: "COT-9", total: 120 }, "approved");
    await notifyBudgetSent({ id: budgetId, company_id: companyId, budget_number: "COT-9", total: 120 }, customer.id);

    const ownerInbox = await app.inject({ method: "GET", url: `/notifications?space=company&companyId=${companyId}`, headers: owner.headers });
    expect(ownerInbox.statusCode, ownerInbox.body).toBe(200);
    expect(ownerInbox.json().unread).toBe(1);
    const [notice] = ownerInbox.json().notifications;
    expect(notice).toMatchObject({ type: "budget.approved", title: "Presupuesto aprobado", company_id: companyId, read_at: null });
    expect(notice.data).toMatchObject({ budgetId, companyId });

    // El push lleva el id del aviso guardado.
    expect(pushSpy).toHaveBeenCalledWith(owner.id, expect.objectContaining({
      data: expect.objectContaining({ notificationId: notice.id })
    }));

    // En otra empresa del mismo usuario no aparece; en su espacio de cliente tampoco.
    const otherCompany = await app.inject({ method: "GET", url: `/notifications?space=company&companyId=${otherCompanyId}`, headers: owner.headers });
    expect(otherCompany.json()).toEqual({ notifications: [], unread: 0 });
    const ownerAsClient = await app.inject({ method: "GET", url: "/notifications?space=client", headers: owner.headers });
    expect(ownerAsClient.json().unread).toBe(0);

    const customerInbox = await app.inject({ method: "GET", url: "/notifications?space=client", headers: customer.headers });
    expect(customerInbox.json().notifications).toEqual([expect.objectContaining({ type: "budget.sent", space: "client" })]);

    const read = await app.inject({
      method: "POST", url: "/notifications/read", headers: owner.headers,
      payload: { space: "company", companyId, ids: [notice.id] }
    });
    expect(read.json()).toEqual({ updated: 1 });

    // Nadie marca avisos ajenos.
    const foreign = await app.inject({
      method: "POST", url: "/notifications/read", headers: owner.headers,
      payload: { space: "client", all: true }
    });
    expect(foreign.json()).toEqual({ updated: 0 });
    const stillUnread = await adminPool.query("SELECT read_at FROM public.notifications WHERE user_id = $1", [customer.id]);
    expect(stillUnread.rows).toEqual([{ read_at: null }]);
  });

  it("las peticiones de trabajo nuevas quedan sin empresa y se ven desde cualquier empresa del contratista", async () => {
    const contractor = await account();
    const companyId = await company(contractor.id);
    const requestId = randomUUID();

    await notifyJobRequestCreated([contractor.id], { id: requestId, title: "Pintar sala", category: "Pintura", province: "Panamá" });

    const inbox = await app.inject({ method: "GET", url: `/notifications?space=company&companyId=${companyId}`, headers: contractor.headers });
    expect(inbox.json().notifications).toEqual([
      expect.objectContaining({ type: "job_request.created", company_id: null, data: expect.objectContaining({ requestId }) })
    ]);

    const all = await app.inject({
      method: "POST", url: "/notifications/read", headers: contractor.headers,
      payload: { space: "company", companyId, all: true }
    });
    expect(all.json()).toEqual({ updated: 1 });
  });

  it("un usuario no puede guardar avisos a nombre de otro (RLS)", async () => {
    const attacker = await account("client");
    const victim = await account();
    await expect(asApi(attacker.id,
      "INSERT INTO public.notifications (user_id, title, body, type) VALUES ($1, 'x', 'y', 'info')", [victim.id]))
      .rejects.toThrow(/row-level security/);
  });
});
