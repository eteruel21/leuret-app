import { withUserTransaction } from "../db/with-user-transaction.js";
import type { z } from "zod";
import type { createBudgetItemSchema } from "./schemas.js";

export type CreateBudgetItemInput = z.infer<typeof createBudgetItemSchema>;

export async function findClientBudgets(userId: string) {
  return withUserTransaction(userId, async (client) => {
    const result = await client.query(`
      SELECT
        budget.*,
        CASE
          WHEN project.id IS NULL THEN NULL
          ELSE jsonb_build_object('name', project.name)
        END AS project,
        CASE
          WHEN company.id IS NULL THEN NULL
          ELSE jsonb_build_object('name', company.name)
        END AS company
      FROM public.budgets AS budget
      JOIN public.clients AS customer ON customer.id = budget.client_id
      LEFT JOIN public.projects AS project ON project.id = budget.project_id
      LEFT JOIN public.companies AS company ON company.id = budget.company_id
      WHERE customer.user_id = app.current_user_id()
      ORDER BY budget.created_at DESC
    `);
    return result.rows;
  });
}

export async function getClientBudgetDetailRepo(userId: string, budgetId: string) {
  return withUserTransaction(userId, async (client) => {
    const budgetResult = await client.query(
      `
        SELECT
          budget.*,
          CASE
            WHEN project.id IS NULL THEN NULL
            ELSE jsonb_build_object('name', project.name, 'code', project.project_code)
          END AS project,
          CASE
            WHEN company.id IS NULL THEN NULL
            ELSE jsonb_build_object('name', company.name, 'phone', company.phone, 'email', company.email)
          END AS company
        FROM public.budgets AS budget
        JOIN public.clients AS customer ON customer.id = budget.client_id
        LEFT JOIN public.projects AS project ON project.id = budget.project_id
        LEFT JOIN public.companies AS company ON company.id = budget.company_id
        WHERE budget.id = $1
          AND customer.user_id = app.current_user_id()
        LIMIT 1
      `,
      [budgetId]
    );

    const budget = budgetResult.rows[0];
    if (!budget) return null;

    // La primera vez que el cliente abre un presupuesto enviado, queda como "visto".
    if (budget.status === "sent") {
      const viewed = await client.query<{ marked: boolean }>(
        `SELECT private.mark_budget_viewed_by_client($1) AS marked`,
        [budget.id]
      );
      if (viewed.rows[0]?.marked) {
        budget.status = "viewed";
      }
    }

    const sectionsResult = await client.query(
      `
        SELECT *
        FROM public.budget_sections
        WHERE budget_id = $1
        ORDER BY sort_order ASC
      `,
      [budget.id]
    );

    const itemsResult = await client.query(
      `
        SELECT *
        FROM public.budget_items
        WHERE budget_id = $1
        ORDER BY sort_order ASC, created_at ASC
      `,
      [budget.id]
    );

    return {
      ...budget,
      sections: sectionsResult.rows,
      items: itemsResult.rows
    };
  });
}

export async function findCompanyBudgets(userId: string, companyId: string, projectId?: string) {
  return withUserTransaction(userId, async (client) => {
    if (projectId) {
      const result = await client.query(
        `
          SELECT *
          FROM public.budgets
          WHERE company_id = $1
            AND project_id = $2
          ORDER BY created_at DESC
        `,
        [companyId, projectId]
      );
      return result.rows;
    }

    const result = await client.query(
      `
        SELECT *
        FROM public.budgets
        WHERE company_id = $1
        ORDER BY created_at DESC
      `,
      [companyId]
    );
    return result.rows;
  });
}

export async function createProjectBudgetRepo(userId: string, companyId: string, projectId: string, title?: string) {
  return withUserTransaction(userId, async (client) => {
    let budgetId: string | null = null;
    if (title) {
      const result = await client.query<{ id: string | null }>(
        `
          SELECT public.create_project_budget($1, $2, $3) AS id
        `,
        [companyId, projectId, title]
      );
      budgetId = result.rows[0]?.id ?? null;
    } else {
      const result = await client.query<{ id: string | null }>(
        `
          SELECT public.create_project_budget($1, $2) AS id
        `,
        [companyId, projectId]
      );
      budgetId = result.rows[0]?.id ?? null;
    }

    if (budgetId) {
      await client.query(
        `
          INSERT INTO public.budget_change_history (company_id, budget_id, version, action, performed_by, notes)
          VALUES ($1, $2, 1, 'created', app.current_user_id(), 'Presupuesto creado')
        `,
        [companyId, budgetId]
      );
    }

    return budgetId;
  });
}

export async function getBudgetDetailsRepo(userId: string, budgetId: string, companyId: string) {
  return withUserTransaction(userId, async (client) => {
    const budgetResult = await client.query(
      `
        SELECT *
        FROM public.budgets
        WHERE id = $1
          AND company_id = $2
        LIMIT 1
      `,
      [budgetId, companyId]
    );

    const budget = budgetResult.rows[0];
    if (!budget) return null;

    const sectionsResult = await client.query(
      `
        SELECT *
        FROM public.budget_sections
        WHERE budget_id = $1
          AND company_id = $2
        ORDER BY sort_order ASC
      `,
      [budget.id, budget.company_id]
    );

    const itemsResult = await client.query(
      `
        SELECT *
        FROM public.budget_items
        WHERE budget_id = $1
          AND company_id = $2
        ORDER BY
          sort_order ASC,
          created_at ASC
      `,
      [budget.id, budget.company_id]
    );

    const clientResult = await client.query(
      `
        SELECT *
        FROM public.clients
        WHERE id = $1
          AND company_id = $2
        LIMIT 1
      `,
      [budget.client_id, budget.company_id]
    );

    const projectResult = await client.query(
      `
        SELECT *
        FROM public.projects
        WHERE id = $1
          AND company_id = $2
        LIMIT 1
      `,
      [budget.project_id, budget.company_id]
    );

    const project = projectResult.rows[0] ?? null;
    let address = null;

    if (project?.address_id) {
      const addressResult = await client.query(
        `
          SELECT *
          FROM public.client_addresses
          WHERE id = $1
            AND company_id = $2
          LIMIT 1
        `,
        [project.address_id, budget.company_id]
      );
      address = addressResult.rows[0] ?? null;
    }

    return {
      ...budget,
      sections: sectionsResult.rows,
      items: itemsResult.rows,
      client: clientResult.rows[0] ?? null,
      project,
      address
    };
  });
}

async function checkBudgetNotApproved(client: any, budgetId: string) {
  const check = await client.query(
    `SELECT status FROM public.budgets WHERE id = $1 LIMIT 1`,
    [budgetId]
  );
  if (check.rows[0]?.status === "approved") {
    throw new Error("El presupuesto está aprobado y bloqueado. No se puede modificar.");
  }
}

export async function addBudgetItemRepo(userId: string, budgetId: string, input: CreateBudgetItemInput) {
  return withUserTransaction(userId, async (client) => {
    await checkBudgetNotApproved(client, budgetId);

    const result = await client.query(
      `
        INSERT INTO public.budget_items (
          company_id,
          budget_id,
          section_id,
          catalog_item_id,
          platform_catalog_item_id,
          item_type,
          description,
          unit_name,
          quantity,
          unit_cost,
          unit_price,
          discount_percentage,
          taxable,
          notes,
          materials
        )
        VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15::jsonb
        )
        RETURNING *
      `,
      [
        input.companyId,
        budgetId,
        input.sectionId ?? null,
        input.catalogItemId ?? null,
        input.platformCatalogItemId ?? null,
        input.itemType,
        input.description,
        input.unitName || "unidad",
        input.quantity,
        input.unitCost,
        input.unitPrice,
        input.discountPercentage,
        input.taxable,
        input.notes || null,
        input.materials && input.materials.length > 0
          ? JSON.stringify(input.materials)
          : null
      ]
    );

    const item = result.rows[0] ?? null;

    if (item) {
      await client.query(
        `
          INSERT INTO public.budget_change_history (company_id, budget_id, version, action, performed_by, notes)
          SELECT company_id, id, version, 'item_added', app.current_user_id(), $2
          FROM public.budgets WHERE id = $1
        `,
        [budgetId, `Partida añadida: ${input.description}`]
      );
    }

    return item;
  });
}

export async function deleteBudgetItemRepo(userId: string, budgetId: string, itemId: string, companyId: string) {
  return withUserTransaction(userId, async (client) => {
    await checkBudgetNotApproved(client, budgetId);

    await client.query(
      `
        DELETE FROM public.budget_items
        WHERE id = $1
          AND budget_id = $2
          AND company_id = $3
      `,
      [itemId, budgetId, companyId]
    );

    await client.query(
      `
        INSERT INTO public.budget_change_history (company_id, budget_id, version, action, performed_by, notes)
        VALUES ($1, $2, 1, 'item_deleted', app.current_user_id(), 'Partida eliminada')
      `,
      [companyId, budgetId]
    );
  });
}

export async function approveBudgetRepo(userId: string, budgetId: string, companyId?: string) {
  return withUserTransaction(userId, async (client) => {
    let whereClause = `WHERE id = $1`;
    const queryParams: any[] = [budgetId];

    if (companyId) {
      whereClause += ` AND company_id = $2`;
      queryParams.push(companyId);
    }

    const budgetRes = await client.query(
      `SELECT * FROM public.budgets ${whereClause} LIMIT 1`,
      queryParams
    );

    const currentBudget = budgetRes.rows[0];
    if (!currentBudget) {
      throw new Error("No se encontró el presupuesto.");
    }

    if (currentBudget.status === "approved") {
      return currentBudget;
    }

    const updateRes = await client.query(
      `
        UPDATE public.budgets
        SET status = 'approved',
            approved_at = NOW(),
            approved_by = app.current_user_id(),
            updated_at = NOW()
        WHERE id = $1
        RETURNING *
      `,
      [budgetId]
    );

    const approvedBudget = updateRes.rows[0];

    // Build snapshot data for versioning
    const itemsRes = await client.query(
      `SELECT * FROM public.budget_items WHERE budget_id = $1 ORDER BY sort_order ASC`,
      [budgetId]
    );
    const snapshot = {
      budget: approvedBudget,
      items: itemsRes.rows
    };

    // Save in budget_versions
    await client.query(
      `
        INSERT INTO public.budget_versions (company_id, budget_id, version_number, snapshot_data, created_by)
        VALUES ($1, $2, $3, $4, app.current_user_id())
        ON CONFLICT DO NOTHING
      `,
      [approvedBudget.company_id, budgetId, approvedBudget.version, JSON.stringify(snapshot)]
    );

    // Save in budget_change_history
    await client.query(
      `
        INSERT INTO public.budget_change_history (company_id, budget_id, version, action, performed_by, notes, snapshot)
        VALUES ($1, $2, $3, 'approved', app.current_user_id(), 'Presupuesto aprobado por el cliente', $4)
      `,
      [approvedBudget.company_id, budgetId, approvedBudget.version, JSON.stringify(snapshot)]
    );

    return approvedBudget;
  });
}

export async function rejectBudgetRepo(userId: string, budgetId: string, rejectionReason: string, companyId?: string) {
  return withUserTransaction(userId, async (client) => {
    let whereClause = `WHERE id = $1`;
    const queryParams: any[] = [budgetId];

    if (companyId) {
      whereClause += ` AND company_id = $2`;
      queryParams.push(companyId);
    }

    const budgetRes = await client.query(
      `SELECT * FROM public.budgets ${whereClause} LIMIT 1`,
      queryParams
    );

    const currentBudget = budgetRes.rows[0];
    if (!currentBudget) {
      throw new Error("No se encontró el presupuesto.");
    }

    if (currentBudget.status === "approved") {
      throw new Error("El presupuesto ya ha sido aprobado y no puede ser rechazado.");
    }

    const updateRes = await client.query(
      `
        UPDATE public.budgets
        SET status = 'rejected',
            rejection_reason = $2,
            updated_at = NOW()
        WHERE id = $1
        RETURNING *
      `,
      [budgetId, rejectionReason]
    );

    const rejectedBudget = updateRes.rows[0];

    await client.query(
      `
        INSERT INTO public.budget_change_history (company_id, budget_id, version, action, performed_by, notes)
        VALUES ($1, $2, $3, 'rejected', app.current_user_id(), $4)
      `,
      [rejectedBudget.company_id, budgetId, rejectedBudget.version, `Rechazado con motivo: ${rejectionReason}`]
    );

    return rejectedBudget;
  });
}

export async function getBudgetHistoryRepo(userId: string, budgetId: string, companyId?: string) {
  return withUserTransaction(userId, async (client) => {
    let whereClause = `WHERE budget_id = $1`;
    const queryParams: any[] = [budgetId];

    if (companyId) {
      whereClause += ` AND company_id = $2`;
      queryParams.push(companyId);
    }

    const result = await client.query(
      `
        SELECT *
        FROM public.budget_change_history
        ${whereClause}
        ORDER BY created_at DESC
      `,
      queryParams
    );

    return result.rows;
  });
}

/** ¿El usuario actual es el cliente vinculado a este presupuesto? */
export async function isLinkedClientForBudgetRepo(userId: string, budgetId: string): Promise<boolean> {
  return withUserTransaction(userId, async (client) => {
    const result = await client.query<{ linked: boolean }>(
      `
        SELECT EXISTS (
          SELECT 1
          FROM public.budgets AS budget
          JOIN public.clients AS customer
            ON customer.id = budget.client_id
           AND customer.company_id = budget.company_id
          WHERE budget.id = $1
            AND customer.user_id = app.current_user_id()
            AND customer.active = true
        ) AS linked
      `,
      [budgetId]
    );
    return result.rows[0]?.linked === true;
  });
}

/** Respuesta del cliente desde su portal (aprobación o rechazo). */
export async function respondToBudgetAsClientRepo(
  userId: string,
  budgetId: string,
  decision: "approved" | "rejected",
  reason?: string
) {
  return withUserTransaction(userId, async (client) => {
    const result = await client.query(
      `SELECT * FROM private.respond_to_budget_as_client($1, $2, $3)`,
      [budgetId, decision, reason ?? null]
    );
    return result.rows[0] ?? null;
  });
}

const CATALOG_PRICE_SQL = `CASE WHEN catalog.sale_price > 0 THEN catalog.sale_price ELSE catalog.unit_cost END`;

export async function findBudgetPriceUpdatesRepo(userId: string, budgetId: string, companyId: string) {
  return withUserTransaction(userId, async (client) => {
    const budget = await client.query(
      `SELECT status FROM public.budgets WHERE id = $1 AND company_id = $2 LIMIT 1`,
      [budgetId, companyId]
    );

    if (budget.rowCount === 0) {
      return null;
    }

    const result = await client.query(
      `
        SELECT
          item.id,
          item.description,
          item.unit_name,
          item.quantity,
          item.unit_cost,
          item.unit_price,
          catalog.unit_cost AS catalog_unit_cost,
          ${CATALOG_PRICE_SQL} AS catalog_unit_price
        FROM public.budget_items AS item
        JOIN public.effective_platform_catalog_prices AS catalog
          ON catalog.id = item.platform_catalog_item_id
         AND catalog.active = true
        WHERE item.budget_id = $1
          AND item.company_id = $2
          AND (
            abs(item.unit_cost - catalog.unit_cost) >= 0.005
            OR abs(item.unit_price - ${CATALOG_PRICE_SQL}) >= 0.005
          )
        ORDER BY item.sort_order ASC, item.created_at ASC
      `,
      [budgetId, companyId]
    );

    return {
      status: budget.rows[0].status as string,
      updates: result.rows.map((row) => {
        const quantity = Number(row.quantity ?? 0);
        const unitPrice = Number(row.unit_price ?? 0);
        const catalogUnitPrice = Number(row.catalog_unit_price ?? 0);
        return {
          itemId: row.id as string,
          description: row.description as string,
          unitName: row.unit_name as string,
          quantity,
          unitCost: Number(row.unit_cost ?? 0),
          unitPrice,
          catalogUnitCost: Number(row.catalog_unit_cost ?? 0),
          catalogUnitPrice,
          priceDifference: Math.round((catalogUnitPrice - unitPrice) * quantity * 100) / 100
        };
      })
    };
  });
}

export class BudgetNotDraftError extends Error {
  constructor() {
    super("Solo se pueden actualizar precios en presupuestos en borrador.");
  }
}

export async function applyBudgetPriceUpdatesRepo(
  userId: string,
  budgetId: string,
  companyId: string,
  itemIds: string[]
) {
  return withUserTransaction(userId, async (client) => {
    const budget = await client.query(
      `SELECT status, version FROM public.budgets WHERE id = $1 AND company_id = $2 LIMIT 1 FOR UPDATE`,
      [budgetId, companyId]
    );

    if (budget.rowCount === 0) {
      return null;
    }

    if (budget.rows[0].status !== "draft") {
      throw new BudgetNotDraftError();
    }

    const result = await client.query(
      `
        UPDATE public.budget_items AS item
        SET
          unit_cost = catalog.unit_cost,
          unit_price = ${CATALOG_PRICE_SQL},
          updated_at = now()
        FROM public.effective_platform_catalog_prices AS catalog
        WHERE catalog.id = item.platform_catalog_item_id
          AND catalog.active = true
          AND item.budget_id = $1
          AND item.company_id = $2
          AND item.id = ANY($3::uuid[])
        RETURNING item.id
      `,
      [budgetId, companyId, itemIds]
    );

    if ((result.rowCount ?? 0) > 0) {
      await client.query(
        `
          INSERT INTO public.budget_change_history (company_id, budget_id, version, action, performed_by, notes)
          VALUES ($1, $2, $3, 'prices_refreshed', app.current_user_id(), $4)
        `,
        [
          companyId,
          budgetId,
          budget.rows[0].version ?? 1,
          `Precios actualizados desde el catálogo en ${result.rowCount} partida(s)`
        ]
      );
    }

    return { updatedCount: result.rowCount ?? 0 };
  });
}
