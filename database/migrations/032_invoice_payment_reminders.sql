BEGIN;

SET ROLE contractor_owner;

-- Recordatorios de cobro por correo al cliente: uno antes del vencimiento y
-- dos después. La tarea programada del Worker no tiene identidad de usuario,
-- así que reclama los envíos pendientes con una función SECURITY DEFINER que
-- solo devuelve lo necesario para redactar el correo.

ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS payment_reminders_enabled boolean NOT NULL DEFAULT true;

CREATE TABLE IF NOT EXISTS public.invoice_payment_reminders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  invoice_id uuid NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
  kind text NOT NULL,
  sent_to text NOT NULL,
  claimed_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT invoice_payment_reminders_kind_valid CHECK (kind IN ('due_soon', 'overdue', 'overdue_week')),
  CONSTRAINT invoice_payment_reminders_unique UNIQUE (invoice_id, kind)
);

CREATE INDEX IF NOT EXISTS invoice_payment_reminders_company_idx
  ON public.invoice_payment_reminders (company_id, claimed_at DESC);

ALTER TABLE public.invoice_payment_reminders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS invoice_payment_reminders_select_policy ON public.invoice_payment_reminders;
CREATE POLICY invoice_payment_reminders_select_policy
ON public.invoice_payment_reminders
FOR SELECT TO contractor_api
USING (public.is_company_member(company_id));

GRANT SELECT ON public.invoice_payment_reminders TO contractor_api;

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
  currency_code text
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
    due.currency_code
  FROM claimed
  JOIN due ON due.invoice_id = claimed.invoice_id AND due.reminder_kind = claimed.kind;
END;
$function$;

-- Si el correo no se pudo enviar, se libera para reintentar en la próxima corrida.
CREATE OR REPLACE FUNCTION private.release_invoice_payment_reminder(p_reminder_id uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $function$
  DELETE FROM public.invoice_payment_reminders WHERE id = p_reminder_id;
$function$;

REVOKE ALL ON FUNCTION private.claim_invoice_payment_reminders(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.claim_invoice_payment_reminders(integer) TO contractor_api, contractor_migrator;

REVOKE ALL ON FUNCTION private.release_invoice_payment_reminder(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.release_invoice_payment_reminder(uuid) TO contractor_api, contractor_migrator;

RESET ROLE;

COMMIT;
