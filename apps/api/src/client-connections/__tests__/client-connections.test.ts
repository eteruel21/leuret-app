import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { buildApp } from "../../app.js";
import { createAccessToken } from "../../auth/tokens.js";
import { adminPool } from "../../db/test-db.js";
import * as push from "../../notifications/push-service.js";

type Account = { id: string; email: string; headers: { authorization: string } };

describe("Solicitudes y fichas de Leuret", () => {
  let app: FastifyInstance;
  let owner: Account;
  let outsider: Account;
  let companyId: string;
  const users: string[] = [];
  const companies: string[] = [];
  const pushSpy = vi.spyOn(push, "sendPushNotificationToUser").mockResolvedValue({ sent: 1, failed: 0 });

  async function account(role: "contractor" | "client", email = `${randomUUID()}@example.com`, phone?: string) {
    const result = await adminPool.query<{ id: string }>(`
      INSERT INTO app_auth.users (email, email_confirmed_at, raw_user_meta_data)
      VALUES ($1, now(), jsonb_build_object('role', $2::text, 'full_name', 'María Ríos', 'first_name', 'María', 'last_name', 'Ríos'))
      RETURNING id`, [email, role]);
    const { id } = result.rows[0]!;
    users.push(id);
    await adminPool.query("UPDATE public.profiles SET role = $2, active = true, approved_at = now(), phone = $3 WHERE id = $1",
      [id, role, phone ?? null]);
    const session = await adminPool.query<{ id: string }>(`
      INSERT INTO app_auth.sessions (user_id, refresh_token_hash, expires_at)
      VALUES ($1, $2, now() + interval '1 hour') RETURNING id`, [id, randomUUID()]);
    return { id, email, headers: { authorization: `Bearer ${await createAccessToken(id, session.rows[0]!.id)}` } };
  }

  async function company(user: Account, name: string) {
    const result = await adminPool.query<{ id: string }>(`
      INSERT INTO public.companies (name, created_by) VALUES ($1, $2) RETURNING id`, [name, user.id]);
    const { id } = result.rows[0]!;
    companies.push(id);
    await adminPool.query("INSERT INTO public.company_members (company_id, user_id, role) VALUES ($1, $2, 'owner')", [id, user.id]);
    return id;
  }

  async function requests(user: Account) {
    const result = await app.inject({ method: "GET", url: "/client-connections", headers: user.headers });
    expect(result.statusCode, result.body).toBe(200);
    return result.json<{ requests: { id: string; client_id: string | null; name: string; status: string; incoming: boolean;
      phone_code: string | null; phone_to_confirm: string | null; requires_phone_code: boolean }[] }>().requests;
  }

  function respond(user: Account, id: string, action: "accept" | "reject" | "cancel", phoneCode?: string) {
    return app.inject({ method: "PATCH", url: `/client-connections/${id}`, headers: user.headers, payload: { action, phoneCode } });
  }

  function profile(user: Account, contractor = companyId) {
    return app.inject({ method: "GET", url: `/client/contractors/${contractor}`, headers: user.headers });
  }

  beforeAll(async () => {
    app = await buildApp();
    await app.ready();
    owner = await account("contractor", undefined, "+507 6100-0100");
    outsider = await account("client");
    companyId = await company(owner, "Obras del Pacífico");
  });

  afterAll(async () => {
    await app?.close();
    await adminPool.query("DELETE FROM public.companies WHERE id = ANY($1::uuid[])", [companies]);
    await adminPool.query("DELETE FROM app_auth.users WHERE id = ANY($1::uuid[])", [users]);
    await adminPool.end();
    pushSpy.mockRestore();
  });

  it("envía al guardar por correo, conserva el expediente y solo lo comparte al aceptar", async () => {
    const customer = await account("client");
    const create = await app.inject({
      method: "POST", url: "/clients", headers: owner.headers,
      payload: { companyId, clientType: "person", firstName: "María", email: customer.email.toUpperCase() }
    });
    expect(create.statusCode, create.body).toBe(201);
    const { client, connection } = create.json();
    expect(connection).toBe("sent");
    expect(client.user_id).toBeNull();

    const [request] = await requests(customer);
    expect(request).toMatchObject({ name: "Obras del Pacífico", incoming: true, status: "pending", requires_phone_code: false });
    expect(pushSpy).toHaveBeenCalledWith(customer.id, expect.objectContaining({
      data: { type: "client_connection.requested", requestId: request!.id }
    }));
    expect((await profile(customer)).statusCode).toBe(404);
    expect((await respond(outsider, request!.id, "accept")).statusCode).toBe(404);
    expect((await respond(owner, request!.id, "accept")).statusCode).toBe(403);

    const { rows: [project] } = await adminPool.query(`
      INSERT INTO public.projects (company_id, client_id, name) VALUES ($1, $2, 'Remodelación del salón') RETURNING id`, [companyId, client.id]);
    await adminPool.query(`
      INSERT INTO public.project_tasks (company_id, project_id, title) VALUES ($1, $2, 'Tarea de campo')`, [companyId, project.id]);
    await adminPool.query(`
      INSERT INTO public.activities (company_id, project_id, title, date, notes)
      VALUES ($1, $2, 'Visita compartida', '2030-01-17', 'Nota de trabajo')`, [companyId, project.id]);

    const acceptance = await Promise.all([respond(customer, request!.id, "accept"), respond(customer, request!.id, "accept")]);
    expect(acceptance.map((result) => result.statusCode)).toEqual([200, 200]);
    const connected = await profile(customer);
    expect(connected.statusCode, connected.body).toBe(200);
    expect(connected.json().processes).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: "activity", title: "Visita compartida" }),
      expect.objectContaining({ kind: "project", title: "Remodelación del salón" })
    ]));
    expect(connected.json().processes).toHaveLength(2);
    expect(connected.body).not.toContain("Nota de trabajo");
    expect((await profile(outsider)).statusCode).toBe(404);

    const customerDetail = await app.inject({
      method: "GET", url: `/clients/${client.id}?companyId=${companyId}`, headers: owner.headers
    });
    expect(customerDetail.statusCode, customerDetail.body).toBe(200);
    expect(customerDetail.json().client.user_id).toBe(customer.id);
    expect(customerDetail.json().processes).toContainEqual(expect.objectContaining({ kind: "task", title: "Tarea de campo" }));
  });

  it("recibe solicitudes del cliente por celular del contratista y vincula la ficha existente por correo", async () => {
    const email = `${randomUUID()}@example.com`;
    const { rows: [record] } = await adminPool.query(`
      INSERT INTO public.clients (company_id, first_name, email) VALUES ($1, 'María', $2) RETURNING id`, [companyId, email]);
    const customer = await account("client", email);
    const before = await adminPool.query("SELECT user_id FROM public.clients WHERE id = $1", [record.id]);
    expect(before.rows[0].user_id).toBeNull();

    const send = () => app.inject({ method: "POST", url: "/client-connections", headers: customer.headers, payload: { phone: "6100-0100" } });
    const results = await Promise.all([send(), send()]);
    expect(results.map((result) => result.json().outcome).sort()).toEqual(["pending", "sent"]);
    const request = (await requests(owner)).find((item) => item.incoming && item.status === "pending");
    expect(request).toMatchObject({ name: "María Ríos", status: "pending" });
    expect(pushSpy.mock.calls.filter(([recipient, payload]) => recipient === owner.id && payload.data?.requestId === request!.id)).toHaveLength(1);
    expect((await respond(customer, request!.id, "accept")).statusCode).toBe(403);
    const accepted = await respond(owner, request!.id, "accept");
    expect(accepted.statusCode, accepted.body).toBe(200);
    expect((await requests(owner)).find((item) => item.id === request!.id)).toMatchObject({ client_id: record.id, status: "accepted" });
    expect((await profile(customer)).statusCode).toBe(200);
    expect((await profile(customer)).json().processes).toEqual([]);
  });

  it("envía al celular normalizado, admite rechazar y confirma el número para vincular", async () => {
    const customer = await account("client", undefined, "+507 6999-0143");
    const send = () => app.inject({
      method: "POST", url: "/client-connections", headers: owner.headers, payload: { companyId, phone: "69990143" }
    });
    const first = await send();
    expect(first.statusCode, first.body).toBe(201);
    const [declined] = await requests(customer);
    expect((await respond(customer, declined!.id, "reject")).json()).toEqual({ outcome: "rejected" });
    expect((await profile(customer)).statusCode).toBe(404);

    const second = await send();
    expect(second.statusCode, second.body).toBe(201);
    const [request] = await requests(customer);
    expect(request).toMatchObject({ requires_phone_code: true, phone_code: null, phone_to_confirm: null });
    expect((await respond(customer, request!.id, "accept", "codigo-mal")).statusCode).toBe(400);
    expect((await profile(customer)).statusCode).toBe(404);

    const sent = (await requests(owner)).find((item) => item.id === request!.id);
    expect(sent?.phone_to_confirm).toBe("50769990143");
    expect(sent?.phone_code).toMatch(/^[0-9a-f]{12}$/);
    expect((await respond(customer, request!.id, "accept", sent?.phone_code?.toUpperCase())).statusCode).toBe(200);
    expect((await profile(customer)).statusCode).toBe(200);
  });

  it("permite cambiar el consentimiento de avisos desde el perfil", async () => {
    const updated = await app.inject({
      method: "PATCH", url: "/profile", headers: outsider.headers,
      payload: { fullName: "María Ríos", phone: null, notificationsOptIn: true }
    });
    expect(updated.statusCode, updated.body).toBe(200);
    const me = await app.inject({ method: "GET", url: "/auth/me", headers: outsider.headers });
    expect(me.json().user.notifications_opt_in).toBe(true);
  });

  it("mantiene separado el portal de un cliente de las solicitudes que gestiona como miembro del equipo", async () => {
    const teammate = await account("client");
    const customer = await account("client");
    const ownClientCompany = await company(owner, "Empresa que atiende al miembro");
    const invitation = await app.inject({
      method: "POST", url: `/companies/${companyId}/invitations`, headers: owner.headers,
      payload: { email: teammate.email, role: "sales" }
    });
    expect(invitation.statusCode, invitation.body).toBe(201);
    const joined = await app.inject({
      method: "POST", url: "/companies/invitations/accept", headers: teammate.headers,
      payload: { token: invitation.json().invitation.acceptanceToken }
    });
    expect(joined.statusCode, joined.body).toBe(200);

    const connection = await app.inject({
      method: "POST", url: "/client-connections", headers: teammate.headers,
      payload: { companyId, email: customer.email }
    });
    expect(connection.statusCode, connection.body).toBe(201);
    const [received] = await requests(customer);
    expect((await respond(customer, received!.id, "accept")).statusCode).toBe(200);

    const otherCompanyEmail = `${randomUUID()}@example.test`;
    await adminPool.query("UPDATE public.companies SET email = $2 WHERE id = $1", [ownClientCompany, otherCompanyEmail]);
    const personalConnection = await app.inject({
      method: "POST", url: "/client-connections", headers: teammate.headers,
      payload: { email: otherCompanyEmail }
    });
    expect(personalConnection.statusCode, personalConnection.body).toBe(201);

    const bySpace = (space: "client" | "company") => app.inject({
      url: `/client-connections?space=${space}`, headers: teammate.headers
    });
    expect((await bySpace("company")).json().requests).toContainEqual(expect.objectContaining({ id: received!.id }));
    expect((await bySpace("client")).json().requests).toEqual([
      expect.objectContaining({ company_id: ownClientCompany, status: "pending" })
    ]);
  });
});
