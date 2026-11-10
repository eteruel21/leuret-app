import { withUserTransaction } from "../db/with-user-transaction.js";

// Consultas del portal del cliente. Todas corren como el usuario autenticado,
// así que la RLS (migración 037 y las políticas *_for_linked_client) decide
// qué filas ve. Las consultas además filtran por el vínculo del cliente y
// solo devuelven columnas de cara al cliente (sin costos ni notas internas).

/** Vínculo activo del usuario como cliente con una empresa. */
const linkedCustomerJoin = `
  JOIN public.clients AS customer
    ON customer.id = invoice.client_id
   AND customer.company_id = invoice.company_id
   AND customer.user_id = app.current_user_id()
   AND customer.active = true
`;

const clientInvoiceSql = `
  SELECT
    invoice.id,
    invoice.company_id,
    invoice.invoice_number,
    invoice.status,
    invoice.issue_date,
    invoice.due_date,
    invoice.issued_at,
    invoice.snapshot_data,
    invoice.created_at,
    jsonb_build_object(
      'id', company.id,
      'name', company.name,
      'phone', company.phone,
      'email', company.email,
      'address', company.address,
      'logo_url', company.logo_url,
      'timezone', company.timezone,
      'payment_instructions', company.payment_instructions
    ) AS company,
    invoice.snapshot_data #>> '{source,projectId}' AS project_id,
    COALESCE(invoice.snapshot_data ->> 'currency', company.currency_code) AS currency_code,
    (invoice.snapshot_data #>> '{totals,total}')::double precision AS total_amount,
    GREATEST(
      COALESCE((invoice.snapshot_data #>> '{totals,total}')::numeric, 0) - credit_summary.total_credit,
      0
    )::double precision AS adjusted_total_amount,
    payment_summary.total_paid::double precision AS total_paid,
    credit_summary.total_credit::double precision AS total_credit,
    CASE
      WHEN invoice.status = 'cancelled'::public.invoice_status THEN 0
      ELSE GREATEST(
        COALESCE((invoice.snapshot_data #>> '{totals,total}')::numeric, 0)
          - credit_summary.total_credit
          - payment_summary.total_paid,
        0
      )
    END::double precision AS balance_due,
    (
      invoice.status <> 'cancelled'::public.invoice_status
      AND invoice.status <> 'paid'::public.invoice_status
      AND (
        invoice.status = 'overdue'::public.invoice_status
        OR (
          invoice.due_date IS NOT NULL
          AND invoice.due_date < (now() AT TIME ZONE COALESCE(company.timezone, 'America/Panama'))::date
        )
      )
    ) AS is_overdue
  FROM public.invoices AS invoice
  ${linkedCustomerJoin}
  JOIN public.companies AS company ON company.id = invoice.company_id
  LEFT JOIN LATERAL (
    SELECT COALESCE(sum(payment.amount), 0) AS total_paid
    FROM public.invoice_payments AS payment
    WHERE payment.invoice_id = invoice.id
      AND payment.company_id = invoice.company_id
      AND payment.status = 'confirmed'::public.invoice_payment_status
  ) AS payment_summary ON true
  LEFT JOIN LATERAL (
    SELECT COALESCE(sum(credit_note.amount), 0) AS total_credit
    FROM public.invoice_credit_notes AS credit_note
    WHERE credit_note.invoice_id = invoice.id
      AND credit_note.company_id = invoice.company_id
      AND credit_note.status = 'issued'::public.invoice_credit_note_status
  ) AS credit_summary ON true
  WHERE invoice.status <> 'draft'::public.invoice_status
`;

export async function findClientInvoicesRepo(userId: string) {
  return withUserTransaction(userId, async (client) => {
    const result = await client.query(
      `${clientInvoiceSql}
       ORDER BY invoice.issue_date DESC NULLS LAST, invoice.created_at DESC`
    );
    return result.rows;
  });
}

export async function getClientInvoiceDetailRepo(userId: string, invoiceId: string) {
  return withUserTransaction(userId, async (client) => {
    const invoiceResult = await client.query(
      `${clientInvoiceSql}
       AND invoice.id = $1
       LIMIT 1`,
      [invoiceId]
    );
    const invoice = invoiceResult.rows[0];
    if (!invoice) return null;

    const paymentsResult = await client.query(
      `
        SELECT
          payment.id,
          payment.invoice_id,
          payment.payment_number,
          payment.receipt_number,
          payment.status,
          payment.method,
          payment.amount::double precision AS amount,
          payment.currency_code,
          payment.paid_at,
          payment.reference,
          payment.receipt_schema_version,
          payment.receipt_snapshot_data,
          payment.reversed_at,
          payment.created_at
        FROM public.invoice_payments AS payment
        WHERE payment.invoice_id = $1
          AND payment.company_id = $2
        ORDER BY payment.paid_at DESC, payment.created_at DESC
      `,
      [invoice.id, invoice.company_id]
    );

    const creditNotesResult = await client.query(
      `
        SELECT
          credit_note.id,
          credit_note.credit_note_number,
          credit_note.status,
          credit_note.amount::double precision AS amount,
          credit_note.currency_code,
          credit_note.reason,
          credit_note.issued_at
        FROM public.invoice_credit_notes AS credit_note
        WHERE credit_note.invoice_id = $1
          AND credit_note.company_id = $2
          AND credit_note.status = 'issued'::public.invoice_credit_note_status
        ORDER BY credit_note.issued_at DESC
      `,
      [invoice.id, invoice.company_id]
    );

    return {
      ...invoice,
      payments: paymentsResult.rows,
      credit_notes: creditNotesResult.rows
    };
  });
}

export async function getClientProjectDetailRepo(userId: string, projectId: string) {
  return withUserTransaction(userId, async (client) => {
    const projectResult = await client.query(
      `
        SELECT
          project.id,
          project.company_id,
          project.project_code,
          project.name,
          project.description,
          project.status,
          project.start_date,
          project.estimated_end_date,
          project.actual_end_date,
          project.progress_percentage::double precision AS progress_percentage,
          project.created_at,
          project.updated_at,
          jsonb_build_object(
            'id', company.id,
            'name', company.name,
            'phone', company.phone,
            'email', company.email,
            'address', company.address,
            'logo_url', company.logo_url,
            'currency_code', company.currency_code,
            'timezone', company.timezone
          ) AS company
        FROM public.projects AS project
        JOIN public.clients AS customer
          ON customer.id = project.client_id
         AND customer.company_id = project.company_id
         AND customer.user_id = app.current_user_id()
         AND customer.active = true
        JOIN public.companies AS company ON company.id = project.company_id
        WHERE project.id = $1
          AND company.active = true
        LIMIT 1
      `,
      [projectId]
    );

    const project = projectResult.rows[0];
    if (!project) return null;

    // Secuencial a propósito: todas comparten la misma conexión y transacción.
    const progress = await client.query(
        `
          SELECT
            id,
            progress_percentage::double precision AS progress_percentage,
            previous_percentage::double precision AS previous_percentage,
            notes,
            created_at
          FROM public.project_progress_history
          WHERE project_id = $1 AND company_id = $2
          ORDER BY created_at DESC
          LIMIT 50
        `,
        [project.id, project.company_id]
    );
    const photos = await client.query(
        `
          SELECT id, storage_path, caption, created_at
          FROM public.project_photos
          WHERE project_id = $1 AND company_id = $2 AND is_private = false
          ORDER BY created_at DESC
          LIMIT 60
        `,
        [project.id, project.company_id]
    );
    const activities = await client.query(
        `
          SELECT id, title, type, status, date, start_time, end_time, address
          FROM public.activities
          WHERE project_id = $1
            AND company_id = $2
            AND status <> 'cancelled'
          ORDER BY date ASC, start_time ASC
          LIMIT 50
        `,
        [project.id, project.company_id]
    );
    const budgets = await client.query(
        `
          SELECT
            id,
            budget_number,
            title,
            status,
            total::double precision AS total,
            currency_code,
            valid_until,
            created_at
          FROM public.budgets
          WHERE project_id = $1
            AND company_id = $2
            AND status NOT IN ('draft', 'cancelled')
          ORDER BY created_at DESC
        `,
        [project.id, project.company_id]
    );
    const invoices = await client.query(
        `${clientInvoiceSql}
         AND invoice.company_id = $2
         AND invoice.snapshot_data #>> '{source,projectId}' = $1::text
         ORDER BY invoice.issue_date DESC NULLS LAST`,
        [project.id, project.company_id]
    );

    return {
      ...project,
      progress_history: progress.rows,
      photos: photos.rows,
      activities: activities.rows,
      budgets: budgets.rows,
      invoices: invoices.rows
    };
  });
}

export async function findClientUpcomingActivitiesRepo(userId: string) {
  return withUserTransaction(userId, async (client) => {
    const result = await client.query(
      `
        SELECT
          activity.id,
          activity.title,
          activity.type,
          activity.status,
          activity.date,
          activity.start_time,
          activity.end_time,
          activity.address,
          activity.project_id,
          project.name AS project_name,
          jsonb_build_object('id', company.id, 'name', company.name, 'phone', company.phone) AS company
        FROM public.activities AS activity
        JOIN public.companies AS company ON company.id = activity.company_id
        LEFT JOIN public.projects AS project ON project.id = activity.project_id
        WHERE activity.status <> 'cancelled'
          AND activity.date >= to_char(
            (now() AT TIME ZONE COALESCE(company.timezone, 'America/Panama'))::date,
            'YYYY-MM-DD'
          )
          AND (
            EXISTS (
              SELECT 1 FROM public.clients AS customer
              WHERE customer.id = activity.client_id
                AND customer.company_id = activity.company_id
                AND customer.user_id = app.current_user_id()
                AND customer.active = true
            )
            OR EXISTS (
              SELECT 1
              FROM public.projects AS linked_project
              JOIN public.clients AS customer
                ON customer.id = linked_project.client_id
               AND customer.company_id = linked_project.company_id
              WHERE linked_project.id = activity.project_id
                AND customer.user_id = app.current_user_id()
                AND customer.active = true
            )
          )
        ORDER BY activity.date ASC, activity.start_time ASC
        LIMIT 20
      `
    );
    return result.rows;
  });
}

export async function getClientSummaryRepo(userId: string) {
  return withUserTransaction(userId, async (client) => {
    const budgets = await client.query<{ pending_count: number }>(
      `
        SELECT count(*)::int AS pending_count
        FROM public.budgets AS budget
        JOIN public.clients AS customer
          ON customer.id = budget.client_id
         AND customer.company_id = budget.company_id
         AND customer.user_id = app.current_user_id()
         AND customer.active = true
        WHERE budget.status IN ('sent', 'viewed')
          AND (budget.valid_until IS NULL OR budget.valid_until >= CURRENT_DATE)
      `
    );

    const projects = await client.query<{ active_count: number }>(
      `
        SELECT count(*)::int AS active_count
        FROM public.projects AS project
        JOIN public.clients AS customer
          ON customer.id = project.client_id
         AND customer.company_id = project.company_id
         AND customer.user_id = app.current_user_id()
         AND customer.active = true
        WHERE project.status IN ('approved', 'in_progress', 'paused', 'inspection')
      `
    );

    const invoices = await client.query<{
      currency_code: string;
      open_count: number;
      overdue_count: number;
      balance_due: number;
    }>(
      `
        SELECT
          currency_code,
          count(*)::int AS open_count,
          count(*) FILTER (WHERE is_overdue)::int AS overdue_count,
          sum(balance_due)::double precision AS balance_due
        FROM (${clientInvoiceSql}) AS client_invoice
        WHERE balance_due > 0
        GROUP BY currency_code
        ORDER BY currency_code
      `
    );

    return {
      pending_budgets: budgets.rows[0]?.pending_count ?? 0,
      active_projects: projects.rows[0]?.active_count ?? 0,
      open_invoices: invoices.rows
    };
  });
}
