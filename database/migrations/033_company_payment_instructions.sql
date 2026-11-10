BEGIN;

SET ROLE contractor_owner;

-- Instrucciones de pago de la empresa (Yappy, cuenta bancaria, ACH...).
-- Se muestran en la factura y en los recordatorios de cobro.

ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS payment_instructions text;

ALTER TABLE public.companies
  DROP CONSTRAINT IF EXISTS companies_payment_instructions_length;

ALTER TABLE public.companies
  ADD CONSTRAINT companies_payment_instructions_length
  CHECK (payment_instructions IS NULL OR char_length(payment_instructions) <= 1000);

-- La función de recordatorios ahora también devuelve las instrucciones.
-- Cambia el tipo de retorno, así que se recrea.
DROP FUNCTION IF EXISTS private.claim_invoice_payment_reminders(integer);

CREATE OR REPLACE FUNCTION private.claim_invoice_payment_reminders(p_limit integer DEFAULT 25)
RETURNS TABLE (
  reminder_id uuid,
  invoice_id uuid,
  kind text,
  client_email text,
  client_name text,
  company_name text,
  company_email text,
  company_phone text,
  invoice_number text,
  due_date date,
  balance_due numeric,
  currency_code text,
  payment_instructions text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  RETURN QUERY
  WITH candidates AS (
    SELECT
      invoice.id AS invoice_id,
      invoice.company_id,
      invoice.invoice_number,
      invoice.due_date,
      company.name AS company_name,
      company.email AS company_email,
      company.phone AS company_phone,
      company.payment_instructions,
      COALESCE(invoice.snapshot_data ->> 'currency', company.currency_code) AS currency_code,
      lower(btrim(COALESCE(NULLIF(customer.email, ''), invoice.snapshot_data #>> '{client,email}'))) AS client_email,
      COALESCE(
        NULLIF(btrim(concat_ws(' ', customer.first_name, customer.last_name)), ''),
        customer.business_name
      ) AS client_name,
      (now() AT TIME ZONE company.timezone)::date AS today,
      extract(hour FROM now() AT TIME ZONE company.timezone) AS local_hour,
      GREATEST(
        COALESCE((invoice.snapshot_data #>> '{totals,total}')::numeric, 0)
          - COALESCE((
            SELECT sum(credit_note.amount)
            FROM public.invoice_credit_notes AS credit_note
            WHERE credit_note.invoice_id = invoice.id
              AND credit_note.status = 'issued'::public.invoice_credit_note_status
          ), 0)
          - COALESCE((
            SELECT sum(payment.amount)
            FROM public.invoice_payments AS payment
            WHERE payment.invoice_id = invoice.id
              AND payment.status = 'confirmed'::public.invoice_payment_status
          ), 0),
        0
      ) AS balance_due
    FROM public.invoices AS invoice
    JOIN public.companies AS company ON company.id = invoice.company_id
    LEFT JOIN public.clients AS customer ON customer.id = invoice.client_id
    WHERE invoice.status IN ('issued', 'partially_paid', 'overdue')
      AND invoice.due_date IS NOT NULL
      AND company.active = true
      AND company.payment_reminders_enabled = true
  ),
  due AS (
    SELECT
      candidate.*,
      CASE
        WHEN candidate.due_date BETWEEN candidate.today AND candidate.today + 3 THEN 'due_soon'
        WHEN candidate.due_date BETWEEN candidate.today - 6 AND candidate.today - 1 THEN 'overdue'
        WHEN candidate.due_date BETWEEN candidate.today - 30 AND candidate.today - 7 THEN 'overdue_week'
      END AS reminder_kind
    FROM candidates AS candidate
    WHERE candidate.balance_due > 0
      AND candidate.client_email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'
      -- Solo en horario de oficina de la empresa.
      AND candidate.local_hour BETWEEN 8 AND 17
  ),
  claimed AS (
    INSERT INTO public.invoice_payment_reminders (company_id, invoice_id, kind, sent_to)
    SELECT due.company_id, due.invoice_id, due.reminder_kind, due.client_email
    FROM due
    WHERE due.reminder_kind IS NOT NULL
    ORDER BY due.due_date ASC
    LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 25), 100))
    ON CONFLICT ON CONSTRAINT invoice_payment_reminders_unique DO NOTHING
    RETURNING public.invoice_payment_reminders.id, public.invoice_payment_reminders.invoice_id, public.invoice_payment_reminders.kind
  )
  SELECT
    claimed.id,
    claimed.invoice_id,
    claimed.kind,
    due.client_email,
    due.client_name,
    due.company_name,
    due.company_email,
    due.company_phone,
    due.invoice_number,
    due.due_date,
    due.balance_due,
    due.currency_code,
    due.payment_instructions
  FROM claimed
  JOIN due ON due.invoice_id = claimed.invoice_id AND due.reminder_kind = claimed.kind;
END;
$function$;

REVOKE ALL ON FUNCTION private.claim_invoice_payment_reminders(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.claim_invoice_payment_reminders(integer) TO contractor_api, contractor_migrator;

RESET ROLE;

COMMIT;
