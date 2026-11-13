import type { PoolClient } from "pg";

import { withUserTransaction } from "../db/with-user-transaction.js";

type ProcessRow = {
  id: string;
  kind: "project" | "task" | "budget" | "invoice" | "payment" | "credit_note" | "activity";
  title: string;
  status: string;
  date: string | null;
  detail: string | null;
  parent_id: string | null;
  amount: number | null;
  currency_code: string | null;
  valid_until: string | null;
};

async function getProcesses(
  client: PoolClient, companyId: string, clientId: string | null, canViewBudgets: boolean
) {
  const result = await client.query<ProcessRow>(`
    WITH customers AS (
      SELECT id FROM public.clients
      WHERE company_id = $1
        AND (CASE WHEN $2::uuid IS NULL THEN active AND user_id = app.current_user_id() ELSE id = $2 END)
    ),
    projects AS (
      SELECT id, name, project_code, status, created_at
      FROM public.projects WHERE company_id = $1 AND client_id IN (SELECT id FROM customers)
    ),
    invoices AS (
      SELECT id, invoice_number, status, issue_date, created_at
      FROM public.invoices WHERE company_id = $1 AND client_id IN (SELECT id FROM customers)
        AND ($2::uuid IS NOT NULL OR status <> 'draft')
    )
    SELECT kind, id, title, status, date, detail, parent_id, amount, currency_code, valid_until
    FROM (
      SELECT 'project' AS kind, id, name AS title, status::text,
        to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS date,
        project_code AS detail, NULL::uuid AS parent_id, NULL::double precision AS amount,
        NULL::text AS currency_code, NULL::text AS valid_until
      FROM projects
      UNION ALL
      SELECT 'budget', id, title, status::text, to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
        budget_number, NULL, total::double precision, currency_code, valid_until::text
      FROM public.budgets WHERE $3::boolean AND company_id = $1 AND client_id IN (SELECT id FROM customers)
        AND ($2::uuid IS NOT NULL OR status IN ('sent', 'viewed', 'approved', 'rejected', 'expired'))
      UNION ALL
      SELECT 'invoice', id, invoice_number, status::text, coalesce(issue_date::text,
        to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')), NULL, NULL, NULL, NULL, NULL
      FROM invoices
      UNION ALL
      SELECT 'payment', payment.id, payment.receipt_number, payment.status::text,
        to_char(payment.paid_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
        invoice.invoice_number, invoice.id, payment.amount::double precision, payment.currency_code, NULL
      FROM public.invoice_payments AS payment JOIN invoices AS invoice ON invoice.id = payment.invoice_id
      WHERE payment.company_id = $1
      UNION ALL
      SELECT 'credit_note', note.id, note.credit_note_number, note.status::text,
        to_char(note.issued_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
        invoice.invoice_number, invoice.id, note.amount::double precision, note.currency_code, NULL
      FROM public.invoice_credit_notes AS note JOIN invoices AS invoice ON invoice.id = note.invoice_id
      WHERE note.company_id = $1 AND ($2::uuid IS NOT NULL OR note.status = 'issued')
      UNION ALL
      SELECT 'activity', activity.id, activity.title, activity.status, activity.date,
        concat_ws(' · ', activity.start_time, activity.address), project.id, NULL, NULL, NULL
      FROM public.activities AS activity LEFT JOIN projects AS project ON project.id = activity.project_id
      WHERE activity.company_id = $1 AND (activity.client_id IN (SELECT id FROM customers)
        OR (activity.client_id IS NULL AND project.id IS NOT NULL)
      ) AND ($2::uuid IS NOT NULL OR activity.status <> 'cancelled')
      UNION ALL
      SELECT 'task', task.id, task.title, task.status,
        to_char(task.due_date AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
        project.name, project.id, NULL, NULL, NULL
      FROM public.project_tasks AS task JOIN projects AS project ON project.id = task.project_id
      WHERE $2::uuid IS NOT NULL AND task.company_id = $1
    ) AS processes
    ORDER BY date DESC NULLS LAST, id`,
    [companyId, clientId, canViewBudgets]
  );
  return result.rows;
}

export async function findContractorClientProcesses(userId: string, companyId: string, clientId: string) {
  return withUserTransaction(userId, async (client) => {
    const { rows } = await client.query<{ allowed: boolean }>(`
      SELECT public.has_company_role($1, ARRAY['owner', 'admin', 'estimator']::public.company_role[]) AS allowed
    `, [companyId]);
    return getProcesses(client, companyId, clientId, rows[0]?.allowed ?? false);
  });
}

export async function findClientContractorProfile(userId: string, companyId: string) {
  return withUserTransaction(userId, async (client) => {
    const { rows } = await client.query(`
      SELECT company.id, company.name, company.phone, company.email, company.address, company.logo_url
      FROM public.companies AS company
      WHERE company.id = $1 AND company.active AND EXISTS (
        SELECT 1 FROM public.clients AS customer WHERE customer.company_id = company.id
          AND customer.active AND customer.user_id = app.current_user_id()
      )
    `, [companyId]);
    const company = rows[0];
    if (!company) return null;
    return { company, processes: await getProcesses(client, companyId, null, true) };
  });
}
