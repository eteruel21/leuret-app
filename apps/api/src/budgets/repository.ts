import { withUserTransaction } from "../db/with-user-transaction.js";
import type { z } from "zod";
import type { createBudgetItemSchema, updateBudgetItemSchema, updateBudgetSchema } from "./schemas.js";

export type CreateBudgetItemInput = z.infer<typeof createBudgetItemSchema>;
export type UpdateBudgetItemInput = z.infer<typeof updateBudgetItemSchema>;
export type UpdateBudgetInput = z.infer<typeof updateBudgetSchema>;

const clientBudgetColumns = `
  budget.id, budget.company_id, budget.client_id, budget.project_id, budget.budget_number,
  budget.version, budget.title, budget.description, budget.status, budget.currency_code,
  budget.subtotal, budget.discount_type, budget.discount_value, budget.discount_amount,
  budget.tax_rate, budget.tax_amount, budget.total, budget.valid_until, budget.terms,
  budget.approved_at, budget.rejection_reason, budget.created_at, budget.updated_at
`;

export async function findClientBudgets(userId: string) {
  return withUserTransaction(userId, async (client) => {
    const result = await client.query(`
      SELECT
        ${clientBudgetColumns},
        CASE
          WHEN project.id IS NULL THEN NULL
          ELSE jsonb_build_object('name', project.name)
        END AS project,
        CASE
          WHEN company.id IS NULL THEN NULL
          ELSE jsonb_build_object('id', company.id, 'name', company.name, 'currency_code', company.currency_code)
        END AS company
      FROM public.budgets AS budget
      JOIN public.clients AS customer
        ON customer.id = budget.client_id
       AND customer.company_id = budget.company_id
      LEFT JOIN public.projects AS project ON project.id = budget.project_id
      JOIN public.companies AS company ON company.id = budget.company_id AND company.active
      WHERE customer.user_id = app.current_user_id()
        AND customer.active = true
        -- Defensa adicional a la RLS: el cliente nunca ve borradores ni anulados,
        -- aunque además sea miembro de la empresa.
        AND budget.status IN ('sent', 'viewed', 'approved', 'rejected', 'expired')
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
          ${clientBudgetColumns},
          CASE
            WHEN project.id IS NULL THEN NULL
            ELSE jsonb_build_object('name', project.name, 'code', project.project_code)
          END AS project,
          CASE
            WHEN company.id IS NULL THEN NULL
            ELSE jsonb_build_object(
              'id', company.id,
              'name', company.name,
              'legal_name', company.legal_name,
              'tax_id', company.tax_id,
              'phone', company.phone,
              'email', company.email,
              'address', company.address,
              'logo_url', company.logo_url,
              'currency_code', company.currency_code,
              'timezone', company.timezone
            )
          END AS company,
          jsonb_build_object(
            'id', customer.id,
            'client_type', customer.client_type,
            'first_name', customer.first_name,
            'last_name', customer.last_name,
            'business_name', customer.business_name,
            'email', customer.email,
            'phone', customer.phone
          ) AS client
        FROM public.budgets AS budget
        JOIN public.clients AS customer
          ON customer.id = budget.client_id
         AND customer.company_id = budget.company_id
        LEFT JOIN public.projects AS project ON project.id = budget.project_id
        JOIN public.companies AS company ON company.id = budget.company_id AND company.active
        WHERE budget.id = $1
          AND customer.user_id = app.current_user_id()
          AND customer.active = true
          AND budget.status IN ('sent', 'viewed', 'approved', 'rejected', 'expired')
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

    // El cliente ve precios de venta, nunca costos internos ni el desglose de
    // materiales (que trae costos).
    const itemsResult = await client.query(
      `
        SELECT
          id,
          company_id,
          budget_id,
          section_id,
          item_type,
          description,
          unit_name,
          quantity,
          unit_price,
          discount_percentage,
          subtotal,
          taxable,
          sort_order,
          notes,
          created_at,
          updated_at
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

/** Partidas de un presupuesto aprobado o cancelado: no se pueden agregar ni quitar. */
export class BudgetLockedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BudgetLockedError";
  }
}

const LOCKED_ITEM_MESSAGES: Record<string, string> = {
  approved: "El presupuesto está aprobado y bloqueado. No se puede modificar.",
  cancelled: "El presupuesto está cancelado. No se puede modificar.",
};

/**
 * Solo los borradores aceptan cambios en sus partidas. Un presupuesto enviado,
 * visto, rechazado o vencido se edita con «Editar» (reopen), que lo devuelve a
 * borrador con una versión nueva para que el cliente no vea cambios sin aviso.
 */
async function checkBudgetIsDraft(client: any, budgetId: string) {
  const check = await client.query(
    `SELECT status FROM public.budgets WHERE id = $1 LIMIT 1`,
    [budgetId]
  );
  const status: string | undefined = check.rows[0]?.status;
  if (!status || status === "draft") return;
  throw new BudgetLockedError(
    LOCKED_ITEM_MESSAGES[status] ??
      "El presupuesto ya fue enviado. Usa «Editar presupuesto» para volverlo a borrador y modificarlo."
  );
}

export async function addBudgetItemRepo(userId: string, budgetId: string, input: CreateBudgetItemInput) {
  return withUserTransaction(userId, async (client) => {
    await checkBudgetIsDraft(client, budgetId);

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
    await checkBudgetIsDraft(client, budgetId);

    const deleted = await client.query<{ description: string }>(
      `
        DELETE FROM public.budget_items
        WHERE id = $1
          AND budget_id = $2
          AND company_id = $3
        RETURNING description
      `,
      [itemId, budgetId, companyId]
    );

    if ((deleted.rowCount ?? 0) === 0) return false;

    // La versión es la del presupuesto (antes quedaba siempre en 1).
    await client.query(
      `
        INSERT INTO public.budget_change_history (company_id, budget_id, version, action, performed_by, notes)
        SELECT company_id, id, version, 'item_deleted', app.current_user_id(), $3
        FROM public.budgets WHERE id = $1 AND company_id = $2
      `,
      [budgetId, companyId, `Partida eliminada: ${deleted.rows[0]?.description ?? ""}`.trim()]
    );
    return true;
  });
}

/**
 * Edita una partida de un borrador. Los totales del presupuesto se recalculan
 * con los disparadores de budget_items (subtotal y totales).
 */
export async function updateBudgetItemRepo(
  userId: string,
  budgetId: string,
  itemId: string,
  input: UpdateBudgetItemInput
) {
  return withUserTransaction(userId, async (client) => {
    await checkBudgetIsDraft(client, budgetId);

    const result = await client.query(
      `
        UPDATE public.budget_items
        SET
          description = COALESCE($4, description),
          unit_name = COALESCE($5, unit_name),
          quantity = COALESCE($6, quantity),
          unit_price = COALESCE($7, unit_price),
          unit_cost = COALESCE($8, unit_cost),
          discount_percentage = COALESCE($9, discount_percentage),
          taxable = COALESCE($10, taxable),
          notes = CASE WHEN $11::text IS NULL THEN notes ELSE NULLIF($11::text, '') END,
          updated_at = now()
        WHERE id = $1
          AND budget_id = $2
          AND company_id = $3
        RETURNING *
      `,
      [
        itemId,
        budgetId,
        input.companyId,
        input.description ?? null,
        input.unitName ?? null,
        input.quantity ?? null,
        input.unitPrice ?? null,
        input.unitCost ?? null,
        input.discountPercentage ?? null,
        input.taxable ?? null,
        input.notes ?? null
      ]
    );

    const item = result.rows[0] ?? null;
    if (item) {
      await client.query(
        `
          INSERT INTO public.budget_change_history (company_id, budget_id, version, action, performed_by, notes)
          SELECT company_id, id, version, 'item_updated', app.current_user_id(), $3
          FROM public.budgets WHERE id = $1 AND company_id = $2
        `,
        [budgetId, input.companyId, `Partida editada: ${item.description}`]
      );
    }
    return item;
  });
}

/**
 * Datos generales de un borrador. Al cambiar el descuento o el ITBMS se
 * recalculan los totales tocando las partidas: el disparador de budget_items
 * llama a recalculate_budget_totals (que la API no puede ejecutar directo).
 */
export async function updateBudgetRepo(userId: string, budgetId: string, input: UpdateBudgetInput) {
  return withUserTransaction(userId, async (client) => {
    await checkBudgetIsDraft(client, budgetId);

    const result = await client.query(
      `
        UPDATE public.budgets
        SET
          title = COALESCE($3, title),
          description = CASE WHEN $4::text IS NULL THEN description ELSE NULLIF($4::text, '') END,
          discount_type = COALESCE($5::public.budget_discount_type, discount_type),
          discount_value = CASE
            WHEN COALESCE($5::public.budget_discount_type, discount_type) = 'none'::public.budget_discount_type THEN 0
            ELSE COALESCE($6::numeric, discount_value)
          END,
          tax_rate = COALESCE($7::numeric, tax_rate),
          terms = CASE WHEN $8::text IS NULL THEN terms ELSE NULLIF($8::text, '') END,
          notes = CASE WHEN $9::text IS NULL THEN notes ELSE NULLIF($9::text, '') END,
          updated_at = now()
        WHERE id = $1
          AND company_id = $2
        RETURNING id, version
      `,
      [
        budgetId,
        input.companyId,
        input.title ?? null,
        input.description ?? null,
        input.discountType ?? null,
        input.discountValue ?? null,
        input.taxRate ?? null,
        input.terms ?? null,
        input.notes ?? null
      ]
    );

    if ((result.rowCount ?? 0) === 0) return false;

    await client.query(
      `
        UPDATE public.budget_items
        SET updated_at = now()
        WHERE budget_id = $1 AND company_id = $2
      `,
      [budgetId, input.companyId]
    );

    await client.query(
      `
        INSERT INTO public.budget_change_history (company_id, budget_id, version, action, performed_by, notes)
        VALUES ($1, $2, $3, 'details_updated', app.current_user_id(), 'Datos del presupuesto actualizados')
      `,
      [input.companyId, budgetId, result.rows[0].version ?? 1]
    );
    return true;
  });
}

/** Errores al registrar la respuesta del cliente desde el equipo. */
export class BudgetDecisionError extends Error {
  constructor(
    readonly status: 400 | 403 | 404 | 409,
    message: string
  ) {
    super(message);
    this.name = "BudgetDecisionError";
  }
}

const DECISION_ROLES = new Set(["owner", "admin", "estimator", "sales"]);

/**
 * Comprueba que quien registra la respuesta del cliente pueda hacerlo y que
 * el presupuesto esté esperando respuesta (enviado o visto). Bloquea la fila.
 */
async function lockBudgetForTeamDecision(client: any, budgetId: string, companyId: string | undefined) {
  if (!companyId) {
    throw new BudgetDecisionError(400, "Indica la empresa del presupuesto.");
  }

  const role = await client.query(
    `
      SELECT role::text AS role
      FROM public.company_members
      WHERE company_id = $1 AND user_id = app.current_user_id() AND active = true
      LIMIT 1
    `,
    [companyId]
  );
  if (!DECISION_ROLES.has(role.rows[0]?.role)) {
    throw new BudgetDecisionError(403, "Tu rol no puede registrar la respuesta del cliente.");
  }

  const budgetRes = await client.query(
    `SELECT * FROM public.budgets WHERE id = $1 AND company_id = $2 LIMIT 1 FOR UPDATE`,
    [budgetId, companyId]
  );
  const budget = budgetRes.rows[0];
  if (!budget) {
    throw new BudgetDecisionError(404, "No se encontró el presupuesto.");
  }
  return budget;
}

/**
 * El equipo registra que el cliente aprobó el presupuesto (por ejemplo, un
 * cliente sin cuenta en Leuret que respondió por WhatsApp o en persona).
 */
export async function approveBudgetRepo(userId: string, budgetId: string, companyId?: string) {
  return withUserTransaction(userId, async (client) => {
    const currentBudget = await lockBudgetForTeamDecision(client, budgetId, companyId);

    if (currentBudget.status === "approved") {
      return currentBudget;
    }

    if (currentBudget.status !== "sent" && currentBudget.status !== "viewed") {
      throw new BudgetDecisionError(
        409,
        currentBudget.status === "draft"
          ? "Envía el presupuesto antes de registrar la aprobación del cliente."
          : "Este presupuesto ya no espera respuesta del cliente."
      );
    }

    const updateRes = await client.query(
      `
        UPDATE public.budgets
        SET status = 'approved',
            approved_at = NOW(),
            approved_by = app.current_user_id(),
            rejection_reason = NULL,
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
        VALUES ($1, $2, $3, 'approved', app.current_user_id(), 'Aprobación del cliente registrada por la empresa', $4)
      `,
      [approvedBudget.company_id, budgetId, approvedBudget.version, JSON.stringify(snapshot)]
    );

    return approvedBudget;
  });
}

export async function rejectBudgetRepo(userId: string, budgetId: string, rejectionReason: string, companyId?: string) {
  return withUserTransaction(userId, async (client) => {
    const currentBudget = await lockBudgetForTeamDecision(client, budgetId, companyId);

    if (currentBudget.status === "approved") {
      throw new BudgetDecisionError(409, "El presupuesto ya está aprobado y no se puede rechazar.");
    }

    if (currentBudget.status !== "sent" && currentBudget.status !== "viewed") {
      throw new BudgetDecisionError(
        409,
        currentBudget.status === "draft"
          ? "Envía el presupuesto antes de registrar la respuesta del cliente."
          : "Este presupuesto ya no espera respuesta del cliente."
      );
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
      [rejectedBudget.company_id, budgetId, rejectedBudget.version, `Rechazo del cliente registrado por la empresa. Motivo: ${rejectionReason}`]
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
        JOIN public.companies AS company ON company.id = budget.company_id AND company.active
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

export class BudgetSendError extends Error {
  constructor(
    readonly code: "not_found" | "not_draft" | "empty" | "invalid_validity",
    message: string
  ) {
    super(message);
  }
}

/**
 * Envía un borrador al cliente: pasa a "sent", fija la vigencia y deja
 * constancia en el historial. Devuelve también el usuario vinculado del
 * cliente (si tiene cuenta) para avisarle.
 */
export async function sendBudgetRepo(
  userId: string,
  budgetId: string,
  companyId: string,
  validUntil?: string | null
) {
  return withUserTransaction(userId, async (client) => {
    const current = await client.query<{
      status: string;
      version: number;
      valid_until: string | null;
      item_count: number;
      client_user_id: string | null;
    }>(
      `
        SELECT
          budget.status,
          budget.version,
          budget.valid_until::text AS valid_until,
          (SELECT count(*)::int FROM public.budget_items AS item WHERE item.budget_id = budget.id) AS item_count,
          customer.user_id AS client_user_id
        FROM public.budgets AS budget
        LEFT JOIN public.clients AS customer
          ON customer.id = budget.client_id
         AND customer.company_id = budget.company_id
         AND customer.active = true
        WHERE budget.id = $1 AND budget.company_id = $2
        LIMIT 1
        FOR UPDATE OF budget
      `,
      [budgetId, companyId]
    );

    const row = current.rows[0];
    if (!row) throw new BudgetSendError("not_found", "No se encontró el presupuesto.");
    if (row.status !== "draft") {
      throw new BudgetSendError("not_draft", "Solo se pueden enviar presupuestos en borrador.");
    }
    if (row.item_count === 0) {
      throw new BudgetSendError("empty", "Agrega al menos una partida antes de enviarlo.");
    }

    const today = new Date().toISOString().slice(0, 10);
    const effectiveValidUntil = validUntil ?? row.valid_until;
    if (effectiveValidUntil && effectiveValidUntil.slice(0, 10) < today) {
      throw new BudgetSendError("invalid_validity", "La fecha de vigencia ya pasó.");
    }

    const updated = await client.query(
      `
        UPDATE public.budgets
        SET status = 'sent',
            valid_until = COALESCE($3::date, valid_until),
            updated_at = now()
        WHERE id = $1 AND company_id = $2
        RETURNING *
      `,
      [budgetId, companyId, validUntil ?? null]
    );

    await client.query(
      `
        INSERT INTO public.budget_change_history (company_id, budget_id, version, action, performed_by, notes)
        VALUES ($1, $2, $3, 'sent', app.current_user_id(), 'Presupuesto enviado al cliente')
      `,
      [companyId, budgetId, row.version]
    );

    return {
      budget: updated.rows[0],
      clientUserId: row.client_user_id
    };
  });
}

export class BudgetReopenError extends Error {
  constructor(
    readonly code: "not_found" | "not_reopenable",
    message: string
  ) {
    super(message);
    this.name = "BudgetReopenError";
  }
}

/** Estados desde los que se puede volver a borrador para editar. */
export const REOPENABLE_BUDGET_STATUSES = ["sent", "viewed", "rejected", "expired"] as const;

/**
 * Vuelve a borrador un presupuesto enviado, visto, rechazado o vencido para
 * editarlo. Guarda la versión que vio el cliente en budget_versions, sube la
 * versión y deja constancia en el historial. El cliente deja de verlo hasta
 * que se reenvíe.
 */
export async function reopenBudgetRepo(userId: string, budgetId: string, companyId: string) {
  return withUserTransaction(userId, async (client) => {
    const current = await client.query(
      `SELECT * FROM public.budgets WHERE id = $1 AND company_id = $2 LIMIT 1 FOR UPDATE`,
      [budgetId, companyId]
    );

    const budget = current.rows[0];
    if (!budget) throw new BudgetReopenError("not_found", "No se encontró el presupuesto.");
    if (!(REOPENABLE_BUDGET_STATUSES as readonly string[]).includes(budget.status)) {
      throw new BudgetReopenError(
        "not_reopenable",
        budget.status === "draft"
          ? "El presupuesto ya está en borrador."
          : "Un presupuesto aprobado o cancelado no se puede editar."
      );
    }

    const items = await client.query(
      `SELECT * FROM public.budget_items WHERE budget_id = $1 ORDER BY sort_order ASC`,
      [budgetId]
    );
    const snapshot = JSON.stringify({ budget, items: items.rows });

    await client.query(
      `
        INSERT INTO public.budget_versions (company_id, budget_id, version_number, snapshot_data, created_by)
        VALUES ($1, $2, $3, $4, app.current_user_id())
      `,
      [companyId, budgetId, budget.version, snapshot]
    );

    const updated = await client.query(
      `
        UPDATE public.budgets
        SET status = 'draft',
            version = version + 1,
            rejection_reason = NULL,
            updated_at = now()
        WHERE id = $1 AND company_id = $2
        RETURNING *
      `,
      [budgetId, companyId]
    );

    const reopened = updated.rows[0];

    await client.query(
      `
        INSERT INTO public.budget_change_history (company_id, budget_id, version, action, performed_by, notes, snapshot)
        VALUES ($1, $2, $3, 'reopened', app.current_user_id(), $4, $5)
      `,
      [
        companyId,
        budgetId,
        reopened.version,
        `Vuelto a borrador para editar (antes: ${budget.status}, versión ${budget.version}).`,
        snapshot
      ]
    );

    return reopened;
  });
}
