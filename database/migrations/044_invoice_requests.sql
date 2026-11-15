BEGIN;

SET ROLE contractor_owner;

-- Solicitudes de factura: cuando la obra está terminada, el cliente vinculado
-- pide la factura desde su portal y la empresa la genera.
--
-- Reglas:
--   * Solo el cliente vinculado a la obra (clients.user_id) puede pedirla.
--   * La obra debe estar «completed» y tener un presupuesto aprobado sin factura.
--   * Una sola solicitud pendiente por presupuesto: pedirla otra vez devuelve
--     la existente.
--   * Al crearse la factura del presupuesto, la solicitud queda «fulfilled»
--     (disparador en public.invoices).
--   * Lectura con RLS; escritura solo por funciones SECURITY DEFINER.

CREATE TABLE IF NOT EXISTS public.invoice_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  budget_id uuid NOT NULL REFERENCES public.budgets(id) ON DELETE CASCADE,
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  requested_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'pending',
  note text,
  invoice_id uuid REFERENCES public.invoices(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  fulfilled_at timestamptz,
  CONSTRAINT invoice_requests_status CHECK (status IN ('pending', 'fulfilled', 'cancelled')),
  CONSTRAINT invoice_requests_note_length CHECK (note IS NULL OR char_length(note) <= 500)
);

CREATE UNIQUE INDEX IF NOT EXISTS invoice_requests_one_pending_idx
  ON public.invoice_requests (budget_id)
  WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS invoice_requests_company_status_idx
  ON public.invoice_requests (company_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS invoice_requests_project_fk_idx
  ON public.invoice_requests (project_id);
CREATE INDEX IF NOT EXISTS invoice_requests_client_fk_idx
  ON public.invoice_requests (client_id);
CREATE INDEX IF NOT EXISTS invoice_requests_requested_by_fk_idx
  ON public.invoice_requests (requested_by);
CREATE INDEX IF NOT EXISTS invoice_requests_invoice_fk_idx
  ON public.invoice_requests (invoice_id);

ALTER TABLE public.invoice_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS invoice_requests_select ON public.invoice_requests;
CREATE POLICY invoice_requests_select ON public.invoice_requests
  FOR SELECT TO contractor_api
  USING (
    public.is_company_member(company_id)
    OR requested_by = app.current_user_id()
    OR EXISTS (
      SELECT 1
      FROM public.clients AS customer
      WHERE customer.id = invoice_requests.client_id
        AND customer.user_id = app.current_user_id()
        AND customer.active = true
    )
    OR (SELECT private.is_super_admin())
  );

GRANT SELECT ON public.invoice_requests TO contractor_api;

-- El cliente pide la factura de una obra terminada ---------------------------

CREATE OR REPLACE FUNCTION public.request_project_invoice(
  requested_project_id uuid,
  requested_note text DEFAULT NULL
)
RETURNS TABLE (
  request_id uuid,
  company_id uuid,
  budget_id uuid,
  already_requested boolean,
  recipient_ids uuid[]
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_user_id uuid := app.current_user_id();
  v_project record;
  v_budget record;
  v_request public.invoice_requests%ROWTYPE;
  v_note text := NULLIF(btrim(COALESCE(requested_note, '')), '');
  v_existing boolean := false;
  v_recipients uuid[];
BEGIN
  IF v_user_id IS NULL OR NOT private.is_active_platform_user() THEN
    RAISE EXCEPTION 'Se requiere una cuenta activa y aprobada.' USING ERRCODE = '42501';
  END IF;

  IF v_note IS NOT NULL AND char_length(v_note) > 500 THEN
    RAISE EXCEPTION 'La nota admite 500 caracteres.' USING ERRCODE = '22023';
  END IF;

  SELECT project.id, project.company_id, project.client_id, project.status
  INTO v_project
  FROM public.projects AS project
  JOIN public.clients AS customer
    ON customer.id = project.client_id
   AND customer.company_id = project.company_id
   AND customer.user_id = v_user_id
   AND customer.active = true
  JOIN public.companies AS company
    ON company.id = project.company_id
   AND company.active = true
  WHERE project.id = requested_project_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'No se encontró la obra.' USING ERRCODE = 'P0002';
  END IF;

  IF v_project.status <> 'completed'::public.project_status THEN
    RAISE EXCEPTION 'Podrás solicitar la factura cuando la obra esté terminada.' USING ERRCODE = '55000';
  END IF;

  -- El presupuesto aprobado más reciente de la obra que todavía no tiene factura.
  SELECT budget.id, budget.created_by
  INTO v_budget
  FROM public.budgets AS budget
  WHERE budget.project_id = v_project.id
    AND budget.company_id = v_project.company_id
    AND budget.client_id = v_project.client_id
    AND budget.status = 'approved'::public.budget_status
    AND NOT EXISTS (
      SELECT 1 FROM public.invoices AS invoice WHERE invoice.budget_id = budget.id
    )
  ORDER BY budget.approved_at DESC NULLS LAST, budget.created_at DESC
  LIMIT 1;

  IF NOT FOUND THEN
    IF EXISTS (
      SELECT 1
      FROM public.invoices AS invoice
      JOIN public.budgets AS budget ON budget.id = invoice.budget_id
      WHERE budget.project_id = v_project.id
    ) THEN
      RAISE EXCEPTION 'Esta obra ya tiene factura.' USING ERRCODE = '23505';
    END IF;
    RAISE EXCEPTION 'La obra no tiene un presupuesto aprobado para facturar.' USING ERRCODE = '55000';
  END IF;

  SELECT request.* INTO v_request
  FROM public.invoice_requests AS request
  WHERE request.budget_id = v_budget.id
    AND request.status = 'pending'
  LIMIT 1;

  IF FOUND THEN
    v_existing := true;
  ELSE
    INSERT INTO public.invoice_requests (
      company_id, project_id, budget_id, client_id, requested_by, note
    )
    VALUES (
      v_project.company_id, v_project.id, v_budget.id, v_project.client_id, v_user_id, v_note
    )
    RETURNING * INTO v_request;
  END IF;

  -- Quien creó el presupuesto y quienes pueden facturar (dueño, administrador, ventas).
  SELECT array_agg(DISTINCT member.user_id) INTO v_recipients
  FROM public.company_members AS member
  WHERE member.company_id = v_project.company_id
    AND member.active = true
    AND (
      member.role IN ('owner', 'admin', 'sales')
      OR member.user_id = v_budget.created_by
    );

  request_id := v_request.id;
  company_id := v_request.company_id;
  budget_id := v_request.budget_id;
  already_requested := v_existing;
  recipient_ids := COALESCE(v_recipients, ARRAY[]::uuid[]);
  RETURN NEXT;
END
$function$;

-- La factura del presupuesto atiende la solicitud ---------------------------

CREATE OR REPLACE FUNCTION private.fulfill_invoice_request()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  IF NEW.budget_id IS NOT NULL THEN
    UPDATE public.invoice_requests
    SET status = 'fulfilled',
        invoice_id = NEW.id,
        fulfilled_at = now()
    WHERE budget_id = NEW.budget_id
      AND status = 'pending';
  END IF;
  RETURN NEW;
END
$function$;

DROP TRIGGER IF EXISTS invoices_fulfill_invoice_request ON public.invoices;
CREATE TRIGGER invoices_fulfill_invoice_request
  AFTER INSERT ON public.invoices
  FOR EACH ROW
  EXECUTE FUNCTION private.fulfill_invoice_request();

REVOKE EXECUTE ON FUNCTION public.request_project_invoice(uuid, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION private.fulfill_invoice_request() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.request_project_invoice(uuid, text) TO contractor_api;

RESET ROLE;

COMMIT;
