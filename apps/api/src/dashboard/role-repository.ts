import { withUserTransaction } from "../db/with-user-transaction.js";

/**
 * Indicadores para Ventas y Presupuestista. Ventas ve la cartera y los
 * presupuestos pendientes de la empresa (los cobra y les da seguimiento);
 * el presupuestista ve solo los presupuestos que él creó.
 */
const roleDashboardSql = `
  WITH company AS (
    SELECT id, timezone, currency_code
    FROM public.companies
    WHERE id = $1
  ),
  me AS (
    SELECT member.role::text AS role
    FROM public.company_members AS member
    WHERE member.company_id = $1
      AND member.user_id = app.current_user_id()
      AND member.active = true
  ),
  bounds AS (
    SELECT
      company.id AS company_id,
      company.timezone,
      (now() AT TIME ZONE company.timezone)::date AS today,
      date_trunc('month', now() AT TIME ZONE company.timezone) AS month_start
    FROM company
  ),
  mine AS (
    SELECT
      count(*) FILTER (WHERE budget.status = 'draft') AS draft_count,
      count(*) FILTER (WHERE budget.status IN ('sent', 'viewed')) AS awaiting_count,
      COALESCE(sum(budget.total) FILTER (WHERE budget.status IN ('sent', 'viewed')), 0) AS awaiting_amount,
      count(*) FILTER (WHERE budget.status = 'viewed') AS viewed_count,
      count(*) FILTER (
        WHERE budget.status = 'approved'
          AND (budget.approved_at AT TIME ZONE bounds.timezone) >= bounds.month_start
      ) AS approved_month_count,
      COALESCE(sum(budget.total) FILTER (
        WHERE budget.status = 'approved'
          AND (budget.approved_at AT TIME ZONE bounds.timezone) >= bounds.month_start
      ), 0) AS approved_month_amount,
      count(*) FILTER (
        WHERE budget.status = 'approved' AND budget.approved_at >= now() - interval '90 days'
      ) AS approved_90,
      count(*) FILTER (
        WHERE budget.status = 'rejected' AND budget.updated_at >= now() - interval '90 days'
      ) AS rejected_90,
      count(*) FILTER (
        WHERE budget.status IN ('sent', 'viewed')
          AND budget.valid_until IS NOT NULL
          AND budget.valid_until BETWEEN bounds.today AND bounds.today + 7
      ) AS expiring_count
    FROM bounds
    LEFT JOIN public.budgets AS budget
      ON budget.company_id = bounds.company_id
     AND budget.created_by = app.current_user_id()
  ),
  company_budgets AS (
    SELECT
      count(*) FILTER (WHERE budget.status IN ('sent', 'viewed')) AS awaiting_count,
      COALESCE(sum(budget.total) FILTER (WHERE budget.status IN ('sent', 'viewed')), 0) AS awaiting_amount,
      count(*) FILTER (
        WHERE budget.status IN ('sent', 'viewed')
          AND budget.valid_until IS NOT NULL
          AND budget.valid_until BETWEEN bounds.today AND bounds.today + 7
      ) AS expiring_count
    FROM bounds
    LEFT JOIN public.budgets AS budget ON budget.company_id = bounds.company_id
  ),
  open_invoices AS (
    SELECT
      invoice.status,
      invoice.due_date,
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
  collections AS (
    SELECT COALESCE(sum(payment.amount), 0) AS collected_this_month
    FROM bounds
    LEFT JOIN public.invoice_payments AS payment
      ON payment.company_id = bounds.company_id
     AND payment.status = 'confirmed'::public.invoice_payment_status
     AND (payment.paid_at AT TIME ZONE bounds.timezone) >= bounds.month_start
  )
  SELECT
    me.role,
    company.currency_code,
    mine.draft_count::integer AS my_draft_count,
    mine.awaiting_count::integer AS my_awaiting_count,
    mine.awaiting_amount::double precision AS my_awaiting_amount,
    mine.viewed_count::integer AS my_viewed_count,
    mine.approved_month_count::integer AS my_approved_month_count,
    mine.approved_month_amount::double precision AS my_approved_month_amount,
    mine.approved_90::integer AS my_approved_90,
    mine.rejected_90::integer AS my_rejected_90,
    mine.expiring_count::integer AS my_expiring_count,
    company_budgets.awaiting_count::integer AS company_awaiting_count,
    company_budgets.awaiting_amount::double precision AS company_awaiting_amount,
    company_budgets.expiring_count::integer AS company_expiring_count,
    receivables.receivable::double precision AS receivable,
    receivables.overdue_count::integer AS overdue_count,
    receivables.overdue_amount::double precision AS overdue_amount,
    collections.collected_this_month::double precision AS collected_this_month
  FROM company, me, mine, company_budgets, receivables, collections
`;

export async function findRoleDashboardRepo(userId: string, companyId: string) {
  return withUserTransaction(userId, async (client) => {
    const result = await client.query(roleDashboardSql, [companyId]);
    return result.rows[0] ?? null;
  });
}
