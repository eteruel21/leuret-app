import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { adminPool } from "../../db/test-db.js";
import {
  approveBudgetRepo,
  findClientBudgets,
  getClientBudgetDetailRepo,
  sendBudgetRepo,
  BudgetSendError
} from "../../budgets/repository.js";
import { createInvoiceRepo, issueInvoiceRepo, recordInvoicePaymentRepo } from "../../invoices/repository.js";
import { updateProjectPhotoSharingRepo } from "../../storage/repository.js";
import {
  findClientInvoicesRepo,
  findClientUpcomingActivitiesRepo,
  getClientInvoiceDetailRepo,
  getClientProjectDetailRepo,
  getClientSummaryRepo
} from "../repository.js";

async function createActiveUser(email: string, role: "contractor" | "client") {
  const result = await adminPool.query<{ id: string }>(
    `INSERT INTO app_auth.users (email, email_confirmed_at) VALUES ($1, now()) RETURNING id`,
    [email]
  );
  const id = result.rows[0]!.id;
  await adminPool.query(
    `UPDATE public.profiles SET active = true, approved_at = now(), role = $2::public.global_user_role WHERE id = $1`,
    [id, role]
  );
  return id;
}

describe("Portal del cliente: visibilidad y aislamiento", () => {
  const suffix = Math.floor(Math.random() * 1_000_000);
  let ownerId: string;
  let clientUserId: string;
  let outsiderId: string;
  let companyId: string;
  let clientId: string;
  let projectId: string;
  let budgetId: string;
  let draftBudgetId: string;
  let invoiceId: string;
  let sharedPhotoId: string;
  let privatePhotoId: string;

  beforeAll(async () => {
    ownerId = await createActiveUser(`portal_owner_${suffix}@example.com`, "contractor");
    clientUserId = await createActiveUser(`portal_client_${suffix}@example.com`, "client");
    outsiderId = await createActiveUser(`portal_outsider_${suffix}@example.com`, "client");

    companyId = (
      await adminPool.query<{ id: string }>(
        `INSERT INTO public.companies (name, created_by) VALUES ($1, $2) RETURNING id`,
        [`Portal Co ${suffix}`, ownerId]
      )
    ).rows[0]!.id;

    await adminPool.query(
      `INSERT INTO public.company_members (company_id, user_id, role, active) VALUES ($1, $2, 'owner', true)`,
      [companyId, ownerId]
    );

    clientId = (
      await adminPool.query<{ id: string }>(
        `
          INSERT INTO public.clients (company_id, client_type, first_name, last_name, email, user_id)
          VALUES ($1, 'person', 'Ana', 'Cliente', $2, $3)
          RETURNING id
        `,
        [companyId, `portal_client_${suffix}@example.com`, clientUserId]
      )
    ).rows[0]!.id;

    projectId = (
      await adminPool.query<{ id: string }>(
        `
          INSERT INTO public.projects (company_id, client_id, name, status, created_by)
          VALUES ($1, $2, 'Casa Ana', 'in_progress', $3)
          RETURNING id
        `,
        [companyId, clientId, ownerId]
      )
    ).rows[0]!.id;

    await adminPool.query("SELECT set_config('app.user_id', $1, false)", [ownerId]);

    budgetId = (
      await adminPool.query<{ id: string }>(
        `SELECT public.create_project_budget($1, $2, 'Remodelación cocina') AS id`,
        [companyId, projectId]
      )
    ).rows[0]!.id;
    draftBudgetId = (
      await adminPool.query<{ id: string }>(
        `SELECT public.create_project_budget($1, $2, 'Borrador interno') AS id`,
        [companyId, projectId]
      )
    ).rows[0]!.id;

    for (const id of [budgetId, draftBudgetId]) {
      await adminPool.query(
        `
          INSERT INTO public.budget_items (company_id, budget_id, item_type, description, quantity, unit_cost, unit_price, discount_percentage, taxable)
          VALUES ($1, $2, 'manual', 'Gabinetes', 1, 500, 800, 0, true)
        `,
        [companyId, id]
      );
    }

    await adminPool.query(
      `
        INSERT INTO public.project_progress_history (company_id, project_id, progress_percentage, previous_percentage, notes, created_by)
        VALUES ($1, $2, 40, 0, 'Demolición terminada', $3)
      `,
      [companyId, projectId, ownerId]
    );

    const photos = await adminPool.query<{ id: string }>(
      `
        INSERT INTO public.project_photos (company_id, project_id, storage_path, file_name, is_private, created_by)
        VALUES
          ($1, $2, $3, 'a.jpg', true, $4),
          ($1, $2, $5, 'b.jpg', true, $4)
        RETURNING id
      `,
      [
        companyId,
        projectId,
        `companies/${companyId}/projects/${projectId}/a.jpg`,
        ownerId,
        `companies/${companyId}/projects/${projectId}/b.jpg`
      ]
    );
    sharedPhotoId = photos.rows[0]!.id;
    privatePhotoId = photos.rows[1]!.id;

    await adminPool.query(
      `
        INSERT INTO public.activities (company_id, project_id, title, type, status, date, start_time, notes, created_by)
        VALUES
          ($1, $2, 'Visita de inspección', 'visit', 'scheduled', '2999-01-15', '09:00', 'nota interna', $3),
          ($1, $2, 'Visita cancelada', 'visit', 'cancelled', '2999-01-16', '09:00', null, $3)
      `,
      [companyId, projectId, ownerId]
    );
  });

  afterAll(async () => {
    // Los pagos y facturas emitidas son inmutables por diseño (triggers). La
    // limpieza del test corre en una sola conexión privilegiada sin triggers.
    const connection = await adminPool.connect();
    try {
      await connection.query("BEGIN");
      await connection.query("SET LOCAL session_replication_role = replica");
      await connection.query("DELETE FROM public.invoice_payments WHERE company_id = $1", [companyId]);
      await connection.query("DELETE FROM public.invoice_history WHERE company_id = $1", [companyId]);
      await connection.query("DELETE FROM public.invoices WHERE company_id = $1", [companyId]);
      // Con triggers activos otra vez, para que los ON DELETE CASCADE limpien el resto.
      await connection.query("SET LOCAL session_replication_role = origin");
      await connection.query("DELETE FROM public.companies WHERE id = $1", [companyId]);
      await connection.query("DELETE FROM app_auth.users WHERE id = ANY($1::uuid[])", [[ownerId, clientUserId, outsiderId]]);
      await connection.query("COMMIT");
    } catch (error) {
      await connection.query("ROLLBACK");
      throw error;
    } finally {
      connection.release();
    }
  });

  it("no muestra borradores al cliente", async () => {
    expect(await findClientBudgets(clientUserId)).toHaveLength(0);
    expect(await getClientBudgetDetailRepo(clientUserId, draftBudgetId)).toBeNull();
  });

  it("enviar un borrador lo publica al cliente y devuelve su usuario", async () => {
    const result = await sendBudgetRepo(ownerId, budgetId, companyId, "2999-12-31");
    expect(result.budget.status).toBe("sent");
    expect(result.clientUserId).toBe(clientUserId);

    await expect(sendBudgetRepo(ownerId, budgetId, companyId)).rejects.toBeInstanceOf(BudgetSendError);

    const budgets = await findClientBudgets(clientUserId);
    expect(budgets.map((budget) => budget.id)).toEqual([budgetId]);
    expect(await findClientBudgets(outsiderId)).toHaveLength(0);

    const summary = await getClientSummaryRepo(clientUserId);
    expect(summary.pending_budgets).toBe(1);
    expect(summary.active_projects).toBe(1);
  });

  it("solo expone fotos compartidas y actividades no canceladas del proyecto", async () => {
    let detail = await getClientProjectDetailRepo(clientUserId, projectId);
    expect(detail?.photos).toHaveLength(0);
    expect(detail?.progress_history).toHaveLength(1);
    expect(detail?.activities.map((activity: { title: string }) => activity.title)).toEqual(["Visita de inspección"]);
    expect(detail?.activities[0]).not.toHaveProperty("notes");
    expect(detail?.budgets.map((budget: { id: string }) => budget.id)).toEqual([budgetId]);

    await updateProjectPhotoSharingRepo(ownerId, companyId, projectId, sharedPhotoId, true);
    detail = await getClientProjectDetailRepo(clientUserId, projectId);
    expect(detail?.photos.map((photo: { id: string }) => photo.id)).toEqual([sharedPhotoId]);
    expect(detail?.photos.some((photo: { id: string }) => photo.id === privatePhotoId)).toBe(false);

    expect(await getClientProjectDetailRepo(outsiderId, projectId)).toBeNull();

    const upcoming = await findClientUpcomingActivitiesRepo(clientUserId);
    expect(upcoming.map((activity) => activity.title)).toEqual(["Visita de inspección"]);
    expect(await findClientUpcomingActivitiesRepo(outsiderId)).toHaveLength(0);
  });

  it("muestra facturas emitidas con saldo y pagos, nunca borradores", async () => {
    await approveBudgetRepo(ownerId, budgetId, companyId);
    const draft = await createInvoiceRepo(ownerId, { companyId, clientId, budgetId });
    invoiceId = draft.id;

    expect(await findClientInvoicesRepo(clientUserId)).toHaveLength(0);
    expect(await getClientInvoiceDetailRepo(clientUserId, invoiceId)).toBeNull();

    const issued = await issueInvoiceRepo(ownerId, invoiceId, companyId);
    expect(issued?.status).toBe("issued");

    await recordInvoicePaymentRepo(ownerId, invoiceId, {
      companyId,
      amount: 100,
      method: "bank_transfer"
    } as never);

    const invoices = await findClientInvoicesRepo(clientUserId);
    expect(invoices).toHaveLength(1);
    expect(invoices[0].project_id).toBe(projectId);
    expect(invoices[0].total_paid).toBeCloseTo(100, 2);
    expect(invoices[0].balance_due).toBeCloseTo(invoices[0].total_amount - 100, 2);

    const detail = await getClientInvoiceDetailRepo(clientUserId, invoiceId);
    expect(detail?.payments).toHaveLength(1);
    expect(detail?.payments[0]).not.toHaveProperty("notes");

    expect(await findClientInvoicesRepo(outsiderId)).toHaveLength(0);
    expect(await getClientInvoiceDetailRepo(outsiderId, invoiceId)).toBeNull();

    const summary = await getClientSummaryRepo(clientUserId);
    expect(summary.open_invoices).toHaveLength(1);
    expect(summary.open_invoices[0]?.balance_due).toBeCloseTo(invoices[0].balance_due, 2);

    const projectDetail = await getClientProjectDetailRepo(clientUserId, projectId);
    expect(projectDetail?.invoices.map((invoice: { id: string }) => invoice.id)).toEqual([invoiceId]);
  });
});
