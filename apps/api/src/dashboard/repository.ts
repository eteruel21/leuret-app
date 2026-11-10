import { withUserTransaction } from "../db/with-user-transaction.js";

/**
 * Indicadores del inicio del dueño. Todo se calcula en la zona horaria de la
 * empresa para que "este mes" y "vencido" coincidan con su calendario.
 * Las cifras respetan RLS porque corren con la identidad del usuario.
 */
const dashboardSql = `
  WITH company AS (
    SELECT id, timezone, currency_code
    FROM public.companies
    WHERE id = $1
  ),
  bounds AS (
    SELECT
      company.id AS company_id,
      company.timezone,
      (now() AT TIME ZONE company.timezone)::date AS today,
      date_trunc('month', now() AT TIME ZONE company.timezone) AS month_start,
      date_trunc('month', now() AT TIME ZONE company.timezone) - interval '1 month' AS prev_month_start
    FROM company
  ),
  payments AS (
    SELECT
      COALESCE(sum(payment.amount) FILTER (
        WHERE (payment.paid_at AT TIME ZONE bounds.timezone) >= bounds.month_start
      ), 0) AS collected_this_month,
      COALESCE(sum(payment.amount) FILTER (
        WHERE (payment.paid_at AT TIME ZONE bounds.timezone) >= bounds.prev_month_start
          AND (payment.paid_at AT TIME ZONE bounds.timezone) < bounds.month_start
      ), 0) AS collected_last_month
    FROM bounds
    LEFT JOIN public.invoice_payments AS payment
      ON payment.company_id = bounds.company_id
      AND payment.status = 'confirmed'::public.invoice_payment_status
      AND payment.paid_at >= (bounds.prev_month_start AT TIME ZONE bounds.timezone)
  ),
  open_invoices AS (
    SELECT
      invoice.id,
      invoice.invoice_number,
      invoice.due_date,
      invoice.status,
      COALESCE(
        NULLIF(trim(concat_ws(' ', customer.first_name, customer.last_name)), ''),
        customer.business_name
      ) AS client_name,
      GREATEST(
        COALESCE((invoice.snapshot_data #>> '{totals,total}')::numeric, 0)
          - COALESCE((
            SELECT sum(credit_note.amount)
            FROM public.invoice_credit_notes AS credit_note
            WHERE credit_note.invoice_id = invoice.id
              AND credit_note.company_id = invoice.company_id
              AND credit_note.status = 'issued'::public.invoice_credit_note_status
          ), 0)
          - COALESCE((
            SELECT sum(payment.amount)
            FROM public.invoice_payments AS payment
            WHERE payment.invoice_id = invoice.id
              AND payment.company_id = invoice.company_id
              AND payment.status = 'confirmed'::public.invoice_payment_status
          ), 0),
        0
      ) AS balance_due
    FROM public.invoices AS invoice
    LEFT JOIN public.clients AS customer ON customer.id = invoice.client_id
    WHERE invoice.company_id = $1
      AND invoice.status IN ('issued', 'partially_paid', 'overdue')
  ),
  receivables AS (
    SELECT
      COALESCE(sum(open_invoices.balance_due), 0) AS receivable,
      count(*) FILTER (
        WHERE open_invoices.balance_due > 0
          AND (open_invoices.status = 'overdue' OR open_invoices.due_date < bounds.today)
      ) AS overdue_count,
      COALESCE(sum(open_invoices.balance_due) FILTER (
        WHERE open_invoices.status = 'overdue' OR open_invoices.due_date < bounds.today
      ), 0) AS overdue_amount
    FROM bounds
    LEFT JOIN open_invoices ON true
  ),
  overdue_list AS (
    SELECT COALESCE(jsonb_agg(item ORDER BY item.due_date ASC NULLS LAST), '[]'::jsonb) AS items
    FROM (
      SELECT
        open_invoices.id,
        open_invoices.invoice_number,
        open_invoices.client_name,
        open_invoices.due_date,
        open_invoices.balance_due::double precision AS balance_due
      FROM open_invoices, bounds
      WHERE open_invoices.balance_due > 0
        AND (open_invoices.status = 'overdue' OR open_invoices.due_date < bounds.today)
      ORDER BY open_invoices.due_date ASC NULLS LAST
      LIMIT 5
    ) AS item
  ),
  budget_stats AS (
    SELECT
      count(*) FILTER (WHERE budget.status = 'draft') AS draft_count,
      count(*) FILTER (WHERE budget.status IN ('sent', 'viewed')) AS awaiting_count,
      COALESCE(sum(budget.total) FILTER (WHERE budget.status IN ('sent', 'viewed')), 0) AS awaiting_amount,
      count(*) FILTER (
        WHERE budget.status IN ('sent', 'viewed')
          AND budget.valid_until IS NOT NULL
          AND budget.valid_until BETWEEN bounds.today AND bounds.today + 7
      ) AS expiring_soon_count,
      count(*) FILTER (
        WHERE budget.status = 'approved'
          AND (budget.approved_at AT TIME ZONE bounds.timezone) >= bounds.month_start
      ) AS approved_this_month_count,
      COALESCE(sum(budget.total) FILTER (
        WHERE budget.status = 'approved'
          AND (budget.approved_at AT TIME ZONE bounds.timezone) >= bounds.month_start
      ), 0) AS approved_this_month_amount
    FROM bounds
    LEFT JOIN public.budgets AS budget ON budget.company_id = bounds.company_id
  ),
  project_stats AS (
    SELECT
      count(*) FILTER (WHERE project.status IN ('approved', 'in_progress')) AS active_count,
      count(*) FILTER (
        WHERE project.status NOT IN ('completed', 'cancelled')
          AND project.estimated_end_date IS NOT NULL
          AND project.estimated_end_date < bounds.today
      ) AS late_count
    FROM bounds
    LEFT JOIN public.projects AS project ON project.company_id = bounds.company_id
  ),
  late_projects AS (
    SELECT COALESCE(jsonb_agg(item ORDER BY item.estimated_end_date ASC), '[]'::jsonb) AS items
    FROM (
      SELECT
        project.id,
        project.name,
        project.project_code,
        project.estimated_end_date,
        project.progress_percentage::double precision AS progress_percentage
      FROM public.projects AS project, bounds
      WHERE project.company_id = $1
        AND project.status NOT IN ('completed', 'cancelled')
        AND project.estimated_end_date IS NOT NULL
        AND project.estimated_end_date < bounds.today
      ORDER BY project.estimated_end_date ASC
      LIMIT 5
    ) AS item
  ),
  task_stats AS (
    SELECT count(*) AS overdue_tasks
    FROM public.project_tasks AS task
    WHERE task.company_id = $1
      AND task.status <> 'completed'
      AND task.due_date IS NOT NULL
      AND task.due_date < now()
  )
  SELECT
    company.currency_code,
    payments.collected_this_month::double precision AS collected_this_month,
    payments.collected_last_month::double precision AS collected_last_month,
    receivables.receivable::double precision AS receivable,
    receivables.overdue_count::integer AS overdue_invoice_count,
    receivables.overdue_amount::double precision AS overdue_invoice_amount,
    overdue_list.items AS overdue_invoices,
    budget_stats.draft_count::integer AS draft_budget_count,
    budget_stats.awaiting_count::integer AS awaiting_budget_count,
    budget_stats.awaiting_amount::double precision AS awaiting_budget_amount,
    budget_stats.expiring_soon_count::integer AS expiring_budget_count,
    budget_stats.approved_this_month_count::integer AS approved_budget_count,
    budget_stats.approved_this_month_amount::double precision AS approved_budget_amount,
    project_stats.active_count::integer AS active_project_count,
    project_stats.late_count::integer AS late_project_count,
    late_projects.items AS late_projects,
    task_stats.overdue_tasks::integer AS overdue_task_count
  FROM company, payments, receivables, overdue_list, budget_stats, project_stats, late_projects, task_stats
`;

export async function findCompanyDashboardRepo(userId: string, companyId: string) {
  return withUserTransaction(userId, async (client) => {
    const result = await client.query(dashboardSql, [companyId]);
    return result.rows[0] ?? null;
  });
}
