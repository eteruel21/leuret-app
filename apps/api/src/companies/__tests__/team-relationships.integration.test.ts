import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { buildApp } from "../../app.js";
import { createAccessToken } from "../../auth/tokens.js";
import { adminPool } from "../../db/test-db.js";
import * as push from "../../notifications/push-service.js";

type Account = { id: string; email: string; headers: { authorization: string } };
type Role = "owner" | "admin" | "supervisor" | "sales" | "estimator" | "member";

describe("Equipo: roles, accesos, invitaciones y vinculaciones", () => {
  let app: FastifyInstance;
  const users: string[] = [];
  const companies: string[] = [];
  const pushSpy = vi.spyOn(push, "sendPushNotificationToUser").mockResolvedValue({ sent: 1, failed: 0 });

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
    return { id, email, headers: { authorization: `Bearer ${await createAccessToken(id, session.rows[0]!.id)}` } };
  }

  async function team(members: Record<string, Role>) {
    const owner = await account();
    const company = await adminPool.query<{ id: string }>(
      "INSERT INTO public.companies (name, created_by) VALUES ('Constructora Istmo', $1) RETURNING id", [owner.id]);
    const companyId = company.rows[0]!.id;
    companies.push(companyId);
    await adminPool.query("INSERT INTO public.company_members (company_id, user_id, role) VALUES ($1, $2, 'owner')", [companyId, owner.id]);
    const people: Record<string, Account & { memberId: string }> = {};
    const ownerMember = await adminPool.query<{ id: string }>(
      "SELECT id FROM public.company_members WHERE company_id = $1 AND user_id = $2", [companyId, owner.id]);
    people.owner = { ...owner, memberId: ownerMember.rows[0]!.id };
    for (const [name, role] of Object.entries(members)) {
      const person = await account();
      const row = await adminPool.query<{ id: string }>(
        "INSERT INTO public.company_members (company_id, user_id, role) VALUES ($1, $2, $3) RETURNING id",
        [companyId, person.id, role]);
      people[name] = { ...person, memberId: row.rows[0]!.id };
    }
    return { companyId, people };
  }

  async function membership(companyId: string, userId: string) {
    const result = await adminPool.query<{ role: Role; active: boolean }>(
      "SELECT role, active FROM public.company_members WHERE company_id = $1 AND user_id = $2", [companyId, userId]);
    return result.rows[0] ?? null;
  }

  beforeAll(async () => {
    app = await buildApp();
    await app.ready();
  });

  beforeEach(() => pushSpy.mockClear());

  afterAll(async () => {
    await app?.close();
    await adminPool.query("DELETE FROM public.companies WHERE id = ANY($1::uuid[])", [companies]);
    await adminPool.query("DELETE FROM app_auth.users WHERE id = ANY($1::uuid[])", [users]);
    await adminPool.end();
    pushSpy.mockRestore();
  });

  it("un administrador no puede quitar ni desactivar a otro administrador, y la API no responde «Listo» sin cambios", async () => {
    const { companyId, people } = await team({ admin: "admin", admin2: "admin", field: "member" });

    for (const request of [
      { method: "DELETE" as const, url: `/companies/${companyId}/members/${people.admin2!.memberId}` },
      { method: "PATCH" as const, url: `/companies/${companyId}/members/${people.admin2!.memberId}/status`, payload: { active: false } },
      { method: "PATCH" as const, url: `/companies/${companyId}/members/${people.owner!.memberId}/status`, payload: { active: false } },
      { method: "PATCH" as const, url: `/companies/${companyId}/members/${people.field!.memberId}/role`, payload: { role: "admin" } }
    ]) {
      const response = await app.inject({ ...request, headers: people.admin!.headers });
      expect(response.statusCode, response.body).toBe(403);
      expect(response.json().message).toContain("propietario");
    }
    expect(await membership(companyId, people.admin2!.id)).toEqual({ role: "admin", active: true });

    // Lo que sí puede: gestionar a quien no es administrador.
    const role = await app.inject({
      method: "PATCH", url: `/companies/${companyId}/members/${people.field!.memberId}/role`,
      headers: people.admin!.headers, payload: { role: "supervisor" }
    });
    expect(role.statusCode, role.body).toBe(200);
    expect(role.json()).toMatchObject({ changed: true, member: { role: "supervisor" } });
    expect(pushSpy).toHaveBeenCalledWith(people.field!.id, expect.objectContaining({
      data: expect.objectContaining({ type: "company_member.updated", companyId })
    }));

    const removed = await app.inject({
      method: "DELETE", url: `/companies/${companyId}/members/${people.field!.memberId}`, headers: people.admin!.headers
    });
    expect(removed.statusCode, removed.body).toBe(200);
    expect(await membership(companyId, people.field!.id)).toBeNull();

    const audit = await adminPool.query<{ action: string }>(
      "SELECT action FROM public.admin_audit_logs WHERE company_id = $1 ORDER BY created_at", [companyId]);
    expect(audit.rows.map((row) => row.action)).toEqual(["MEMBER_ROLE_UPDATED", "MEMBER_REMOVED"]);
  });

  it("protege al último propietario y permite transferir la propiedad", async () => {
    const { companyId, people } = await team({ admin: "admin" });
    const owner = people.owner!;

    const demote = await app.inject({
      method: "PATCH", url: `/companies/${companyId}/members/${owner.memberId}/role`,
      headers: owner.headers, payload: { role: "admin" }
    });
    expect(demote.statusCode).toBe(409);

    const leave = await app.inject({ method: "POST", url: `/companies/${companyId}/leave`, headers: owner.headers });
    expect(leave.statusCode).toBe(409);

    const self = await app.inject({
      method: "PATCH", url: `/companies/${companyId}/members/${owner.memberId}/status`,
      headers: owner.headers, payload: { active: false }
    });
    expect(self.statusCode).toBe(409);

    const promote = await app.inject({
      method: "PATCH", url: `/companies/${companyId}/members/${people.admin!.memberId}/role`,
      headers: owner.headers, payload: { role: "owner" }
    });
    expect(promote.statusCode, promote.body).toBe(200);

    const left = await app.inject({ method: "POST", url: `/companies/${companyId}/leave`, headers: owner.headers });
    expect(left.statusCode, left.body).toBe(200);
    expect(await membership(companyId, owner.id)).toBeNull();
    expect(await membership(companyId, people.admin!.id)).toEqual({ role: "owner", active: true });
  });

  it("al perder el rol de gestión se cancelan sus invitaciones pendientes", async () => {
    const { companyId, people } = await team({ admin: "admin" });
    const invite = await app.inject({
      method: "POST", url: `/companies/${companyId}/invitations`, headers: people.admin!.headers,
      payload: { email: `${randomUUID()}@example.com`, role: "estimator" }
    });
    expect(invite.statusCode, invite.body).toBe(201);

    const demote = await app.inject({
      method: "PATCH", url: `/companies/${companyId}/members/${people.admin!.memberId}/role`,
      headers: people.owner!.headers, payload: { role: "sales" }
    });
    expect(demote.statusCode, demote.body).toBe(200);

    const pending = await adminPool.query(
      "SELECT 1 FROM public.company_invitations WHERE company_id = $1 AND status = 'pending'", [companyId]);
    expect(pending.rowCount).toBe(0);
  });

  it("no invita a quien ya es miembro, solo el propietario invita administradores y la persona puede rechazar", async () => {
    const { companyId, people } = await team({ admin: "admin", field: "member" });

    const existing = await app.inject({
      method: "POST", url: `/companies/${companyId}/invitations`, headers: people.owner!.headers,
      payload: { email: people.field!.email.toUpperCase(), role: "supervisor" }
    });
    expect(existing.statusCode).toBe(409);

    const adminInvite = await app.inject({
      method: "POST", url: `/companies/${companyId}/invitations`, headers: people.admin!.headers,
      payload: { email: `${randomUUID()}@example.com`, role: "admin" }
    });
    expect(adminInvite.statusCode).toBe(403);

    const invitee = await account();
    const created = await app.inject({
      method: "POST", url: `/companies/${companyId}/invitations`, headers: people.owner!.headers,
      payload: { email: invitee.email, role: "estimator" }
    });
    expect(created.statusCode, created.body).toBe(201);
    const invitationId = created.json<{ invitation: { id: string } }>().invitation.id;

    const outsider = await account();
    const wrong = await app.inject({
      method: "POST", url: `/companies/invitations/${invitationId}/decline`, headers: outsider.headers
    });
    expect(wrong.statusCode).toBe(404);

    const decline = await app.inject({
      method: "POST", url: `/companies/invitations/${invitationId}/decline`, headers: invitee.headers
    });
    expect(decline.statusCode, decline.body).toBe(200);

    const received = await app.inject({ method: "GET", url: "/companies/invitations/received", headers: invitee.headers });
    expect(received.json().invitations).toEqual([]);
    const accept = await app.inject({
      method: "POST", url: "/companies/invitations/accept", headers: invitee.headers, payload: { invitationId }
    });
    expect(accept.statusCode).toBe(400);
  });

  it("cliente y empresa pueden terminar una vinculación; el cliente deja de ver la empresa", async () => {
    const { companyId, people } = await team({ field: "member", sales: "sales" });
    const customer = await account("client");

    const sent = await app.inject({
      method: "POST", url: "/client-connections", headers: people.sales!.headers,
      payload: { companyId, email: customer.email }
    });
    expect(sent.statusCode, sent.body).toBe(201);
    const list = await app.inject({ method: "GET", url: "/client-connections?space=client", headers: customer.headers });
    const requestId = list.json<{ requests: { id: string }[] }>().requests[0]!.id;

    pushSpy.mockClear();
    const accepted = await app.inject({
      method: "PATCH", url: `/client-connections/${requestId}`, headers: customer.headers, payload: { action: "accept" }
    });
    expect(accepted.statusCode, accepted.body).toBe(200);
    expect(pushSpy).toHaveBeenCalledWith(people.sales!.id, expect.objectContaining({
      data: expect.objectContaining({ type: "client_connection.accepted", requestId })
    }));

    const profile = await app.inject({ method: "GET", url: `/client/contractors/${companyId}`, headers: customer.headers });
    expect(profile.statusCode, profile.body).toBe(200);

    const linked = await adminPool.query<{ id: string }>(
      "SELECT id FROM public.clients WHERE company_id = $1 AND user_id = $2", [companyId, customer.id]);
    const clientId = linked.rows[0]!.id;

    // El equipo de campo no gestiona vinculaciones.
    const fieldEnd = await app.inject({
      method: "POST", url: "/client-connections/end", headers: people.field!.headers, payload: { companyId, clientId }
    });
    expect(fieldEnd.statusCode).toBe(403);

    pushSpy.mockClear();
    const ended = await app.inject({
      method: "POST", url: "/client-connections/end", headers: customer.headers, payload: { companyId }
    });
    expect(ended.statusCode, ended.body).toBe(200);
    expect(pushSpy).toHaveBeenCalledWith(people.owner!.id, expect.objectContaining({
      data: expect.objectContaining({ type: "client_connection.ended" })
    }));

    const hidden = await app.inject({ method: "GET", url: `/client/contractors/${companyId}`, headers: customer.headers });
    expect(hidden.statusCode).toBe(404);
    const statuses = await app.inject({ method: "GET", url: "/client-connections?space=client", headers: customer.headers });
    expect(statuses.json().requests[0].status).toBe("ended");

    // La ficha se conserva y se puede volver a vincular.
    const card = await adminPool.query("SELECT user_id FROM public.clients WHERE id = $1", [clientId]);
    expect(card.rows[0]).toEqual({ user_id: null });
    const again = await app.inject({
      method: "POST", url: "/client-connections", headers: people.owner!.headers, payload: { companyId, clientId, email: customer.email }
    });
    expect(again.statusCode, again.body).toBe(201);

    const second = await app.inject({
      method: "POST", url: "/client-connections/end", headers: customer.headers, payload: { companyId }
    });
    expect(second.statusCode).toBe(404);
  });
});
