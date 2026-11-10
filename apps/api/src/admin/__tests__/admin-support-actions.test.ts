import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { adminPool } from "../../db/test-db.js";
import { approveBudgetRepo, sendBudgetRepo } from "../../budgets/repository.js";
import { createInvoiceRepo, issueInvoiceRepo } from "../../invoices/repository.js";
import {
  adminCancelInvoiceRepo,
  adminSetProjectStatusRepo,
  findAdminInvoiceDetailRepo,
  listAdminAuditLogsRepo,
  listAdminProjectsRepo,
  revokeAdminUserSessionsRepo
} from "../operations-repository.js";

async function createActiveUser(email: string, role: "contractor" | "client" | "super_admin") {
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

const filters = { limit: 50, offset: 0 };

describe("Panel admin: lectura global y acciones de soporte del superadministrador", () => {
  const suffix = Math.floor(Math.random() * 1_000_000);
  let superAdminId: string;
  let ownerId: string;
  let companyId: string;
  let clientId: string;
  let projectId: string;
  let invoiceId: string;

  beforeAll(async () => {
    superAdminId = await createActiveUser(`support_admin_${suffix}@example.com`, "super_admin");
    ownerId = await createActiveUser(`support_owner_${suffix}@example.com`, "contractor");

    companyId = (
      await adminPool.query<{ id: string }>(
        `INSERT INTO public.companies (name, created_by) VALUES ($1, $2) RETURNING id`,
        [`Soporte Co ${suffix}`, ownerId]
      )
    ).rows[0]!.id;
    await adminPool.query(
      `INSERT INTO public.company_members (company_id, user_id, role, active) VALUES ($1, $2, 'owner', true)`,
      [companyId, ownerId]
    );

    clientId = (
      await adminPool.query<{ id: string }>(
        `
          INSERT INTO public.clients (company_id, client_type, first_name, last_name, email)
          VALUES ($1, 'person', 'Beto', 'Cliente', $2)
          RETURNING id
        `,
        [companyId, `support_client_${suffix}@example.com`]
      )
    ).rows[0]!.id;

    projectId = (
      await adminPool.query<{ id: string }>(
        `
          INSERT INTO public.projects (company_id, client_id, name, status, created_by)
          VALUES ($1, $2, 'Obra de soporte', 'in_progress', $3)
          RETURNING id
        `,
        [companyId, clientId, ownerId]
      )
    ).rows[0]!.id;

    await adminPool.query("SELECT set_config('app.user_id', $1, false)", [ownerId]);
    const budgetId = (
      await adminPool.query<{ id: string }>(
        `SELECT public.create_project_budget($1, $2, 'Presupuesto soporte') AS id`,
        [companyId, projectId]
      )
    ).rows[0]!.id;
    await adminPool.query(
      `
        INSERT INTO public.budget_items (company_id, budget_id, item_type, description, quantity, unit_cost, unit_price, discount_percentage, taxable)
        VALUES ($1, $2, 'manual', 'Pintura', 1, 100, 150, 0, true)
      `,
      [companyId, budgetId]
    );

    await sendBudgetRepo(ownerId, budgetId, companyId, "2999-12-31");
    await approveBudgetRepo(ownerId, budgetId, companyId);
    invoiceId = (await createInvoiceRepo(ownerId, { companyId, clientId, budgetId })).id;
    await issueInvoiceRepo(ownerId, invoiceId, companyId);
  });

  afterAll(async () => {
    const connection = await adminPool.connect();
    try {
      await connection.query("BEGIN");
      await connection.query("SET LOCAL session_replication_role = replica");
      await connection.query("DELETE FROM public.invoice_history WHERE company_id = $1", [companyId]);
      await connection.query("DELETE FROM public.invoices WHERE company_id = $1", [companyId]);
      await connection.query("SET LOCAL session_replication_role = origin");
      await connection.query(
        "DELETE FROM public.admin_audit_logs WHERE company_id = $1 OR user_id = ANY($2::uuid[])",
        [companyId, [superAdminId, ownerId]]
      );
      await connection.query("DELETE FROM public.companies WHERE id = $1", [companyId]);
      await connection.query("DELETE FROM app_auth.users WHERE id = ANY($1::uuid[])", [[superAdminId, ownerId]]);
      await connection.query("COMMIT");
    } catch (error) {
      await connection.query("ROLLBACK");
      throw error;
    } finally {
      connection.release();
    }
  });

  it("el superadministrador lee obras y facturas de cualquier empresa", async () => {
    const projects = await listAdminProjectsRepo(superAdminId, { ...filters, companyId });
    expect(projects.map((row) => row.id)).toEqual([projectId]);

    const invoice = await findAdminInvoiceDetailRepo(superAdminId, invoiceId);
    expect(invoice?.invoice.status).toBe("issued");
    expect(Number(invoice?.invoice.total)).toBeGreaterThan(0);
  });

  it("un contratista no puede usar las acciones de soporte", async () => {
    await expect(adminSetProjectStatusRepo(ownerId, projectId, "paused", "Intento sin permiso")).rejects.toThrow(
      /superadministrador/
    );
    await expect(adminCancelInvoiceRepo(ownerId, invoiceId, "Intento sin permiso")).rejects.toThrow(/superadministrador/);
  });

  it("cambia el estado de la obra y lo deja en la auditoría", async () => {
    expect(await adminSetProjectStatusRepo(superAdminId, projectId, "paused", "El cliente pidió pausar")).toBe(projectId);

    const status = await adminPool.query<{ status: string }>("SELECT status::text FROM public.projects WHERE id = $1", [projectId]);
    expect(status.rows[0]?.status).toBe("paused");

    await expect(adminSetProjectStatusRepo(superAdminId, projectId, "paused", "Otra vez lo mismo")).rejects.toThrow(
      /ya tiene ese estado/
    );

    const logs = await listAdminAuditLogsRepo(superAdminId, { ...filters, status: "ADMIN_PROJECT_STATUS_CHANGED", companyId });
    expect(logs).toHaveLength(1);
    expect(logs[0]!.metadata).toMatchObject({ fromStatus: "in_progress", toStatus: "paused", reason: "El cliente pidió pausar" });
  });

  it("anula la factura con motivo en el historial y la auditoría", async () => {
    expect(await adminCancelInvoiceRepo(superAdminId, invoiceId, "Factura emitida por error")).toBe(invoiceId);

    const detail = await findAdminInvoiceDetailRepo(superAdminId, invoiceId);
    expect(detail?.invoice.status).toBe("cancelled");
    expect(detail?.history[0]?.event_type).toBe("cancelled");

    await expect(adminCancelInvoiceRepo(superAdminId, invoiceId, "Otra anulación")).rejects.toThrow(/emitida o vencida/);

    const logs = await listAdminAuditLogsRepo(superAdminId, { ...filters, status: "ADMIN_INVOICE_CANCELLED", companyId });
    expect(logs).toHaveLength(1);
  });

  it("cierra las sesiones de un usuario y registra la acción sin empresa", async () => {
    await adminPool.query(
      `
        INSERT INTO app_auth.sessions (user_id, refresh_token_hash, expires_at)
        VALUES ($1, $2, now() + interval '1 day')
      `,
      [ownerId, `hash_${suffix}`]
    );

    expect(await revokeAdminUserSessionsRepo(superAdminId, ownerId, "Teléfono perdido")).toEqual({ revokedCount: 1 });

    const open = await adminPool.query(
      "SELECT 1 FROM app_auth.sessions WHERE user_id = $1 AND revoked_at IS NULL",
      [ownerId]
    );
    expect(open.rowCount).toBe(0);

    const logs = await listAdminAuditLogsRepo(superAdminId, { ...filters, status: "ADMIN_SESSIONS_REVOKED", search: ownerId });
    expect(logs).toHaveLength(1);
    expect(logs[0]!.company_id).toBeNull();
  });
});
