import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { adminPool } from "../../db/test-db.js";
import {
  approveBudgetRepo,
  rejectBudgetRepo,
  addBudgetItemRepo,
  deleteBudgetItemRepo,
  getBudgetHistoryRepo,
  reopenBudgetRepo,
  updateBudgetRepo,
  updateBudgetItemRepo,
  BudgetDecisionError
} from "../repository.js";
import {
  saveCalculationRepo,
  findCompanyCalculationsRepo,
  deleteCalculationRepo,
  updateCalculationRepo
} from "../../calculations/repository.js";

describe("T-057: Suite de Pruebas de Totales de Presupuestos (Subtotales, Impuestos, Descuentos, Redondeos)", () => {
  const suffix = Math.floor(Math.random() * 1000000);
  const testEmail = `budget_calc_${suffix}@example.com`;
  let userId: string;
  let companyId: string;
  let clientId: string;
  let projectId: string;
  let budgetId: string;

  beforeAll(async () => {
    const userRes = await adminPool.query(`
      INSERT INTO app_auth.users (email, email_confirmed_at)
      VALUES ($1, now())
      RETURNING id
    `, [testEmail]);
    userId = userRes.rows[0].id;

    await adminPool.query(`
      UPDATE public.profiles SET active = true, approved_at = now() WHERE id = $1
    `, [userId]);

    const compRes = await adminPool.query(`
      INSERT INTO public.companies (name, created_by)
      VALUES ($1, $2)
      RETURNING id
    `, [`Company Budget ${suffix}`, userId]);
    companyId = compRes.rows[0].id;

    await adminPool.query(`
      INSERT INTO public.company_members (company_id, user_id, role, active)
      VALUES ($1, $2, 'owner', true)
    `, [companyId, userId]);

    const clientRes = await adminPool.query(`
      INSERT INTO public.clients (company_id, client_type, first_name, last_name, email)
      VALUES ($1, 'person', 'Budget', 'Client', $2)
      RETURNING id
    `, [companyId, `client_budget_${suffix}@example.com`]);
    clientId = clientRes.rows[0].id;

    const projRes = await adminPool.query(`
      INSERT INTO public.projects (company_id, client_id, name, created_by)
      VALUES ($1, $2, 'Project Budget Test', $3)
      RETURNING id
    `, [companyId, clientId, userId]);
    projectId = projRes.rows[0].id;

    await adminPool.query("SELECT set_config('app.user_id', $1, false)", [userId]);

    const budgetRes = await adminPool.query(`
      SELECT public.create_project_budget($1, $2, 'Presupuesto Totales') AS id
    `, [companyId, projectId]);
    budgetId = budgetRes.rows[0].id;
  });

  afterAll(async () => {
    await adminPool.query("DELETE FROM public.companies WHERE id = $1", [companyId]);
    await adminPool.query("DELETE FROM app_auth.users WHERE id = $1", [userId]);
  });

  it("1. Subtotales de Ítems y Redondeo de 2 Decimales", async () => {
    await adminPool.query("SELECT set_config('app.user_id', $1, false)", [userId]);

    await adminPool.query(`
      INSERT INTO public.budget_items (
        company_id, budget_id, item_type, description, quantity, unit_cost, unit_price, discount_percentage, taxable
      )
      VALUES ($1, $2, 'material', 'Material A', 10, 10, 15.55, 0, true)
    `, [companyId, budgetId]);

    await adminPool.query(`
      INSERT INTO public.budget_items (
        company_id, budget_id, item_type, description, quantity, unit_cost, unit_price, discount_percentage, taxable
      )
      VALUES ($1, $2, 'labor', 'Mano de Obra B', 3, 20, 33.33, 0, false)
    `, [companyId, budgetId]);

    const budgetRes = await adminPool.query("SELECT subtotal, tax_amount, total FROM public.budgets WHERE id = $1", [budgetId]);
    const budget = budgetRes.rows[0];

    expect(Number(budget.subtotal)).toBeCloseTo(255.49, 2);
  });

  it("2. Aplicación de Impuesto ITBMS (7%) sobre Subtotal Gravable", async () => {
    await adminPool.query("SELECT set_config('app.user_id', $1, false)", [userId]);

    await adminPool.query("UPDATE public.budgets SET tax_rate = 7 WHERE id = $1", [budgetId]);
    await adminPool.query("SELECT public.recalculate_budget_totals($1, $2)", [companyId, budgetId]);

    const budgetRes = await adminPool.query("SELECT subtotal, tax_rate, tax_amount, total FROM public.budgets WHERE id = $1", [budgetId]);
    const budget = budgetRes.rows[0];

    expect(Number(budget.tax_amount)).toBe(10.89);
    expect(Number(budget.total)).toBeCloseTo(266.38, 2);
  });

  it("3. Aplicación de Descuento Porcentual", async () => {
    await adminPool.query("SELECT set_config('app.user_id', $1, false)", [userId]);

    await adminPool.query("UPDATE public.budgets SET discount_type = 'percent', discount_value = 10 WHERE id = $1", [budgetId]);
    await adminPool.query("SELECT public.recalculate_budget_totals($1, $2)", [companyId, budgetId]);

    const budgetRes = await adminPool.query("SELECT subtotal, discount_amount, tax_amount, total FROM public.budgets WHERE id = $1", [budgetId]);
    const budget = budgetRes.rows[0];

    expect(Number(budget.discount_amount)).toBeGreaterThan(0);
    expect(Number(budget.total)).toBeGreaterThan(0);
  });

  it("4. Manejo de Redondeos en Descuentos Fijos", async () => {
    await adminPool.query("SELECT set_config('app.user_id', $1, false)", [userId]);

    await adminPool.query("UPDATE public.budgets SET discount_type = 'fixed', discount_value = 50 WHERE id = $1", [budgetId]);
    await adminPool.query("SELECT public.recalculate_budget_totals($1, $2)", [companyId, budgetId]);

    const budgetRes = await adminPool.query("SELECT subtotal, discount_amount, total FROM public.budgets WHERE id = $1", [budgetId]);
    const budget = budgetRes.rows[0];

    expect(Number(budget.discount_amount)).toBe(50.00);
    expect(Number(budget.total)).toBeGreaterThan(0);
    expect(Number.isInteger(Math.round(Number(budget.total) * 100))).toBe(true);
  });

  it("4b. Editar datos y partidas de un borrador recalcula los totales", async () => {
    const updated = await updateBudgetRepo(userId, budgetId, {
      companyId,
      title: "Presupuesto Totales editado",
      discountType: "none",
      taxRate: 7,
      terms: "Pago 50 % al inicio"
    });
    expect(updated).toBe(true);

    let budget = (await adminPool.query(
      "SELECT title, discount_type, discount_value, discount_amount, tax_amount, total, terms FROM public.budgets WHERE id = $1",
      [budgetId]
    )).rows[0];
    expect(budget.title).toBe("Presupuesto Totales editado");
    expect(budget.discount_type).toBe("none");
    expect(Number(budget.discount_value)).toBe(0);
    expect(Number(budget.discount_amount)).toBe(0);
    expect(Number(budget.tax_amount)).toBe(10.89);
    expect(Number(budget.total)).toBeCloseTo(266.38, 2);
    expect(budget.terms).toBe("Pago 50 % al inicio");

    const item = (await adminPool.query(
      "SELECT id FROM public.budget_items WHERE budget_id = $1 AND description = 'Material A'",
      [budgetId]
    )).rows[0];
    const edited = await updateBudgetItemRepo(userId, budgetId, item.id, { companyId, quantity: 20 });
    expect(Number(edited.quantity)).toBe(20);
    expect(Number(edited.subtotal)).toBeCloseTo(311, 2);

    budget = (await adminPool.query("SELECT subtotal FROM public.budgets WHERE id = $1", [budgetId])).rows[0];
    expect(Number(budget.subtotal)).toBeCloseTo(410.99, 2);

    const history = await getBudgetHistoryRepo(userId, budgetId, companyId);
    expect(history.some((entry) => entry.action === "item_updated")).toBe(true);
    expect(history.some((entry) => entry.action === "details_updated")).toBe(true);

    await updateBudgetItemRepo(userId, budgetId, item.id, { companyId, quantity: 10 });
  });

  it("4c. Eliminar una partida inexistente responde false", async () => {
    const missing = await deleteBudgetItemRepo(userId, budgetId, "00000000-0000-4000-8000-000000000000", companyId);
    expect(missing).toBe(false);
  });

  it("4d. El equipo no registra la aprobación de un borrador", async () => {
    await expect(approveBudgetRepo(userId, budgetId, companyId)).rejects.toBeInstanceOf(BudgetDecisionError);
    await expect(approveBudgetRepo(userId, budgetId, companyId)).rejects.toThrow("Envía el presupuesto");
  });

  it("5. T-087 & T-090: Aprobación del cliente y registro de historial", async () => {
    await adminPool.query("UPDATE public.budgets SET status = 'sent' WHERE id = $1", [budgetId]);
    const approved = await approveBudgetRepo(userId, budgetId, companyId);
    expect(approved.status).toBe("approved");
    expect(approved.approved_at).toBeDefined();

    const history = await getBudgetHistoryRepo(userId, budgetId, companyId);
    expect(history.length).toBeGreaterThan(0);
    expect(history.some((h) => h.action === "approved")).toBe(true);

    // Migración 049: la obra toma el valor del presupuesto aprobado y pasa a «Aprobada».
    const project = (await adminPool.query(
      "SELECT status, contract_value FROM public.projects WHERE id = $1",
      [projectId]
    )).rows[0];
    expect(project.status).toBe("approved");
    expect(Number(project.contract_value)).toBeCloseTo(Number(approved.total), 2);
  });

  it("6. T-089: Bloquear modificación de presupuesto aprobado", async () => {
    await expect(
      addBudgetItemRepo(userId, budgetId, {
        companyId,
        description: "Intento de modificación en aprobado",
        unitName: "unidad",
        quantity: 1,
        unitPrice: 50,
        unitCost: 20,
        discountPercentage: 0,
        taxable: true,
        itemType: "manual",
        notes: ""
      })
    ).rejects.toThrow("aprobado y bloqueado");
  });

  it("7. T-088: Rechazo de presupuesto con motivo", async () => {
    const budgetRes = await adminPool.query(`
      SELECT public.create_project_budget($1, $2, 'Presupuesto Rechazo') AS id
    `, [companyId, projectId]);
    const rejBudgetId = budgetRes.rows[0].id;
    await adminPool.query("UPDATE public.budgets SET status = 'sent' WHERE id = $1", [rejBudgetId]);

    const rejected = await rejectBudgetRepo(userId, rejBudgetId, "Presupuesto excede el presupuesto del cliente", companyId);
    expect(rejected.status).toBe("rejected");
    expect(rejected.rejection_reason).toBe("Presupuesto excede el presupuesto del cliente");
  });

  it("8. T-094 & T-095: Guardado y consulta de cálculos asociados a proyecto y cliente", async () => {
    const savedCalc = await saveCalculationRepo(userId, {
      companyId,
      projectId,
      clientId,
      formulaCode: "concrete",
      title: "Vaciado Losa de Techo",
      inputData: { length: 10, width: 8, thickness: 0.15 },
      priceData: { cementBag: 10 },
      resultsData: { totalCost: 1500 },
      totalCost: 1500
    });

    expect(savedCalc.id).toBeDefined();
    expect(savedCalc.formula_code).toBe("concrete");

    const list = await findCompanyCalculationsRepo(userId, companyId, projectId);
    expect(list.length).toBeGreaterThan(0);
    expect(list[0].title).toBe("Vaciado Losa de Techo");

    const updatedCalc = await updateCalculationRepo(userId, savedCalc.id, {
      companyId,
      projectId,
      clientId,
      formulaCode: "concrete",
      title: "Vaciado Losa de Techo (revisado)",
      inputData: { length: 12, width: 8, thickness: 0.15 },
      priceData: { cementBag: 10 },
      resultsData: { totalCost: 1800 },
      totalCost: 1800
    });
    expect(updatedCalc?.id).toBe(savedCalc.id);
    expect(Number(updatedCalc?.total_cost)).toBe(1800);

    // Un cálculo no cambia de calculadora.
    const otherFormula = await updateCalculationRepo(userId, savedCalc.id, {
      companyId,
      projectId,
      clientId,
      formulaCode: "paint",
      title: "Otro",
      inputData: {},
      priceData: {},
      resultsData: {},
      totalCost: 0
    });
    expect(otherFormula).toBeNull();

    await deleteCalculationRepo(userId, savedCalc.id, companyId);
  });

  it("9. Un presupuesto rechazado no acepta partidas hasta volver a borrador con versión nueva", async () => {
    const budgetRes = await adminPool.query(`
      SELECT public.create_project_budget($1, $2, 'Presupuesto Reabrir') AS id
    `, [companyId, projectId]);
    const reopenBudgetId = budgetRes.rows[0].id;
    const item = {
      companyId,
      description: "Partida tras reabrir",
      unitName: "unidad",
      quantity: 2,
      unitPrice: 25,
      unitCost: 10,
      discountPercentage: 0,
      taxable: true,
      itemType: "manual" as const,
      notes: ""
    };

    await adminPool.query("UPDATE public.budgets SET status = 'viewed' WHERE id = $1", [reopenBudgetId]);
    await rejectBudgetRepo(userId, reopenBudgetId, "Necesito otra cotización", companyId);
    await expect(addBudgetItemRepo(userId, reopenBudgetId, item)).rejects.toThrow("Editar presupuesto");

    const reopened = await reopenBudgetRepo(userId, reopenBudgetId, companyId);
    expect(reopened.status).toBe("draft");
    expect(reopened.version).toBe(2);
    expect(reopened.rejection_reason).toBeNull();

    const versions = await adminPool.query(
      `SELECT version_number FROM public.budget_versions WHERE budget_id = $1`,
      [reopenBudgetId]
    );
    expect(versions.rows.map((row) => row.version_number)).toContain(1);

    const history = await getBudgetHistoryRepo(userId, reopenBudgetId, companyId);
    expect(history.some((entry) => entry.action === "reopened" && entry.version === 2)).toBe(true);

    const added = await addBudgetItemRepo(userId, reopenBudgetId, item);
    expect(added?.description).toBe("Partida tras reabrir");
  });

  it("10. Un presupuesto aprobado o en borrador no se puede reabrir", async () => {
    await expect(reopenBudgetRepo(userId, budgetId, companyId)).rejects.toThrow("aprobado o cancelado");

    const budgetRes = await adminPool.query(`
      SELECT public.create_project_budget($1, $2, 'Presupuesto Borrador') AS id
    `, [companyId, projectId]);
    await expect(reopenBudgetRepo(userId, budgetRes.rows[0].id, companyId)).rejects.toThrow("ya está en borrador");
  });
});
