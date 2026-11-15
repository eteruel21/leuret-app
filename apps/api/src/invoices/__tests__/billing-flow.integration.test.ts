import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, expect, it } from "vitest";

import { buildApp } from "../../app.js";
import { createSession } from "../../auth/repository.js";
import { pool } from "../../db/pool.js";
import { adminPool } from "../../db/test-db.js";

type Account = { email: string; accessToken: string };
type Invoice = { id: string; status: string; total_amount: number; balance_due: number };

let app: FastifyInstance;

async function makeAccount(role: "contractor" | "client"): Promise<Account> {
  const email = `${randomUUID()}@example.test`;
  const { rows: [user] } = await adminPool.query<{ id: string }>(
    `INSERT INTO app_auth.users (email, email_confirmed_at, raw_user_meta_data)
     VALUES ($1, now(), jsonb_build_object('role', $2::text, 'full_name', 'Cuenta de facturación'))
     RETURNING id`,
    [email, role]
  );
  await adminPool.query(
    `UPDATE public.profiles
     SET role = $2, active = true, approved_at = now(), contractor_approved_at = $3
     WHERE id = $1`,
    [user!.id, role, role === "contractor" ? new Date() : null]
  );

  const connection = await adminPool.connect();
  try {
    const { accessToken } = await createSession(connection, user!.id, "127.0.0.1", "CI facturación");
    return { email, accessToken };
  } finally {
    connection.release();
  }
}

async function request(
  account: Account,
  method: "GET" | "POST" | "PATCH",
  url: string,
  status: number,
  payload?: Record<string, unknown>
) {
  const response = await app.inject({
    method,
    url,
    headers: { authorization: `Bearer ${account.accessToken}` },
    ...(payload === undefined ? {} : { payload })
  });
  expect(response.statusCode, `${method} ${url}: ${response.body}`).toBe(status);
  return response;
}

async function makeCompany(owner: Account, name: string) {
  const response = await request(owner, "POST", "/companies", 201, { name });
  return response.json<{ companyId: string }>().companyId;
}

beforeAll(async () => {
  app = await buildApp();
});

afterAll(async () => {
  await app?.close();
  // Los pagos son inmutables y se conservan hasta que se descarta la base de CI.
  await Promise.all([adminPool.end(), pool.end()]);
});

it("ejecuta las consultas de la API con un rol sin privilegios administrativos", async () => {
  const { rows: [role] } = await pool.query(`
    SELECT current_user AS name, rolsuper, rolbypassrls, rolcreatedb, rolcreaterole,
           pg_has_role(current_user, 'contractor_owner', 'MEMBER') AS owner_member
    FROM pg_roles WHERE rolname = current_user
  `);
  expect(role).toEqual({
    name: "contractor_api",
    rolsuper: false,
    rolbypassrls: false,
    rolcreatedb: false,
    rolcreaterole: false,
    owner_member: false
  });
});

it("completa el flujo desde la conexión del cliente hasta el pago y protege la factura entre empresas", async () => {
  const [owner, customer, otherOwner] = await Promise.all([
    makeAccount("contractor"),
    makeAccount("client"),
    makeAccount("contractor")
  ]);
  const companyId = await makeCompany(owner, "Empresa de facturación CI");
  const otherCompanyId = await makeCompany(otherOwner, "Segunda empresa CI");

  const createdClient = await request(owner, "POST", "/clients", 201, {
    companyId,
    clientType: "person",
    firstName: "Andrea",
    email: customer.email
  });
  const { client, connection } = createdClient.json<{ client: { id: string }; connection: string }>();
  expect(connection).toBe("sent");
  const listed = await request(customer, "GET", "/client-connections", 200);
  const { requests } = listed.json<{ requests: { id: string; status: string }[] }>();
  expect(requests).toEqual([expect.objectContaining({ status: "pending" })]);
  await request(customer, "PATCH", `/client-connections/${requests[0]!.id}`, 200, { action: "accept" });

  const createdProject = await request(owner, "POST", "/projects", 201, {
    companyId,
    clientId: client.id,
    name: "Remodelación de prueba"
  });
  const { project } = createdProject.json<{ project: { id: string } }>();
  const createdBudget = await request(owner, "POST", "/budgets/from-project", 201, {
    companyId,
    projectId: project.id,
    title: "Presupuesto de remodelación"
  });
  const { budgetId } = createdBudget.json<{ budgetId: string }>();
  await request(owner, "POST", `/budgets/${budgetId}/items`, 201, {
    companyId,
    description: "Mano de obra",
    quantity: 2,
    unitPrice: 50,
    taxable: false
  });
  await request(owner, "POST", `/budgets/${budgetId}/send`, 200, { companyId });
  const approval = await request(customer, "POST", `/budgets/${budgetId}/approve`, 200, {});
  expect(approval.json().budget).toMatchObject({ id: budgetId, status: "approved" });

  const issued = await request(owner, "POST", "/invoices/from-budget", 201, {
    companyId,
    budgetId,
    clientId: client.id
  });
  const { invoice } = issued.json<{ invoice: Invoice }>();
  expect(invoice).toMatchObject({ status: "issued", total_amount: 100, balance_due: 100 });
  await request(otherOwner, "GET", `/invoices/${invoice.id}?companyId=${otherCompanyId}`, 404);

  const path = `/invoices/${invoice.id}/payments`;
  const partial = await request(owner, "POST", path, 201, { companyId, amount: 40, method: "cash" });
  expect(partial.json().invoice).toMatchObject({ status: "partially_paid", balance_due: 60 });
  const complete = await request(owner, "POST", path, 201, { companyId, amount: 60, method: "cash" });
  expect(complete.json().invoice).toMatchObject({ status: "paid", balance_due: 0 });

  const portal = await request(customer, "GET", `/client/invoices/${invoice.id}`, 200);
  expect(portal.json().invoice).toMatchObject({ id: invoice.id, status: "paid", balance_due: 0 });
});
