BEGIN;

SET ROLE contractor_owner;
SET LOCAL lock_timeout = '5s';

-- Facturas solo para quien factura, e informe de ventas por persona.
--
-- Hasta ahora cualquier miembro activo de la empresa (presupuestista,
-- supervisor, equipo de campo) veía todas las facturas, pagos, notas de
-- crédito y montos de cobro. Regla nueva:
--   * propietario y administrador: todas las facturas de la empresa;
--   * ventas: solo las facturas que generó (invoices.created_by);
--   * los demás roles: ninguna.
-- El cliente vinculado y el superadministrador conservan su acceso.
--
-- Pagos, notas de crédito e historial ya filtran con EXISTS sobre invoices, así
-- que heredan la regla. Los recordatorios de pago se alinean aquí.
--
-- Las funciones de facturación son SECURITY DEFINER (no ven RLS): un disparador
-- impide que una persona de ventas modifique, cobre o acredite una factura que
-- no generó, aunque la llamada llegue por cualquier camino.

DROP POLICY IF EXISTS invoices_select_access ON public.invoices;
CREATE POLICY invoices_select_access ON public.invoices
  AS PERMISSIVE FOR SELECT TO contractor_api
  USING (
    (( SELECT private.is_super_admin() AS is_super_admin))
    OR (company_id = ANY (( SELECT private.active_role_company_ids(ARRAY['owner'::public.company_role, 'admin'::public.company_role]) AS active_role_company_ids)::uuid[]))
    OR (
      company_id = ANY (( SELECT private.active_role_company_ids(ARRAY['sales'::public.company_role]) AS active_role_company_ids)::uuid[])
      AND created_by = ( SELECT app.current_user_id() AS current_user_id)
    )
    OR (
      status <> 'draft'::public.invoice_status
      AND EXISTS (
        SELECT 1
        FROM public.clients customer
        WHERE customer.id = invoices.client_id
          AND customer.company_id = invoices.company_id
          AND customer.user_id = ( SELECT app.current_user_id() AS current_user_id)
          AND customer.active = true
      )
    )
  );

DROP POLICY IF EXISTS invoices_insert_access ON public.invoices;
CREATE POLICY invoices_insert_access ON public.invoices
  AS PERMISSIVE FOR INSERT TO contractor_api
  WITH CHECK (
    company_id = ANY (( SELECT private.active_role_company_ids(ARRAY['owner'::public.company_role, 'admin'::public.company_role, 'sales'::public.company_role]) AS active_role_company_ids)::uuid[])
  );

DROP POLICY IF EXISTS invoices_update_access ON public.invoices;
CREATE POLICY invoices_update_access ON public.invoices
  AS PERMISSIVE FOR UPDATE TO contractor_api
  USING (
    company_id = ANY (( SELECT private.active_role_company_ids(ARRAY['owner'::public.company_role, 'admin'::public.company_role, 'sales'::public.company_role]) AS active_role_company_ids)::uuid[])
  )
  WITH CHECK (
    company_id = ANY (( SELECT private.active_role_company_ids(ARRAY['owner'::public.company_role, 'admin'::public.company_role, 'sales'::public.company_role]) AS active_role_company_ids)::uuid[])
  );

DROP POLICY IF EXISTS invoices_delete_access ON public.invoices;
CREATE POLICY invoices_delete_access ON public.invoices
  AS PERMISSIVE FOR DELETE TO contractor_api
  USING (
    company_id = ANY (( SELECT private.active_role_company_ids(ARRAY['owner'::public.company_role, 'admin'::public.company_role]) AS active_role_company_ids)::uuid[])
  );

DROP POLICY IF EXISTS invoice_payment_reminders_select_policy ON public.invoice_payment_reminders;
CREATE POLICY invoice_payment_reminders_select_policy ON public.invoice_payment_reminders
  AS PERMISSIVE FOR SELECT TO contractor_api
  USING (
    EXISTS (
      SELECT 1
      FROM public.invoices invoice
      WHERE invoice.id = invoice_payment_reminders.invoice_id
        AND invoice.company_id = invoice_payment_reminders.company_id
    )
  );

-- Ventas solo gestiona las facturas que generó.
CREATE OR REPLACE FUNCTION private.enforce_sales_invoice_ownership()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  actor uuid := app.current_user_id();
  target_invoice uuid;
  target_company uuid;
  invoice_creator uuid;
  actor_role public.company_role;
BEGIN
  -- Tareas del sistema (recordatorios, vencimientos) no tienen usuario.
  IF actor IS NULL OR private.is_super_admin() THEN
    RETURN NEW;
  END IF;

  IF TG_TABLE_NAME = 'invoices' THEN
    target_invoice := NEW.id;
    target_company := NEW.company_id;
    invoice_creator := NEW.created_by;
    IF TG_OP = 'UPDATE' THEN
      invoice_creator := OLD.created_by;
    END IF;
  ELSE
    target_invoice := NEW.invoice_id;
    target_company := NEW.company_id;
    SELECT invoice.created_by
    INTO invoice_creator
    FROM public.invoices AS invoice
    WHERE invoice.id = target_invoice
      AND invoice.company_id = target_company;
  END IF;

  SELECT membership.role
  INTO actor_role
  FROM public.company_members AS membership
  WHERE membership.company_id = target_company
    AND membership.user_id = actor
    AND membership.active = true;

  IF actor_role = 'sales'::public.company_role
     AND invoice_creator IS DISTINCT FROM actor THEN
    RAISE EXCEPTION 'Solo puedes gestionar las facturas que generaste.'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$function$;

REVOKE EXECUTE ON FUNCTION private.enforce_sales_invoice_ownership() FROM PUBLIC;

DROP TRIGGER IF EXISTS invoices_enforce_sales_ownership ON public.invoices;
CREATE TRIGGER invoices_enforce_sales_ownership
  BEFORE UPDATE ON public.invoices
  FOR EACH ROW EXECUTE FUNCTION private.enforce_sales_invoice_ownership();

DROP TRIGGER IF EXISTS invoice_payments_enforce_sales_ownership ON public.invoice_payments;
CREATE TRIGGER invoice_payments_enforce_sales_ownership
  BEFORE INSERT OR UPDATE ON public.invoice_payments
  FOR EACH ROW EXECUTE FUNCTION private.enforce_sales_invoice_ownership();

DROP TRIGGER IF EXISTS invoice_credit_notes_enforce_sales_ownership ON public.invoice_credit_notes;
CREATE TRIGGER invoice_credit_notes_enforce_sales_ownership
  BEFORE INSERT OR UPDATE ON public.invoice_credit_notes
  FOR EACH ROW EXECUTE FUNCTION private.enforce_sales_invoice_ownership();

-- Informe de ventas por persona: cuánto cotizó, cuánto le aprobaron, cuánto
-- facturó (ejecutado) y cuánto cobró, por mes de un año.
--   * Cotizado: presupuestos cuyo primer envío al cliente hizo la persona
--     (budget_change_history, acción «sent»), en el mes de ese envío.
--   * Aprobado: esos mismos presupuestos, en el mes en que se aprobaron.
--   * Ejecutado: facturas que generó la persona (sin borradores ni anuladas),
--     en el mes de emisión, menos las notas de crédito emitidas.
--   * Cobrado: pagos confirmados de esas facturas, en el mes del pago.
-- Propietario y administrador ven a todo el personal de ventas; ventas, solo a sí misma.
-- Los meses se cuentan en la zona horaria de la empresa.
CREATE OR REPLACE FUNCTION public.company_sales_performance(
  requested_company_id uuid,
  requested_year integer,
  requested_user_id uuid DEFAULT NULL
)
RETURNS TABLE (
  user_id uuid,
  display_name text,
  member_active boolean,
  month integer,
  quoted_count integer,
  quoted_total numeric,
  approved_count integer,
  approved_total numeric,
  invoiced_count integer,
  invoiced_total numeric,
  collected_total numeric
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  actor uuid := app.current_user_id();
  actor_role public.company_role;
  target_user uuid := requested_user_id;
  company_timezone text;
BEGIN
  IF actor IS NULL OR NOT private.is_active_platform_user() THEN
    RAISE EXCEPTION 'Se requiere una cuenta activa y aprobada.' USING ERRCODE = '42501';
  END IF;

  IF requested_year IS NULL OR requested_year < 2000 OR requested_year > 2100 THEN
    RAISE EXCEPTION 'El año no es válido.' USING ERRCODE = '22023';
  END IF;

  SELECT membership.role
  INTO actor_role
  FROM public.company_members AS membership
  WHERE membership.company_id = requested_company_id
    AND membership.user_id = actor
    AND membership.active = true;

  IF actor_role IS NULL
     OR actor_role NOT IN ('owner'::public.company_role, 'admin'::public.company_role, 'sales'::public.company_role) THEN
    RAISE EXCEPTION 'No tienes acceso al informe de ventas de esta empresa.' USING ERRCODE = '42501';
  END IF;

  IF actor_role = 'sales'::public.company_role THEN
    IF target_user IS NOT NULL AND target_user <> actor THEN
      RAISE EXCEPTION 'Solo puedes ver tu propio informe de ventas.' USING ERRCODE = '42501';
    END IF;
    target_user := actor;
  END IF;

  SELECT COALESCE(NULLIF(company.timezone, ''), 'America/Panama')
  INTO company_timezone
  FROM public.companies AS company
  WHERE company.id = requested_company_id;

  RETURN QUERY
  WITH people AS (
    SELECT membership.user_id, membership.active
    FROM public.company_members AS membership
    WHERE membership.company_id = requested_company_id
      AND membership.role = 'sales'::public.company_role
      AND (target_user IS NULL OR membership.user_id = target_user)
  ),
  first_sent AS (
    SELECT DISTINCT ON (history.budget_id)
      history.budget_id,
      history.performed_by,
      history.created_at
    FROM public.budget_change_history AS history
    WHERE history.company_id = requested_company_id
      AND history.action = 'sent'
    ORDER BY history.budget_id, history.created_at
  ),
  attributed AS (
    SELECT first_sent.performed_by AS person, first_sent.created_at AS sent_at, budget.total, budget.status, budget.approved_at
    FROM first_sent
    JOIN public.budgets AS budget
      ON budget.id = first_sent.budget_id
     AND budget.company_id = requested_company_id
    WHERE first_sent.performed_by IN (SELECT people.user_id FROM people)
  ),
  quoted AS (
    SELECT attributed.person, extract(month FROM attributed.sent_at AT TIME ZONE company_timezone)::integer AS m,
           count(*)::integer AS n, sum(attributed.total) AS amount
    FROM attributed
    WHERE extract(year FROM attributed.sent_at AT TIME ZONE company_timezone) = requested_year
    GROUP BY 1, 2
  ),
  approved AS (
    SELECT attributed.person, extract(month FROM attributed.approved_at AT TIME ZONE company_timezone)::integer AS m,
           count(*)::integer AS n, sum(attributed.total) AS amount
    FROM attributed
    WHERE attributed.status = 'approved'::public.budget_status
      AND attributed.approved_at IS NOT NULL
      AND extract(year FROM attributed.approved_at AT TIME ZONE company_timezone) = requested_year
    GROUP BY 1, 2
  ),
  person_invoices AS (
    SELECT invoice.id, invoice.created_by AS person, invoice.issue_date,
           COALESCE((invoice.snapshot_data #>> '{totals,total}')::numeric, 0)
             - COALESCE((
                 SELECT sum(credit_note.amount)
                 FROM public.invoice_credit_notes AS credit_note
                 WHERE credit_note.invoice_id = invoice.id
                   AND credit_note.company_id = invoice.company_id
                   AND credit_note.status = 'issued'::public.invoice_credit_note_status
               ), 0) AS net_total
    FROM public.invoices AS invoice
    WHERE invoice.company_id = requested_company_id
      AND invoice.created_by IN (SELECT people.user_id FROM people)
      AND invoice.status NOT IN ('draft'::public.invoice_status, 'cancelled'::public.invoice_status)
  ),
  invoiced AS (
    SELECT person_invoices.person, extract(month FROM person_invoices.issue_date)::integer AS m,
           count(*)::integer AS n, sum(person_invoices.net_total) AS amount
    FROM person_invoices
    WHERE extract(year FROM person_invoices.issue_date) = requested_year
    GROUP BY 1, 2
  ),
  collected AS (
    SELECT person_invoices.person, extract(month FROM payment.paid_at AT TIME ZONE company_timezone)::integer AS m,
           sum(payment.amount) AS amount
    FROM public.invoice_payments AS payment
    JOIN person_invoices ON person_invoices.id = payment.invoice_id
    WHERE payment.company_id = requested_company_id
      AND payment.status = 'confirmed'::public.invoice_payment_status
      AND extract(year FROM payment.paid_at AT TIME ZONE company_timezone) = requested_year
    GROUP BY 1, 2
  )
  SELECT
    people.user_id,
    COALESCE(NULLIF(btrim(profile.full_name), ''), auth_user.email::text) AS display_name,
    people.active,
    months.m,
    COALESCE(quoted.n, 0),
    COALESCE(quoted.amount, 0)::numeric(14,2),
    COALESCE(approved.n, 0),
    COALESCE(approved.amount, 0)::numeric(14,2),
    COALESCE(invoiced.n, 0),
    COALESCE(invoiced.amount, 0)::numeric(14,2),
    COALESCE(collected.amount, 0)::numeric(14,2)
  FROM people
  CROSS JOIN generate_series(1, 12) AS months(m)
  LEFT JOIN public.profiles AS profile ON profile.id = people.user_id
  LEFT JOIN app_auth.users AS auth_user ON auth_user.id = people.user_id
  LEFT JOIN quoted ON quoted.person = people.user_id AND quoted.m = months.m
  LEFT JOIN approved ON approved.person = people.user_id AND approved.m = months.m
  LEFT JOIN invoiced ON invoiced.person = people.user_id AND invoiced.m = months.m
  LEFT JOIN collected ON collected.person = people.user_id AND collected.m = months.m
  ORDER BY display_name, people.user_id, months.m;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.company_sales_performance(uuid, integer, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.company_sales_performance(uuid, integer, uuid) TO contractor_api;

-- Busca el primer envío de cada presupuesto por empresa sin recorrer todo el historial.
CREATE INDEX IF NOT EXISTS budget_change_history_company_sent_idx
  ON public.budget_change_history (company_id, budget_id, created_at)
  WHERE action = 'sent';

RESET ROLE;

COMMIT;
