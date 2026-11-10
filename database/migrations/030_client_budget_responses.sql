BEGIN;

SET ROLE contractor_owner;

-- El cliente vinculado puede ver sus presupuestos (budgets_select_for_linked_client)
-- pero no tiene política de UPDATE, así que la aprobación desde el portal no
-- cambiaba nada. En lugar de abrir UPDATE sobre toda la tabla, estas funciones
-- permiten exactamente dos cosas al cliente: marcar como visto y responder
-- (aprobar o rechazar) un presupuesto enviado y vigente.

CREATE OR REPLACE FUNCTION private.mark_budget_viewed_by_client(p_budget_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_user_id uuid := app.current_user_id();
  v_budget public.budgets%ROWTYPE;
BEGIN
  IF v_user_id IS NULL
    OR p_budget_id IS NULL
    OR NOT private.is_active_platform_user()
  THEN
    RETURN false;
  END IF;

  SELECT budget.*
  INTO v_budget
  FROM public.budgets AS budget
  JOIN public.clients AS customer
    ON customer.id = budget.client_id
   AND customer.company_id = budget.company_id
  WHERE budget.id = p_budget_id
    AND budget.status = 'sent'::public.budget_status
    AND customer.user_id = v_user_id
    AND customer.active = true
  FOR UPDATE OF budget;

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  UPDATE public.budgets
  SET status = 'viewed'::public.budget_status,
      updated_at = now()
  WHERE id = v_budget.id;

  INSERT INTO public.budget_change_history (company_id, budget_id, version, action, performed_by, notes)
  VALUES (v_budget.company_id, v_budget.id, v_budget.version, 'viewed', v_user_id, 'El cliente abrió el presupuesto');

  RETURN true;
END;
$function$;

REVOKE ALL
ON FUNCTION private.mark_budget_viewed_by_client(uuid)
FROM PUBLIC;

GRANT EXECUTE
ON FUNCTION private.mark_budget_viewed_by_client(uuid)
TO contractor_api, contractor_migrator;

CREATE OR REPLACE FUNCTION private.respond_to_budget_as_client(
  p_budget_id uuid,
  p_decision text,
  p_reason text DEFAULT NULL
)
RETURNS SETOF public.budgets
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_user_id uuid := app.current_user_id();
  v_budget public.budgets%ROWTYPE;
  v_today date;
  v_reason text := NULLIF(btrim(COALESCE(p_reason, '')), '');
  v_snapshot jsonb;
BEGIN
  IF v_user_id IS NULL OR NOT private.is_active_platform_user() THEN
    RAISE EXCEPTION 'budget_response_not_allowed' USING ERRCODE = '42501';
  END IF;

  IF p_decision IS NULL OR p_decision NOT IN ('approved', 'rejected') THEN
    RAISE EXCEPTION 'budget_response_invalid_decision' USING ERRCODE = '22023';
  END IF;

  SELECT budget.*
  INTO v_budget
  FROM public.budgets AS budget
  JOIN public.clients AS customer
    ON customer.id = budget.client_id
   AND customer.company_id = budget.company_id
  WHERE budget.id = p_budget_id
    AND customer.user_id = v_user_id
    AND customer.active = true
  FOR UPDATE OF budget;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'budget_response_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF v_budget.status NOT IN ('sent'::public.budget_status, 'viewed'::public.budget_status) THEN
    RAISE EXCEPTION 'budget_response_not_pending' USING ERRCODE = '22023';
  END IF;

  SELECT (now() AT TIME ZONE company.timezone)::date
  INTO v_today
  FROM public.companies AS company
  WHERE company.id = v_budget.company_id;

  IF v_budget.valid_until IS NOT NULL AND v_budget.valid_until < COALESCE(v_today, current_date) THEN
    RAISE EXCEPTION 'budget_response_expired' USING ERRCODE = '22023';
  END IF;

  IF p_decision = 'rejected' AND (v_reason IS NULL OR char_length(v_reason) > 1000) THEN
    RAISE EXCEPTION 'budget_response_reason_required' USING ERRCODE = '22023';
  END IF;

  IF p_decision = 'approved' THEN
    UPDATE public.budgets
    SET status = 'approved'::public.budget_status,
        approved_at = now(),
        approved_by = v_user_id,
        rejection_reason = NULL,
        updated_at = now()
    WHERE id = v_budget.id
    RETURNING * INTO v_budget;

    SELECT jsonb_build_object(
      'budget', to_jsonb(v_budget),
      'items', COALESCE(jsonb_agg(to_jsonb(item) ORDER BY item.sort_order), '[]'::jsonb)
    )
    INTO v_snapshot
    FROM public.budget_items AS item
    WHERE item.budget_id = v_budget.id;

    INSERT INTO public.budget_versions (company_id, budget_id, version_number, snapshot_data, created_by)
    VALUES (v_budget.company_id, v_budget.id, v_budget.version, v_snapshot, v_user_id)
    ON CONFLICT DO NOTHING;

    INSERT INTO public.budget_change_history (company_id, budget_id, version, action, performed_by, notes, snapshot)
    VALUES (v_budget.company_id, v_budget.id, v_budget.version, 'approved', v_user_id, 'Presupuesto aprobado por el cliente', v_snapshot);
  ELSE
    UPDATE public.budgets
    SET status = 'rejected'::public.budget_status,
        rejection_reason = v_reason,
        updated_at = now()
    WHERE id = v_budget.id
    RETURNING * INTO v_budget;

    INSERT INTO public.budget_change_history (company_id, budget_id, version, action, performed_by, notes)
    VALUES (v_budget.company_id, v_budget.id, v_budget.version, 'rejected', v_user_id, 'Rechazado por el cliente: ' || v_reason);
  END IF;

  RETURN NEXT v_budget;
END;
$function$;

REVOKE ALL
ON FUNCTION private.respond_to_budget_as_client(uuid, text, text)
FROM PUBLIC;

GRANT EXECUTE
ON FUNCTION private.respond_to_budget_as_client(uuid, text, text)
TO contractor_api, contractor_migrator;

RESET ROLE;

COMMIT;
