import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { adminPool } from "../../db/test-db.js";
import { createClientBudgetRepo } from "../repository.js";
import { createClientBudgetSchema } from "../schemas.js";

describe("presupuesto del cliente sin obra", () => {
  const suffix = Math.floor(Math.random() * 1_000_000);
  let userId: string;
  let companyId: string;
  let otherCompanyId: string;
  let clientId: string;
  let otherClientId: string;

  beforeAll(async () => {
    userId = (await adminPool.query<{ id: string }>(
      `INSERT INTO app_auth.users (email, password_hash) VALUES ($1, 'test') RETURNING id`,
      [`client_budget_${suffix}@example.com`]
    )).rows[0]!.id;
    await adminPool.query(`UPDATE public.profiles SET active = true, approved_at = now() WHERE id = $1`, [userId]);
    companyId = (await adminPool.query<{ id: string }>(
      `INSERT INTO public.companies (name, created_by) VALUES ($1, $2) RETURNING id`,
      [`Budget Client ${suffix}`, userId]
    )).rows[0]!.id;
    otherCompanyId = (await adminPool.query<{ id: string }>(
      `INSERT INTO public.companies (name, created_by) VALUES ($1, $2) RETURNING id`,
      [`Other Budget Client ${suffix}`, userId]
    )).rows[0]!.id;
    await adminPool.query(
      `INSERT INTO public.company_members (company_id, user_id, role, active)
       VALUES ($1, $3, 'owner', true), ($2, $3, 'owner', true)`,
      [companyId, otherCompanyId, userId]
    );
    clientId = (await adminPool.query<{ id: string }>(
      `INSERT INTO public.clients (company_id, client_type, first_name) VALUES ($1, 'person', 'Pintura') RETURNING id`,
      [companyId]
    )).rows[0]!.id;
    otherClientId = (await adminPool.query<{ id: string }>(
      `INSERT INTO public.clients (company_id, client_type, first_name) VALUES ($1, 'person', 'Externo') RETURNING id`,
      [otherCompanyId]
    )).rows[0]!.id;
  });

  afterAll(async () => {
    if (companyId) await adminPool.query(`DELETE FROM public.companies WHERE id = $1`, [companyId]);
    if (otherCompanyId) await adminPool.query(`DELETE FROM public.companies WHERE id = $1`, [otherCompanyId]);
    if (userId) await adminPool.query(`DELETE FROM app_auth.users WHERE id = $1`, [userId]);
  });

  const input = () => createClientBudgetSchema.parse({
    companyId, clientId, title: "Pintura de paredes",
    item: { itemType: "service", description: "Pintura de paredes", unitName: "m²",
      quantity: 2, unitPrice: 13.50, unitCost: 7.50, taxable: true }
  });

  it("asocia el presupuesto al cliente y guarda la partida con su total", async () => {
    const budgetId = await createClientBudgetRepo(userId, input());
    expect(budgetId).toBeTruthy();
    const result = await adminPool.query(
      `SELECT b.client_id, b.project_id, b.subtotal, b.total, i.description, s.name
       FROM public.budgets b
       JOIN public.budget_items i ON i.budget_id = b.id
       JOIN public.budget_sections s ON s.id = i.section_id
       WHERE b.id = $1`,
      [budgetId]
    );
    expect(result.rows[0]).toMatchObject({
      client_id: clientId, project_id: null, description: "Pintura de paredes", name: "General"
    });
    expect(Number(result.rows[0].subtotal)).toBe(27);
    expect(Number(result.rows[0].total)).toBe(28.89);
  });

  it("revierte todo el presupuesto cuando la primera partida falla", async () => {
    const before = await adminPool.query<{ count: string }>(
      `SELECT count(*) FROM public.budgets WHERE company_id = $1`, [companyId]
    );
    await expect(createClientBudgetRepo(userId, {
      ...input(), item: { ...input().item, catalogItemId: randomUUID() }
    })).rejects.toThrow();
    const after = await adminPool.query<{ count: string }>(
      `SELECT count(*) FROM public.budgets WHERE company_id = $1`, [companyId]
    );
    expect(after.rows[0]!.count).toBe(before.rows[0]!.count);
  });

  it("rechaza clientes de otra empresa y archivados", async () => {
    expect(await createClientBudgetRepo(userId, { ...input(), clientId: otherClientId })).toBeNull();
    await adminPool.query(`UPDATE public.clients SET active = false WHERE id = $1`, [clientId]);
    expect(await createClientBudgetRepo(userId, input())).toBeNull();
  });
});
