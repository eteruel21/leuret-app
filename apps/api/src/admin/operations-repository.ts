import { withUserTransaction } from "../db/with-user-transaction.js";

/**
 * Centro de control del superadministrador: lectura de obras, presupuestos,
 * facturación, clientes y auditoría de todas las empresas. Todas las
 * consultas corren con el usuario autenticado (RLS activo); la migración 038
 * concede la lectura global solo a private.is_super_admin().
 */

export type ListFilters = {
  search?: string | undefined;
  status?: string | undefined;
  companyId?: string | undefined;
  limit: number;
  offset: number;
};

/** Convierte el texto de búsqueda en un patrón ILIKE seguro (o null). */
export function searchPattern(value: string | undefined): string | null {
  const clean = value?.trim();
  if (!clean) return null;
  return `%${clean.replace(/[\\%_]/g, (match) => `\\${match}`)}%`;
}

const clientNameSql = (alias: string) => `
  COALESCE(
    NULLIF(trim(${alias}.business_name), ''),
    NULLIF(trim(concat_ws(' ', ${alias}.first_name, ${alias}.last_name)), ''),
    ${alias}.email
  )
`;

const personNameSql = (profileAlias: string, userAlias: string) =>
  `COALESCE(NULLIF(trim(${profileAlias}.full_name), ''), ${userAlias}.email)`;

/** Totales de una factura a partir de su snapshot, pagos y notas de crédito. */
const invoiceTotalsSql = `
  LEFT JOIN LATERAL (
    SELECT COALESCE(sum(payment.amount), 0) AS total_paid, count(*) AS payment_count
    FROM public.invoice_payments AS payment
    WHERE payment.invoice_id = invoice.id
      AND payment.status = 'confirmed'::public.invoice_payment_status
  ) AS paid ON true
  LEFT JOIN LATERAL (
    SELECT COALESCE(sum(credit_note.amount), 0) AS total_credit
    FROM public.invoice_credit_notes AS credit_note
    WHERE credit_note.invoice_id = invoice.id
      AND credit_note.status = 'issued'::public.invoice_credit_note_status
  ) AS credit ON true
  LEFT JOIN LATERAL (
    SELECT
      COALESCE((invoice.snapshot_data #>> '{totals,total}')::numeric, 0) AS total,
      GREATEST(
        COALESCE((invoice.snapshot_data #>> '{totals,total}')::numeric, 0) - credit.total_credit - paid.total_paid,
        0
      ) AS balance
  ) AS amounts ON true
`;

const invoiceOpenSql = `invoice.status IN ('issued', 'partially_paid', 'overdue')`;

// ---------------------------------------------------------------- Obras

export async function listAdminProjectsRepo(userId: string, filters: ListFilters) {
  return withUserTransaction(userId, async (client) => {
    const result = await client.query(
      `
        SELECT
          project.id,
          project.name,
          project.project_code,
          project.status,
          project.progress_percentage::double precision AS progress_percentage,
          project.start_date,
          project.estimated_end_date,
          project.actual_end_date,
          project.contract_value::double precision AS contract_value,
          project.budget_estimate::double precision AS budget_estimate,
          project.created_at,
          project.updated_at,
          company.id AS company_id,
          company.name AS company_name,
          customer.id AS client_id,
          ${clientNameSql("customer")} AS client_name,
          ${personNameSql("manager_profile", "manager_user")} AS manager_name,
          COALESCE(task_stats.total, 0)::integer AS task_count,
          COALESCE(task_stats.open, 0)::integer AS open_task_count,
          COALESCE(task_stats.overdue, 0)::integer AS overdue_task_count,
          count(*) OVER()::integer AS total_count
        FROM public.projects AS project
        JOIN public.companies AS company ON company.id = project.company_id
        LEFT JOIN public.clients AS customer ON customer.id = project.client_id
        LEFT JOIN app_auth.users AS manager_user ON manager_user.id = project.project_manager_id
        LEFT JOIN public.profiles AS manager_profile ON manager_profile.id = project.project_manager_id
        LEFT JOIN LATERAL (
          SELECT
            count(*) AS total,
            count(*) FILTER (WHERE task.completed_at IS NULL AND task.status <> 'completed') AS open,
            count(*) FILTER (
              WHERE task.completed_at IS NULL AND task.status <> 'completed' AND task.due_date < now()
            ) AS overdue
          FROM public.project_tasks AS task
          WHERE task.project_id = project.id
        ) AS task_stats ON true
        WHERE ($1::text IS NULL
            OR project.name ILIKE $1
            OR project.project_code ILIKE $1
            OR company.name ILIKE $1
            OR ${clientNameSql("customer")} ILIKE $1)
          AND ($2::text IS NULL OR project.status::text = $2)
          AND ($3::uuid IS NULL OR project.company_id = $3)
        ORDER BY project.updated_at DESC
        LIMIT $4 OFFSET $5
      `,
      [searchPattern(filters.search), filters.status ?? null, filters.companyId ?? null, filters.limit, filters.offset]
    );
    return result.rows;
  });
}

export async function findAdminProjectDetailRepo(userId: string, projectId: string) {
  return withUserTransaction(userId, async (client) => {
    const project = await client.query(
      `
        SELECT
          project.*,
          project.progress_percentage::double precision AS progress_percentage,
          project.contract_value::double precision AS contract_value,
          project.budget_estimate::double precision AS budget_estimate,
          company.name AS company_name,
          ${clientNameSql("customer")} AS client_name,
          customer.email AS client_email,
          customer.phone AS client_phone,
          ${personNameSql("manager_profile", "manager_user")} AS manager_name,
          (SELECT count(*) FROM public.project_photos AS photo WHERE photo.project_id = project.id)::integer AS photo_count
        FROM public.projects AS project
        JOIN public.companies AS company ON company.id = project.company_id
        LEFT JOIN public.clients AS customer ON customer.id = project.client_id
        LEFT JOIN app_auth.users AS manager_user ON manager_user.id = project.project_manager_id
        LEFT JOIN public.profiles AS manager_profile ON manager_profile.id = project.project_manager_id
        WHERE project.id = $1
      `,
      [projectId]
    );
    if (!project.rows[0]) return null;

    const [tasks, progress, budgets, invoices, activities] = await Promise.all([
      client.query(
        `
          SELECT
            task.id, task.title, task.description, task.status, task.priority,
            task.due_date, task.completed_at, task.created_at,
            ${personNameSql("profile", "auth_user")} AS assignee_name
          FROM public.project_tasks AS task
          LEFT JOIN app_auth.users AS auth_user ON auth_user.id = task.assigned_user_id
          LEFT JOIN public.profiles AS profile ON profile.id = task.assigned_user_id
          WHERE task.project_id = $1
          ORDER BY (task.completed_at IS NOT NULL), task.due_date NULLS LAST, task.created_at DESC
          LIMIT 200
        `,
        [projectId]
      ),
      client.query(
        `
          SELECT
            history.id,
            history.progress_percentage::double precision AS progress_percentage,
            history.previous_percentage::double precision AS previous_percentage,
            history.notes,
            history.created_at,
            ${personNameSql("profile", "auth_user")} AS author_name
          FROM public.project_progress_history AS history
          LEFT JOIN app_auth.users AS auth_user ON auth_user.id = history.created_by
          LEFT JOIN public.profiles AS profile ON profile.id = history.created_by
          WHERE history.project_id = $1
          ORDER BY history.created_at DESC
          LIMIT 30
        `,
        [projectId]
      ),
      client.query(
        `
          SELECT id, budget_number, title, status, total::double precision AS total, currency_code, updated_at
          FROM public.budgets
          WHERE project_id = $1
          ORDER BY updated_at DESC
        `,
        [projectId]
      ),
      client.query(
        `
          SELECT
            invoice.id, invoice.invoice_number, invoice.status, invoice.issue_date, invoice.due_date,
            amounts.total::double precision AS total,
            amounts.balance::double precision AS balance
          FROM public.invoices AS invoice
          JOIN public.budgets AS budget ON budget.id = invoice.budget_id
          ${invoiceTotalsSql}
          WHERE budget.project_id = $1
          ORDER BY invoice.created_at DESC
        `,
        [projectId]
      ),
      client.query(
        `
          SELECT id, title, type, status, date, start_time, end_time
          FROM public.activities
          WHERE project_id = $1
          ORDER BY date DESC, start_time DESC NULLS LAST
          LIMIT 20
        `,
        [projectId]
      )
    ]);

    return {
      project: project.rows[0],
      tasks: tasks.rows,
      progress: progress.rows,
      budgets: budgets.rows,
      invoices: invoices.rows,
      activities: activities.rows
    };
  });
}

// ---------------------------------------------------------- Presupuestos

export async function listAdminBudgetsRepo(userId: string, filters: ListFilters) {
  return withUserTransaction(userId, async (client) => {
    const result = await client.query(
      `
        SELECT
          budget.id,
          budget.budget_number,
          budget.title,
          budget.status,
          budget.version,
          budget.total::double precision AS total,
          budget.currency_code,
          budget.valid_until,
          budget.approved_at,
          budget.created_at,
          budget.updated_at,
          (budget.status IN ('draft', 'sent', 'viewed') AND budget.valid_until < current_date) AS past_validity,
          company.id AS company_id,
          company.name AS company_name,
          ${clientNameSql("customer")} AS client_name,
          project.name AS project_name,
          (SELECT count(*) FROM public.budget_items AS item WHERE item.budget_id = budget.id)::integer AS item_count,
          count(*) OVER()::integer AS total_count
        FROM public.budgets AS budget
        JOIN public.companies AS company ON company.id = budget.company_id
        LEFT JOIN public.clients AS customer ON customer.id = budget.client_id
        LEFT JOIN public.projects AS project ON project.id = budget.project_id
        WHERE ($1::text IS NULL
            OR budget.budget_number ILIKE $1
            OR budget.title ILIKE $1
            OR company.name ILIKE $1
            OR project.name ILIKE $1
            OR ${clientNameSql("customer")} ILIKE $1)
          AND ($2::text IS NULL OR budget.status::text = $2)
          AND ($3::uuid IS NULL OR budget.company_id = $3)
        ORDER BY budget.updated_at DESC
        LIMIT $4 OFFSET $5
      `,
      [searchPattern(filters.search), filters.status ?? null, filters.companyId ?? null, filters.limit, filters.offset]
    );
    return result.rows;
  });
}

export async function findAdminBudgetDetailRepo(userId: string, budgetId: string) {
  return withUserTransaction(userId, async (client) => {
    const budget = await client.query(
      `
        SELECT
          budget.*,
          budget.subtotal::double precision AS subtotal,
          budget.discount_value::double precision AS discount_value,
          budget.discount_amount::double precision AS discount_amount,
          budget.tax_rate::double precision AS tax_rate,
          budget.tax_amount::double precision AS tax_amount,
          budget.total::double precision AS total,
          company.name AS company_name,
          ${clientNameSql("customer")} AS client_name,
          customer.email AS client_email,
          project.name AS project_name,
          ${personNameSql("profile", "auth_user")} AS created_by_name
        FROM public.budgets AS budget
        JOIN public.companies AS company ON company.id = budget.company_id
        LEFT JOIN public.clients AS customer ON customer.id = budget.client_id
        LEFT JOIN public.projects AS project ON project.id = budget.project_id
        LEFT JOIN app_auth.users AS auth_user ON auth_user.id = budget.created_by
        LEFT JOIN public.profiles AS profile ON profile.id = budget.created_by
        WHERE budget.id = $1
      `,
      [budgetId]
    );
    if (!budget.rows[0]) return null;

    const [items, versions, invoices] = await Promise.all([
      client.query(
        `
          SELECT
            item.id, item.item_type, item.description, item.unit_name,
            item.quantity::double precision AS quantity,
            item.unit_cost::double precision AS unit_cost,
            item.unit_price::double precision AS unit_price,
            item.discount_percentage::double precision AS discount_percentage,
            item.subtotal::double precision AS subtotal,
            item.taxable,
            section.name AS section_name
          FROM public.budget_items AS item
          LEFT JOIN public.budget_sections AS section ON section.id = item.section_id
          WHERE item.budget_id = $1
          ORDER BY section.sort_order NULLS FIRST, item.sort_order, item.created_at
          LIMIT 500
        `,
        [budgetId]
      ),
      client.query(
        `
          SELECT
            version.id, version.version_number, version.created_at,
            ${personNameSql("profile", "auth_user")} AS created_by_name
          FROM public.budget_versions AS version
          LEFT JOIN app_auth.users AS auth_user ON auth_user.id = version.created_by
          LEFT JOIN public.profiles AS profile ON profile.id = version.created_by
          WHERE version.budget_id = $1
          ORDER BY version.version_number DESC
        `,
        [budgetId]
      ),
      client.query(
        `
          SELECT
            invoice.id, invoice.invoice_number, invoice.status, invoice.issue_date, invoice.due_date,
            amounts.total::double precision AS total,
            amounts.balance::double precision AS balance
          FROM public.invoices AS invoice
          ${invoiceTotalsSql}
          WHERE invoice.budget_id = $1
          ORDER BY invoice.created_at DESC
        `,
        [budgetId]
      )
    ]);

    return { budget: budget.rows[0], items: items.rows, versions: versions.rows, invoices: invoices.rows };
  });
}

// ------------------------------------------------------------ Facturación

export async function listAdminInvoicesRepo(userId: string, filters: ListFilters) {
  return withUserTransaction(userId, async (client) => {
    const result = await client.query(
      `
        SELECT
          invoice.id,
          invoice.invoice_number,
          invoice.status,
          invoice.issue_date,
          invoice.due_date,
          invoice.issued_at,
          invoice.created_at,
          invoice.updated_at,
          COALESCE(invoice.snapshot_data ->> 'currency', company.currency_code, 'USD') AS currency_code,
          amounts.total::double precision AS total,
          paid.total_paid::double precision AS total_paid,
          credit.total_credit::double precision AS total_credit,
          amounts.balance::double precision AS balance,
          paid.payment_count::integer AS payment_count,
          (${invoiceOpenSql} AND invoice.due_date < current_date AND amounts.balance > 0) AS is_overdue,
          company.id AS company_id,
          company.name AS company_name,
          ${clientNameSql("customer")} AS client_name,
          budget.budget_number,
          count(*) OVER()::integer AS total_count
        FROM public.invoices AS invoice
        JOIN public.companies AS company ON company.id = invoice.company_id
        LEFT JOIN public.clients AS customer ON customer.id = invoice.client_id
        LEFT JOIN public.budgets AS budget ON budget.id = invoice.budget_id
        ${invoiceTotalsSql}
        WHERE ($1::text IS NULL
            OR invoice.invoice_number ILIKE $1
            OR company.name ILIKE $1
            OR budget.budget_number ILIKE $1
            OR ${clientNameSql("customer")} ILIKE $1)
          AND (
            $2::text IS NULL
            OR ($2 = 'overdue_real' AND ${invoiceOpenSql} AND invoice.due_date < current_date AND amounts.balance > 0)
            OR invoice.status::text = $2
          )
          AND ($3::uuid IS NULL OR invoice.company_id = $3)
        ORDER BY COALESCE(invoice.issued_at, invoice.created_at) DESC
        LIMIT $4 OFFSET $5
      `,
      [searchPattern(filters.search), filters.status ?? null, filters.companyId ?? null, filters.limit, filters.offset]
    );
    return result.rows;
  });
}

export async function findAdminInvoiceDetailRepo(userId: string, invoiceId: string) {
  return withUserTransaction(userId, async (client) => {
    const invoice = await client.query(
      `
        SELECT
          invoice.id, invoice.invoice_number, invoice.status, invoice.issue_date, invoice.due_date,
          invoice.notes, invoice.issued_at, invoice.created_at, invoice.updated_at,
          invoice.snapshot_data #> '{items}' AS items,
          invoice.snapshot_data #> '{totals}' AS totals,
          amounts.total::double precision AS total,
          paid.total_paid::double precision AS total_paid,
          credit.total_credit::double precision AS total_credit,
          amounts.balance::double precision AS balance,
          (${invoiceOpenSql} AND invoice.due_date < current_date AND amounts.balance > 0) AS is_overdue,
          company.id AS company_id,
          company.name AS company_name,
          ${clientNameSql("customer")} AS client_name,
          customer.email AS client_email,
          budget.id AS budget_id,
          budget.budget_number
        FROM public.invoices AS invoice
        JOIN public.companies AS company ON company.id = invoice.company_id
        LEFT JOIN public.clients AS customer ON customer.id = invoice.client_id
        LEFT JOIN public.budgets AS budget ON budget.id = invoice.budget_id
        ${invoiceTotalsSql}
        WHERE invoice.id = $1
      `,
      [invoiceId]
    );
    if (!invoice.rows[0]) return null;

    const [payments, creditNotes, history, reminders] = await Promise.all([
      client.query(
        `
          SELECT
            id, payment_number, receipt_number, status, method,
            amount::double precision AS amount, currency_code, paid_at, reference,
            reversed_at, reversal_reason
          FROM public.invoice_payments
          WHERE invoice_id = $1
          ORDER BY paid_at DESC
        `,
        [invoiceId]
      ),
      client.query(
        `
          SELECT id, credit_note_number, status, amount::double precision AS amount, reason, issued_at, cancelled_at
          FROM public.invoice_credit_notes
          WHERE invoice_id = $1
          ORDER BY issued_at DESC
        `,
        [invoiceId]
      ),
      client.query(
        `
          SELECT
            history.id, history.event_type, history.from_status, history.to_status, history.created_at,
            ${personNameSql("profile", "auth_user")} AS actor_name
          FROM public.invoice_history AS history
          LEFT JOIN app_auth.users AS auth_user ON auth_user.id = history.actor_user_id
          LEFT JOIN public.profiles AS profile ON profile.id = history.actor_user_id
          WHERE history.invoice_id = $1
          ORDER BY history.created_at DESC
          LIMIT 50
        `,
        [invoiceId]
      ),
      client.query(
        `
          SELECT id, kind, sent_to, claimed_at
          FROM public.invoice_payment_reminders
          WHERE invoice_id = $1
          ORDER BY claimed_at DESC
          LIMIT 20
        `,
        [invoiceId]
      )
    ]);

    return {
      invoice: invoice.rows[0],
      payments: payments.rows,
      creditNotes: creditNotes.rows,
      history: history.rows,
      reminders: reminders.rows
    };
  });
}

/** Resumen financiero y operativo de toda la plataforma. */
export async function getAdminOverviewRepo(userId: string) {
  return withUserTransaction(userId, async (client) => {
    const billing = await client.query(`
      SELECT
        COUNT(*) FILTER (WHERE invoice.status NOT IN ('draft', 'cancelled'))::integer AS issued_count,
        COALESCE(sum(amounts.total) FILTER (WHERE invoice.status NOT IN ('draft', 'cancelled')), 0)::double precision AS issued_total,
        COALESCE(sum(paid.total_paid), 0)::double precision AS collected_total,
        COALESCE(sum(amounts.balance) FILTER (WHERE ${invoiceOpenSql}), 0)::double precision AS outstanding_total,
        COUNT(*) FILTER (WHERE ${invoiceOpenSql} AND invoice.due_date < current_date AND amounts.balance > 0)::integer AS overdue_count,
        COALESCE(sum(amounts.balance) FILTER (
          WHERE ${invoiceOpenSql} AND invoice.due_date < current_date AND amounts.balance > 0
        ), 0)::double precision AS overdue_total,
        COUNT(*) FILTER (WHERE invoice.status = 'draft')::integer AS draft_count
      FROM public.invoices AS invoice
      ${invoiceTotalsSql}
    `);

    const monthly = await client.query(`
      SELECT
        to_char(month.month_start, 'YYYY-MM') AS month,
        COALESCE(sum(payment.amount), 0)::double precision AS collected
      FROM generate_series(
        date_trunc('month', current_date) - interval '11 months',
        date_trunc('month', current_date),
        interval '1 month'
      ) AS month(month_start)
      LEFT JOIN public.invoice_payments AS payment
        ON payment.status = 'confirmed'::public.invoice_payment_status
       AND date_trunc('month', payment.paid_at) = month.month_start
      GROUP BY month.month_start
      ORDER BY month.month_start
    `);

    const projectStatus = await client.query(`
      SELECT status::text AS status, count(*)::integer AS count
      FROM public.projects
      GROUP BY status
    `);

    const budgetStatus = await client.query(`
      SELECT status::text AS status, count(*)::integer AS count, COALESCE(sum(total), 0)::double precision AS total
      FROM public.budgets
      GROUP BY status
    `);

    const tasks = await client.query(`
      SELECT
        count(*) FILTER (WHERE completed_at IS NULL AND status <> 'completed')::integer AS open_count,
        count(*) FILTER (WHERE completed_at IS NULL AND status <> 'completed' AND due_date < now())::integer AS overdue_count
      FROM public.project_tasks
    `);

    const topCompanies = await client.query(`
      SELECT
        company.id, company.name,
        COALESCE(sum(payment.amount), 0)::double precision AS collected,
        count(DISTINCT payment.invoice_id)::integer AS paid_invoices
      FROM public.companies AS company
      JOIN public.invoice_payments AS payment
        ON payment.company_id = company.id
       AND payment.status = 'confirmed'::public.invoice_payment_status
      GROUP BY company.id, company.name
      ORDER BY collected DESC
      LIMIT 5
    `);

    return {
      billing: billing.rows[0] ?? {},
      monthly: monthly.rows,
      projectStatus: projectStatus.rows,
      budgetStatus: budgetStatus.rows,
      tasks: tasks.rows[0] ?? {},
      topCompanies: topCompanies.rows
    };
  });
}

// --------------------------------------------------------------- Clientes

export async function listAdminClientsRepo(userId: string, filters: ListFilters) {
  return withUserTransaction(userId, async (client) => {
    const result = await client.query(
      `
        SELECT
          customer.id,
          ${clientNameSql("customer")} AS display_name,
          customer.client_type,
          customer.document_type,
          customer.document_number,
          customer.email,
          customer.phone,
          customer.active,
          (customer.user_id IS NOT NULL) AS has_portal_access,
          customer.created_at,
          customer.updated_at,
          company.id AS company_id,
          company.name AS company_name,
          (SELECT count(*) FROM public.projects AS project WHERE project.client_id = customer.id)::integer AS project_count,
          (SELECT count(*) FROM public.budgets AS budget WHERE budget.client_id = customer.id)::integer AS budget_count,
          (SELECT count(*) FROM public.invoices AS invoice WHERE invoice.client_id = customer.id)::integer AS invoice_count,
          count(*) OVER()::integer AS total_count
        FROM public.clients AS customer
        JOIN public.companies AS company ON company.id = customer.company_id
        WHERE ($1::text IS NULL
            OR ${clientNameSql("customer")} ILIKE $1
            OR customer.email ILIKE $1
            OR customer.phone ILIKE $1
            OR customer.document_number ILIKE $1
            OR company.name ILIKE $1)
          AND ($2::text IS NULL
            OR ($2 = 'active' AND customer.active)
            OR ($2 = 'inactive' AND NOT customer.active)
            OR ($2 = 'portal' AND customer.user_id IS NOT NULL))
          AND ($3::uuid IS NULL OR customer.company_id = $3)
        ORDER BY customer.updated_at DESC
        LIMIT $4 OFFSET $5
      `,
      [searchPattern(filters.search), filters.status ?? null, filters.companyId ?? null, filters.limit, filters.offset]
    );
    return result.rows;
  });
}

// ------------------------------------------------------------- Auditoría

export async function listAdminAuditLogsRepo(userId: string, filters: ListFilters) {
  return withUserTransaction(userId, async (client) => {
    const result = await client.query(
      `
        SELECT
          log.id,
          log.action,
          log.target_type,
          log.target_id,
          log.metadata,
          log.created_at,
          company.id AS company_id,
          company.name AS company_name,
          ${personNameSql("profile", "auth_user")} AS actor_name,
          auth_user.email AS actor_email,
          count(*) OVER()::integer AS total_count
        FROM public.admin_audit_logs AS log
        LEFT JOIN public.companies AS company ON company.id = log.company_id
        LEFT JOIN app_auth.users AS auth_user ON auth_user.id = log.user_id
        LEFT JOIN public.profiles AS profile ON profile.id = log.user_id
        WHERE ($1::text IS NULL
            OR log.action ILIKE $1
            OR log.target_type ILIKE $1
            OR log.target_id ILIKE $1
            OR company.name ILIKE $1
            OR auth_user.email ILIKE $1
            OR profile.full_name ILIKE $1)
          AND ($2::text IS NULL OR log.action = $2)
          AND ($3::uuid IS NULL OR log.company_id = $3)
        ORDER BY log.created_at DESC
        LIMIT $4 OFFSET $5
      `,
      [searchPattern(filters.search), filters.status ?? null, filters.companyId ?? null, filters.limit, filters.offset]
    );
    return result.rows;
  });
}

export async function listAdminAuditActionsRepo(userId: string) {
  return withUserTransaction(userId, async (client) => {
    const result = await client.query(
      `SELECT action, count(*)::integer AS count FROM public.admin_audit_logs GROUP BY action ORDER BY count DESC`
    );
    return result.rows;
  });
}

// --------------------------------------------------------------- Sesiones

export async function listAdminUserSessionsRepo(userId: string, targetUserId: string) {
  return withUserTransaction(userId, async (client) => {
    const result = await client.query(
      `
        SELECT id, user_agent, host(ip_address) AS ip_address, created_at, last_used_at, expires_at
        FROM app_auth.sessions
        WHERE user_id = $1
          AND revoked_at IS NULL
          AND expires_at > now()
        ORDER BY last_used_at DESC NULLS LAST, created_at DESC
      `,
      [targetUserId]
    );
    return result.rows;
  });
}

/** Cierra todas las sesiones activas de un usuario y lo deja en la auditoría. */
export async function revokeAdminUserSessionsRepo(userId: string, targetUserId: string, reason: string) {
  return withUserTransaction(userId, async (client) => {
    const exists = await client.query(`SELECT id FROM app_auth.users WHERE id = $1`, [targetUserId]);
    if (!exists.rows[0]) return null;

    const revoked = await client.query(
      `
        UPDATE app_auth.sessions
        SET revoked_at = now()
        WHERE user_id = $1 AND revoked_at IS NULL AND expires_at > now()
        RETURNING id
      `,
      [targetUserId]
    );

    await client.query(
      `
        INSERT INTO public.admin_audit_logs (company_id, user_id, action, target_type, target_id, metadata)
        VALUES (NULL, app.current_user_id(), 'ADMIN_SESSIONS_REVOKED', 'user', $1, $2)
      `,
      [targetUserId, JSON.stringify({ reason, revokedCount: revoked.rowCount ?? 0 })]
    );

    return { revokedCount: revoked.rowCount ?? 0 };
  });
}

// --------------------------------------------------------- Búsqueda global

export async function adminGlobalSearchRepo(userId: string, query: string) {
  const pattern = searchPattern(query);
  if (!pattern) {
    return { users: [], companies: [], projects: [], budgets: [], invoices: [], clients: [] };
  }

  return withUserTransaction(userId, async (client) => {
    const users = await client.query(
      `
        SELECT auth_user.id, ${personNameSql("profile", "auth_user")} AS label, auth_user.email AS detail
        FROM app_auth.users AS auth_user
        LEFT JOIN public.profiles AS profile ON profile.id = auth_user.id
        WHERE auth_user.deleted_at IS NULL
          AND (auth_user.email ILIKE $1 OR profile.full_name ILIKE $1 OR profile.phone ILIKE $1)
        ORDER BY auth_user.created_at DESC
        LIMIT 6
      `,
      [pattern]
    );
    const companies = await client.query(
      `
        SELECT id, name AS label, COALESCE(tax_id, email) AS detail
        FROM public.companies
        WHERE name ILIKE $1 OR legal_name ILIKE $1 OR tax_id ILIKE $1 OR email ILIKE $1
        ORDER BY updated_at DESC
        LIMIT 6
      `,
      [pattern]
    );
    const projects = await client.query(
      `
        SELECT project.id, project.name AS label, concat_ws(' · ', project.project_code, company.name) AS detail
        FROM public.projects AS project
        JOIN public.companies AS company ON company.id = project.company_id
        WHERE project.name ILIKE $1 OR project.project_code ILIKE $1
        ORDER BY project.updated_at DESC
        LIMIT 6
      `,
      [pattern]
    );
    const budgets = await client.query(
      `
        SELECT budget.id, concat_ws(' · ', budget.budget_number, budget.title) AS label, company.name AS detail
        FROM public.budgets AS budget
        JOIN public.companies AS company ON company.id = budget.company_id
        WHERE budget.budget_number ILIKE $1 OR budget.title ILIKE $1
        ORDER BY budget.updated_at DESC
        LIMIT 6
      `,
      [pattern]
    );
    const invoices = await client.query(
      `
        SELECT invoice.id, COALESCE(invoice.invoice_number, 'Borrador') AS label, company.name AS detail
        FROM public.invoices AS invoice
        JOIN public.companies AS company ON company.id = invoice.company_id
        WHERE invoice.invoice_number ILIKE $1
        ORDER BY invoice.created_at DESC
        LIMIT 6
      `,
      [pattern]
    );
    const clients = await client.query(
      `
        SELECT customer.id, ${clientNameSql("customer")} AS label, company.name AS detail
        FROM public.clients AS customer
        JOIN public.companies AS company ON company.id = customer.company_id
        WHERE ${clientNameSql("customer")} ILIKE $1 OR customer.email ILIKE $1 OR customer.document_number ILIKE $1
        ORDER BY customer.updated_at DESC
        LIMIT 6
      `,
      [pattern]
    );

    return {
      users: users.rows,
      companies: companies.rows,
      projects: projects.rows,
      budgets: budgets.rows,
      invoices: invoices.rows,
      clients: clients.rows
    };
  });
}
