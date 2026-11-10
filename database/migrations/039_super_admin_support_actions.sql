BEGIN;

SET ROLE contractor_owner;

-- Acciones de soporte del superadministrador desde el panel admin.
-- Son funciones SECURITY DEFINER con reglas explícitas (en lugar de abrir
-- políticas UPDATE generales): validan que quien llama es superadministrador
-- activo, exigen un motivo y dejan la acción en admin_audit_logs, que también
-- ve el propietario/administrador de la empresa afectada.

-- 1. Cambiar el estado de una obra ------------------------------------------

CREATE OR REPLACE FUNCTION public.admin_set_project_status(
  requested_project_id uuid,
  requested_status public.project_status,
  requested_reason text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  project_record public.projects%ROWTYPE;
  clean_reason text := NULLIF(btrim(requested_reason), '');
BEGIN
  IF app.current_user_id() IS NULL OR NOT private.is_super_admin() THEN
    RAISE EXCEPTION 'Solo el superadministrador puede usar esta acción.';
  END IF;

  IF clean_reason IS NULL OR char_length(clean_reason) NOT BETWEEN 5 AND 500 THEN
    RAISE EXCEPTION 'Indica el motivo del cambio (entre 5 y 500 caracteres).';
  END IF;

  SELECT project.*
  INTO project_record
  FROM public.projects AS project
  WHERE project.id = requested_project_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  IF project_record.status = requested_status THEN
    RAISE EXCEPTION 'La obra ya tiene ese estado.';
  END IF;

  UPDATE public.projects
  SET
    status = requested_status,
    actual_end_date = CASE
      WHEN requested_status = 'completed'::public.project_status
        THEN COALESCE(actual_end_date, current_date)
      ELSE actual_end_date
    END,
    updated_at = now()
  WHERE id = project_record.id;

  INSERT INTO public.admin_audit_logs (company_id, user_id, action, target_type, target_id, metadata)
  VALUES (
    project_record.company_id,
    app.current_user_id(),
    'ADMIN_PROJECT_STATUS_CHANGED',
    'project',
    project_record.id::text,
    jsonb_build_object(
      'reason', clean_reason,
      'projectName', project_record.name,
      'projectCode', project_record.project_code,
      'fromStatus', project_record.status,
      'toStatus', requested_status
    )
  );

  RETURN project_record.id;
END
$function$;

-- 2. Anular una factura -----------------------------------------------------
-- Mismas reglas que public.cancel_invoice: solo facturas emitidas o vencidas y
-- sin pagos confirmados ni notas de crédito vigentes.

CREATE OR REPLACE FUNCTION public.admin_cancel_invoice(
  requested_invoice_id uuid,
  requested_reason text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  invoice_record public.invoices%ROWTYPE;
  clean_reason text := NULLIF(btrim(requested_reason), '');
  confirmed_payment_count bigint;
  issued_credit_note_count bigint;
BEGIN
  IF app.current_user_id() IS NULL OR NOT private.is_super_admin() THEN
    RAISE EXCEPTION 'Solo el superadministrador puede usar esta acción.';
  END IF;

  IF clean_reason IS NULL OR char_length(clean_reason) NOT BETWEEN 5 AND 500 THEN
    RAISE EXCEPTION 'Indica el motivo de la anulación (entre 5 y 500 caracteres).';
  END IF;

  SELECT invoice.*
  INTO invoice_record
  FROM public.invoices AS invoice
  WHERE invoice.id = requested_invoice_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  SELECT count(*)
  INTO confirmed_payment_count
  FROM public.invoice_payments AS payment
  WHERE payment.invoice_id = invoice_record.id
    AND payment.status = 'confirmed'::public.invoice_payment_status;

  SELECT count(*)
  INTO issued_credit_note_count
  FROM public.invoice_credit_notes AS credit_note
  WHERE credit_note.invoice_id = invoice_record.id
    AND credit_note.status = 'issued'::public.invoice_credit_note_status;

  IF confirmed_payment_count > 0 OR issued_credit_note_count > 0 THEN
    RAISE EXCEPTION
      'La factura tiene pagos o notas de crédito; la empresa debe revertirlos o emitir una nota de crédito.';
  END IF;

  IF invoice_record.status NOT IN (
    'issued'::public.invoice_status,
    'overdue'::public.invoice_status
  ) THEN
    RAISE EXCEPTION 'Solo se puede anular una factura emitida o vencida.';
  END IF;

  -- El historial de la factura (trigger) toma este motivo.
  PERFORM set_config('app.invoice_change_reason', 'Superadministrador: ' || clean_reason, true);

  UPDATE public.invoices
  SET
    status = 'cancelled'::public.invoice_status,
    updated_at = now()
  WHERE id = invoice_record.id;

  INSERT INTO public.admin_audit_logs (company_id, user_id, action, target_type, target_id, metadata)
  VALUES (
    invoice_record.company_id,
    app.current_user_id(),
    'ADMIN_INVOICE_CANCELLED',
    'invoice',
    invoice_record.id::text,
    jsonb_build_object(
      'reason', clean_reason,
      'invoiceNumber', invoice_record.invoice_number,
      'fromStatus', invoice_record.status
    )
  );

  RETURN invoice_record.id;
END
$function$;

REVOKE EXECUTE ON FUNCTION public.admin_set_project_status(uuid, public.project_status, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_cancel_invoice(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_set_project_status(uuid, public.project_status, text) TO contractor_api;
GRANT EXECUTE ON FUNCTION public.admin_cancel_invoice(uuid, text) TO contractor_api;

RESET ROLE;

COMMIT;
