BEGIN;

SET ROLE contractor_owner;

-- Eliminación de cuenta completa (nov-2026).
--
-- Antes de esta migración, DELETE /account ejecutaba las sentencias desde la
-- API con el rol contractor_api. Eso tenía tres problemas:
--   1. El disparador protect_profile_approval impide que un usuario cambie su
--      propio profiles.active, así que la eliminación fallaba para cualquier
--      cuenta activa («Solo un superadministrador puede cambiar la
--      aprobación»).
--   2. No llegaba a tablas que la API solo puede leer (peticiones de trabajo,
--      solicitudes de vinculación, clients.user_id) ni a los archivos fuera de
--      profile-documents (foto de perfil pública, fotos de peticiones y de
--      mensajes).
--   3. Las membresías seguían activas y no quedaba constancia de qué se
--      conservó por obligación legal ni hasta cuándo.
--
-- Ahora todo ocurre en una sola función SECURITY DEFINER,
-- private.delete_own_account(), con reglas explícitas:
--   * Elimina: peticiones de trabajo del usuario (con dirección, fotos y
--     conversaciones), notificaciones, tokens push, precios personales,
--     región de precios, aportes de precio pendientes, solicitudes de
--     vinculación pendientes, invitaciones pendientes a su correo, documentos
--     personales y fotos de perfil.
--   * Anonimiza: perfil, credenciales, identidades, tokens y sesiones.
--   * Termina: membresías en empresas que siguen operando y vínculos de
--     portal de cliente (clients.user_id).
--   * Cierra: las empresas en las que el usuario es el único miembro activo
--     (empresa inactiva, logo y fotos de obra eliminados).
--   * Bloquea: si el usuario es el único propietario de una empresa con otros
--     miembros activos, debe transferir la propiedad antes (SQLSTATE 55000).
--   * Conserva restringido: facturas emitidas y sus notas de crédito y pagos
--     (5 años desde el 31 de diciembre del año del último documento), los
--     registros comerciales que las respaldan y la bitácora de seguridad.
--   * Registra el resultado en private.account_deletion_records, sin datos
--     personales, como evidencia de cumplimiento.

-- 1. El disparador de aprobación permite la desactivación solo dentro de la
--    función de eliminación (rol propietario + marca de la transacción).
CREATE OR REPLACE FUNCTION public.prevent_unauthorized_profile_approval_change()
RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  IF (
    NEW.active IS DISTINCT FROM OLD.active
    OR NEW.approved_at IS DISTINCT FROM OLD.approved_at
    OR NEW.approved_by IS DISTINCT FROM OLD.approved_by
    OR NEW.contractor_approved_at IS DISTINCT FROM OLD.contractor_approved_at
  )
    AND app.current_user_id() IS NOT NULL
    AND NOT public.is_admin()
    AND NOT (
      current_user = 'contractor_owner'
      AND OLD.role = 'contractor'
      AND OLD.approved_at IS NULL AND NOT OLD.active
      AND NEW.active AND NEW.approved_at IS NOT NULL
      AND NEW.approved_by IS NOT DISTINCT FROM OLD.approved_by
      AND NEW.contractor_approved_at IS NOT DISTINCT FROM OLD.contractor_approved_at
    )
    AND NOT (
      current_user = 'contractor_owner'
      AND pg_catalog.current_setting('app.account_deletion_user_id', true) = OLD.id::text
      AND OLD.id = app.current_user_id()
      AND NOT NEW.active
      AND NEW.approved_at IS NOT DISTINCT FROM OLD.approved_at
      AND NEW.approved_by IS NOT DISTINCT FROM OLD.approved_by
      AND NEW.contractor_approved_at IS NOT DISTINCT FROM OLD.contractor_approved_at
    )
  THEN
    RAISE EXCEPTION 'Solo un superadministrador puede cambiar la aprobación.'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

-- 2. La cola de archivos acepta los nuevos tipos de objeto.
ALTER TABLE private.account_deletion_storage_queue
  DROP CONSTRAINT IF EXISTS account_deletion_storage_queue_object_kind_check;

ALTER TABLE private.account_deletion_storage_queue
  ADD CONSTRAINT account_deletion_storage_queue_object_kind_check
  CHECK (object_kind IN (
    'profile_document',
    'profile_media',
    'job_request_photo',
    'job_request_message_photo',
    'company_logo',
    'project_photo'
  ));

-- 3. Constancia de cada eliminación (sin datos personales).
CREATE TABLE IF NOT EXISTS private.account_deletion_records (
  user_id uuid PRIMARY KEY REFERENCES app_auth.users(id) ON DELETE CASCADE,
  deleted_at timestamptz NOT NULL DEFAULT now(),
  summary jsonb NOT NULL,
  retained jsonb NOT NULL DEFAULT '[]'::jsonb,
  retention_until date,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT account_deletion_records_retained_array
    CHECK (jsonb_typeof(retained) = 'array')
);

COMMENT ON TABLE private.account_deletion_records IS
  'Evidencia de eliminación de cuenta: conteos y categorías conservadas por obligación legal, sin datos personales.';

CREATE INDEX IF NOT EXISTS account_deletion_records_retention_idx
  ON private.account_deletion_records (retention_until)
  WHERE retention_until IS NOT NULL;

REVOKE ALL ON private.account_deletion_records FROM PUBLIC, contractor_api;

-- 4. Alcance de la eliminación para un usuario. Interna: no se concede a la API.
CREATE OR REPLACE FUNCTION private.account_deletion_scope(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_email text;
  v_blockers jsonb;
  v_closing uuid[];
  v_closing_json jsonb;
  v_linked_clients uuid[];
  v_client_invoices integer;
  v_client_credit_notes integer;
  v_client_payments integer;
  v_client_year integer;
  v_company_invoices integer;
  v_company_credit_notes integer;
  v_company_payments integer;
  v_company_year integer;
  v_company_clients integer;
  v_company_budgets integer;
  v_company_projects integer;
  v_retained jsonb := '[]'::jsonb;
  v_retention_until date;
BEGIN
  SELECT account.email INTO v_email
  FROM app_auth.users AS account
  WHERE account.id = p_user_id;

  -- Empresas que impiden eliminar: único propietario activo con otros
  -- miembros activos.
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'companyId', company.id,
           'companyName', company.name,
           'activeMembers', others.member_count
         ) ORDER BY company.name), '[]'::jsonb)
  INTO v_blockers
  FROM public.company_members AS membership
  JOIN public.companies AS company
    ON company.id = membership.company_id
   AND company.active
  CROSS JOIN LATERAL (
    SELECT count(*)::integer AS member_count
    FROM public.company_members AS other
    WHERE other.company_id = membership.company_id
      AND other.user_id <> p_user_id
      AND other.active
  ) AS others
  WHERE membership.user_id = p_user_id
    AND membership.active
    AND membership.role = 'owner'::public.company_role
    AND others.member_count > 0
    AND NOT EXISTS (
      SELECT 1
      FROM public.company_members AS co_owner
      WHERE co_owner.company_id = membership.company_id
        AND co_owner.user_id <> p_user_id
        AND co_owner.active
        AND co_owner.role = 'owner'::public.company_role
    );

  -- Empresas que se cierran: el usuario es el único miembro activo.
  SELECT COALESCE(array_agg(company.id ORDER BY company.created_at), ARRAY[]::uuid[]),
         COALESCE(jsonb_agg(jsonb_build_object(
           'companyId', company.id,
           'companyName', company.name
         ) ORDER BY company.created_at), '[]'::jsonb)
  INTO v_closing, v_closing_json
  FROM public.company_members AS membership
  JOIN public.companies AS company
    ON company.id = membership.company_id
   AND company.active
  WHERE membership.user_id = p_user_id
    AND membership.active
    AND membership.role = 'owner'::public.company_role
    AND NOT EXISTS (
      SELECT 1
      FROM public.company_members AS other
      WHERE other.company_id = membership.company_id
        AND other.user_id <> p_user_id
        AND other.active
    );

  SELECT COALESCE(array_agg(customer.id), ARRAY[]::uuid[])
  INTO v_linked_clients
  FROM public.clients AS customer
  WHERE customer.user_id = p_user_id;

  -- Documentos fiscales recibidos como cliente (empresas que siguen o no).
  SELECT count(*)::integer,
         max(extract(year FROM COALESCE(invoice.issue_date, invoice.created_at::date)))::integer
  INTO v_client_invoices, v_client_year
  FROM public.invoices AS invoice
  WHERE invoice.client_id = ANY (v_linked_clients)
    AND invoice.status <> 'draft'
    AND NOT (invoice.company_id = ANY (v_closing));

  SELECT count(*)::integer INTO v_client_credit_notes
  FROM public.invoice_credit_notes AS credit_note
  JOIN public.invoices AS invoice ON invoice.id = credit_note.invoice_id
  WHERE invoice.client_id = ANY (v_linked_clients)
    AND NOT (invoice.company_id = ANY (v_closing));

  SELECT count(*)::integer INTO v_client_payments
  FROM public.invoice_payments AS payment
  JOIN public.invoices AS invoice ON invoice.id = payment.invoice_id
  WHERE invoice.client_id = ANY (v_linked_clients)
    AND NOT (invoice.company_id = ANY (v_closing));

  -- Documentos fiscales de las empresas que se cierran.
  SELECT count(*)::integer,
         max(extract(year FROM COALESCE(invoice.issue_date, invoice.created_at::date)))::integer
  INTO v_company_invoices, v_company_year
  FROM public.invoices AS invoice
  WHERE invoice.company_id = ANY (v_closing)
    AND invoice.status <> 'draft';

  SELECT count(*)::integer INTO v_company_credit_notes
  FROM public.invoice_credit_notes AS credit_note
  WHERE credit_note.company_id = ANY (v_closing);

  SELECT count(*)::integer INTO v_company_payments
  FROM public.invoice_payments AS payment
  WHERE payment.company_id = ANY (v_closing);

  SELECT count(*)::integer INTO v_company_clients
  FROM public.clients AS customer
  WHERE customer.company_id = ANY (v_closing);

  SELECT count(*)::integer INTO v_company_budgets
  FROM public.budgets AS budget
  WHERE budget.company_id = ANY (v_closing);

  SELECT count(*)::integer INTO v_company_projects
  FROM public.projects AS project
  WHERE project.company_id = ANY (v_closing);

  IF v_client_invoices > 0 THEN
    v_retained := v_retained || jsonb_build_array(jsonb_build_object(
      'category', 'client_fiscal_documents',
      'invoices', v_client_invoices,
      'creditNotes', v_client_credit_notes,
      'payments', v_client_payments,
      'retainUntil', make_date(v_client_year + 5, 12, 31)
    ));
  END IF;

  IF v_company_invoices > 0 THEN
    v_retained := v_retained || jsonb_build_array(jsonb_build_object(
      'category', 'closed_company_fiscal_documents',
      'invoices', v_company_invoices,
      'creditNotes', v_company_credit_notes,
      'payments', v_company_payments,
      'clients', v_company_clients,
      'budgets', v_company_budgets,
      'projects', v_company_projects,
      'retainUntil', make_date(v_company_year + 5, 12, 31)
    ));
  ELSIF v_company_clients + v_company_budgets + v_company_projects > 0 THEN
    v_retained := v_retained || jsonb_build_array(jsonb_build_object(
      'category', 'closed_company_records',
      'clients', v_company_clients,
      'budgets', v_company_budgets,
      'projects', v_company_projects,
      'retainUntil', NULL
    ));
  END IF;

  IF COALESCE(array_length(v_linked_clients, 1), 0) > 0 THEN
    v_retained := v_retained || jsonb_build_array(jsonb_build_object(
      'category', 'company_client_records',
      'clientRecords', (
        SELECT count(*)::integer
        FROM public.clients AS customer
        WHERE customer.id = ANY (v_linked_clients)
          AND NOT (customer.company_id = ANY (v_closing))
      ),
      'retainUntil', NULL
    ));
  END IF;

  v_retained := v_retained || jsonb_build_array(jsonb_build_object(
    'category', 'team_contributions',
    'projectPhotos', (
      SELECT count(*)::integer
      FROM public.project_photos AS photo
      WHERE photo.created_by = p_user_id
        AND NOT (photo.company_id = ANY (v_closing))
    ),
    'budgets', (
      SELECT count(*)::integer
      FROM public.budgets AS budget
      WHERE budget.created_by = p_user_id
        AND NOT (budget.company_id = ANY (v_closing))
    ),
    'retainUntil', NULL
  ));

  v_retained := v_retained || jsonb_build_array(jsonb_build_object(
    'category', 'security_records',
    'auditEntries', (
      SELECT count(*)::integer
      FROM public.admin_audit_logs AS audit_log
      WHERE audit_log.user_id = p_user_id
    ),
    'sessions', (
      SELECT count(*)::integer
      FROM app_auth.sessions AS session
      WHERE session.user_id = p_user_id
    ),
    'retainUntil', NULL
  ));

  SELECT max((item ->> 'retainUntil')::date)
  INTO v_retention_until
  FROM jsonb_array_elements(v_retained) AS item
  WHERE item ->> 'retainUntil' IS NOT NULL;

  RETURN jsonb_build_object(
    'blockers', v_blockers,
    'companiesToClose', v_closing_json,
    'membershipsToEnd', (
      SELECT count(*)::integer
      FROM public.company_members AS membership
      WHERE membership.user_id = p_user_id
        AND membership.active
        AND NOT (membership.company_id = ANY (v_closing))
    ),
    'toDelete', jsonb_build_object(
      'jobRequests', (
        SELECT count(*)::integer FROM public.job_requests AS request
        WHERE request.requester_id = p_user_id
      ),
      'jobRequestPhotos', (
        SELECT count(*)::integer
        FROM public.job_request_photos AS photo
        JOIN public.job_requests AS request ON request.id = photo.request_id
        WHERE request.requester_id = p_user_id
      ),
      'jobRequestMessages', (
        SELECT count(*)::integer
        FROM public.job_request_messages AS message
        JOIN public.job_requests AS request ON request.id = message.request_id
        WHERE request.requester_id = p_user_id
      ),
      'profileDocuments', (
        SELECT
          (profile.doc_id_url = 'profile-documents/' || p_user_id::text || '/identification')::integer
          + (profile.doc_operation_notice_url = 'profile-documents/' || p_user_id::text || '/operation_notice')::integer
          + (profile.doc_references_url = 'profile-documents/' || p_user_id::text || '/references')::integer
          + (profile.doc_address_proof_url = 'profile-documents/' || p_user_id::text || '/address_proof')::integer
        FROM (
          SELECT
            COALESCE(btrim(doc_id_url), '') AS doc_id_url,
            COALESCE(btrim(doc_operation_notice_url), '') AS doc_operation_notice_url,
            COALESCE(btrim(doc_references_url), '') AS doc_references_url,
            COALESCE(btrim(doc_address_proof_url), '') AS doc_address_proof_url
          FROM public.profiles
          WHERE id = p_user_id
        ) AS profile
      ),
      'notifications', (
        SELECT count(*)::integer FROM public.notifications AS notification
        WHERE notification.user_id = p_user_id
      ),
      'pushDevices', (
        SELECT count(*)::integer FROM public.user_push_tokens AS token
        WHERE token.user_id = p_user_id
      ),
      'personalPrices', (
        SELECT count(*)::integer FROM public.user_catalog_price_overrides AS override
        WHERE override.user_id = p_user_id
      ),
      'pendingPriceContributions', (
        SELECT count(*)::integer FROM public.catalog_price_contributions AS contribution
        WHERE contribution.user_id = p_user_id AND contribution.status = 'pending'
      ),
      'pendingConnectionRequests', (
        SELECT count(*)::integer FROM private.client_connection_requests AS connection
        WHERE connection.client_user_id = p_user_id AND connection.status = 'pending'
      ),
      'pendingInvitations', (
        SELECT count(*)::integer FROM public.company_invitations AS invitation
        WHERE invitation.status = 'pending'
          AND v_email IS NOT NULL
          AND lower(invitation.email) = lower(v_email)
      ),
      'closedCompanyProjectPhotos', (
        SELECT count(*)::integer FROM public.project_photos AS photo
        WHERE photo.company_id = ANY (v_closing)
      )
    ),
    'retained', v_retained,
    'retentionUntil', v_retention_until
  );
END;
$function$;

REVOKE ALL ON FUNCTION private.account_deletion_scope(uuid) FROM PUBLIC;

-- 5. Vista previa para la sesión actual (lo que se eliminará y conservará).
CREATE OR REPLACE FUNCTION private.account_deletion_preview()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_user_id uuid := app.current_user_id();
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Se requiere una sesión.' USING ERRCODE = '42501';
  END IF;

  RETURN private.account_deletion_scope(v_user_id);
END;
$function$;

REVOKE ALL ON FUNCTION private.account_deletion_preview() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.account_deletion_preview() TO contractor_api;

-- 6. Eliminación de la cuenta de la sesión actual.
CREATE OR REPLACE FUNCTION private.delete_own_account()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_user_id uuid := app.current_user_id();
  v_email text;
  v_deleted_at timestamptz;
  v_scope jsonb;
  v_closing uuid[];
  v_profile record;
  v_count integer;
  v_result jsonb := '{}'::jsonb;
  v_storage_queued integer;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Se requiere una sesión.' USING ERRCODE = '42501';
  END IF;

  SELECT account.email, account.deleted_at
  INTO v_email, v_deleted_at
  FROM app_auth.users AS account
  WHERE account.id = v_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'No se encontró la cuenta que se desea eliminar.'
      USING ERRCODE = 'P0002';
  END IF;

  IF v_deleted_at IS NOT NULL THEN
    RAISE EXCEPTION 'La cuenta ya fue eliminada.' USING ERRCODE = '55000';
  END IF;

  -- Bloquea las membresías para que nadie cambie la propiedad a mitad.
  PERFORM 1
  FROM public.company_members AS membership
  WHERE membership.company_id IN (
    SELECT own.company_id FROM public.company_members AS own
    WHERE own.user_id = v_user_id
  )
  FOR UPDATE;

  v_scope := private.account_deletion_scope(v_user_id);

  IF jsonb_array_length(v_scope -> 'blockers') > 0 THEN
    RAISE EXCEPTION 'Transfiere la propiedad de tus empresas antes de eliminar la cuenta.'
      USING ERRCODE = '55000',
            DETAIL = (v_scope -> 'blockers')::text,
            HINT = 'account_deletion_blocked_by_company_ownership';
  END IF;

  SELECT COALESCE(array_agg((item ->> 'companyId')::uuid), ARRAY[]::uuid[])
  INTO v_closing
  FROM jsonb_array_elements(v_scope -> 'companiesToClose') AS item;

  PERFORM pg_catalog.set_config('app.account_deletion_user_id', v_user_id::text, true);

  -- Archivos: se encolan antes de borrar las filas que guardan sus rutas.
  SELECT
    profile.doc_id_url,
    profile.doc_operation_notice_url,
    profile.doc_references_url,
    profile.doc_address_proof_url
  INTO v_profile
  FROM public.profiles AS profile
  WHERE profile.id = v_user_id;

  INSERT INTO private.account_deletion_storage_queue AS queue (user_id, object_key, object_kind)
  SELECT v_user_id, object.object_key, object.object_kind
  FROM (
    SELECT 'profile-documents/' || v_user_id::text || '/' || document.document_type AS object_key,
           'profile_document' AS object_kind
    FROM (VALUES
      ('identification', v_profile.doc_id_url),
      ('operation_notice', v_profile.doc_operation_notice_url),
      ('references', v_profile.doc_references_url),
      ('address_proof', v_profile.doc_address_proof_url)
    ) AS document(document_type, stored_reference)
    WHERE btrim(COALESCE(document.stored_reference, ''))
      = 'profile-documents/' || v_user_id::text || '/' || document.document_type

    UNION
    -- Foto de perfil y logo del perfil: rutas fijas y públicas. Borrar una
    -- clave inexistente no falla.
    SELECT 'profile-media/' || v_user_id::text || '/' || media.media_type, 'profile_media'
    FROM (VALUES ('avatar'), ('company-logo')) AS media(media_type)

    UNION
    SELECT photo.storage_path, 'job_request_photo'
    FROM public.job_request_photos AS photo
    JOIN public.job_requests AS request ON request.id = photo.request_id
    WHERE request.requester_id = v_user_id

    UNION
    SELECT message.photo_storage_path, 'job_request_message_photo'
    FROM public.job_request_messages AS message
    JOIN public.job_requests AS request ON request.id = message.request_id
    WHERE request.requester_id = v_user_id
      AND message.photo_storage_path IS NOT NULL

    UNION
    SELECT 'company-logos/' || company_id::text || '/logo', 'company_logo'
    FROM unnest(v_closing) AS company_id

    UNION
    SELECT photo.storage_path, 'project_photo'
    FROM public.project_photos AS photo
    WHERE photo.company_id = ANY (v_closing)
  ) AS object
  WHERE length(btrim(object.object_key)) > 0
  ON CONFLICT (user_id, object_key)
  DO UPDATE SET
    status = CASE WHEN queue.completed_at IS NULL THEN queue.status ELSE 'pending' END,
    completed_at = NULL,
    next_attempt_at = now(),
    updated_at = now();

  -- Peticiones de trabajo: la petición, la dirección exacta, las fotos y las
  -- conversaciones son del cliente. Los presupuestos, obras y fichas de
  -- cliente que cada empresa creó quedan en su espacio.
  DELETE FROM public.job_requests WHERE requester_id = v_user_id;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_result := v_result || jsonb_build_object('jobRequests', v_count);

  UPDATE private.client_connection_requests
  SET status = 'cancelled',
      phone_to_confirm = NULL,
      phone_code = NULL,
      updated_at = now()
  WHERE client_user_id = v_user_id
    AND status = 'pending';
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_result := v_result || jsonb_build_object('connectionRequestsCancelled', v_count);

  UPDATE public.clients
  SET user_id = NULL,
      updated_at = now()
  WHERE user_id = v_user_id;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_result := v_result || jsonb_build_object('clientLinksRemoved', v_count);

  IF v_email IS NOT NULL THEN
    UPDATE public.company_invitations
    SET status = 'revoked',
        updated_at = now()
    WHERE status = 'pending'
      AND lower(email) = lower(v_email);
    GET DIAGNOSTICS v_count = ROW_COUNT;
  ELSE
    v_count := 0;
  END IF;
  v_result := v_result || jsonb_build_object('invitationsRevoked', v_count);

  -- Empresas: las de un solo miembro se cierran; en las demás termina la
  -- membresía (el disparador exige que quede otro propietario).
  DELETE FROM public.project_photos WHERE company_id = ANY (v_closing);
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_result := v_result || jsonb_build_object('closedCompanyProjectPhotos', v_count);

  UPDATE public.companies
  SET active = false,
      logo_url = NULL,
      updated_at = now()
  WHERE id = ANY (v_closing);
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_result := v_result || jsonb_build_object('companiesClosed', v_count);

  UPDATE public.company_members
  SET active = false,
      updated_at = now()
  WHERE user_id = v_user_id
    AND active
    AND NOT (company_id = ANY (v_closing));
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_result := v_result || jsonb_build_object('membershipsEnded', v_count);

  DELETE FROM public.project_members
  WHERE user_id = v_user_id
    AND NOT (company_id = ANY (v_closing));

  -- Datos personales sin obligación de conservación.
  DELETE FROM public.notifications WHERE user_id = v_user_id;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_result := v_result || jsonb_build_object('notifications', v_count);

  DELETE FROM public.user_push_tokens WHERE user_id = v_user_id;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_result := v_result || jsonb_build_object('pushDevices', v_count);

  DELETE FROM public.user_catalog_price_overrides WHERE user_id = v_user_id;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_result := v_result || jsonb_build_object('personalPrices', v_count);

  DELETE FROM public.user_price_regions WHERE user_id = v_user_id;

  DELETE FROM public.catalog_price_contributions
  WHERE user_id = v_user_id AND status = 'pending';
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_result := v_result || jsonb_build_object('pendingPriceContributions', v_count);

  -- Los aportes ya revisados quedan como dato de precio (insumo, costo,
  -- tienda); se borra la nota libre.
  UPDATE public.catalog_price_contributions
  SET notes = NULL, updated_at = now()
  WHERE user_id = v_user_id AND notes IS NOT NULL;

  UPDATE public.profiles
  SET full_name = NULL,
      phone = NULL,
      active = false,
      avatar_url = NULL,
      first_name = NULL,
      last_name = NULL,
      province = NULL,
      district = NULL,
      corregimiento = NULL,
      terms_accepted = false,
      notifications_opt_in = false,
      registration_ip = NULL,
      registration_device = NULL,
      business_name = NULL,
      id_document = NULL,
      tax_id = NULL,
      tax_dv = NULL,
      primary_category = NULL,
      specialties = NULL,
      experience_years = NULL,
      work_areas = NULL,
      professional_description = NULL,
      company_logo_url = NULL,
      portfolio_urls = NULL,
      certifications = NULL,
      availability = NULL,
      preferred_contact_method = NULL,
      emits_invoice = false,
      has_transport = false,
      work_mode = NULL,
      doc_id_url = NULL,
      doc_operation_notice_url = NULL,
      doc_technical_certs_urls = NULL,
      doc_references_url = NULL,
      doc_address_proof_url = NULL,
      updated_at = now()
  WHERE id = v_user_id;

  UPDATE app_auth.identities
  SET provider_id = 'deleted:' || id::text,
      identity_data = '{}'::jsonb,
      last_sign_in_at = NULL,
      updated_at = now()
  WHERE user_id = v_user_id;

  UPDATE app_auth.tokens
  SET token_hash = 'revoked:' || id::text,
      used_at = COALESCE(used_at, now())
  WHERE user_id = v_user_id;

  UPDATE app_auth.sessions
  SET refresh_token_hash = 'revoked:' || id::text,
      user_agent = NULL,
      ip_address = NULL,
      revoked_at = COALESCE(revoked_at, now())
  WHERE user_id = v_user_id;

  UPDATE app_auth.users
  SET email = NULL,
      password_hash = NULL,
      email_confirmed_at = NULL,
      last_sign_in_at = NULL,
      raw_app_meta_data = '{}'::jsonb,
      raw_user_meta_data = '{}'::jsonb,
      deleted_at = now(),
      updated_at = now()
  WHERE id = v_user_id
  RETURNING deleted_at INTO v_deleted_at;

  SELECT count(*)::integer INTO v_storage_queued
  FROM private.account_deletion_storage_queue AS queue
  WHERE queue.user_id = v_user_id
    AND queue.completed_at IS NULL;

  v_result := jsonb_build_object(
    'deletedAt', v_deleted_at,
    'deleted', v_result,
    'storageObjectsQueued', v_storage_queued,
    'retained', v_scope -> 'retained',
    'retentionUntil', v_scope -> 'retentionUntil'
  );

  INSERT INTO private.account_deletion_records (
    user_id, deleted_at, summary, retained, retention_until
  )
  VALUES (
    v_user_id,
    v_deleted_at,
    v_result - 'retained',
    v_scope -> 'retained',
    (v_scope ->> 'retentionUntil')::date
  )
  ON CONFLICT (user_id) DO UPDATE SET
    deleted_at = EXCLUDED.deleted_at,
    summary = EXCLUDED.summary,
    retained = EXCLUDED.retained,
    retention_until = EXCLUDED.retention_until;

  RETURN v_result;
END;
$function$;

REVOKE ALL ON FUNCTION private.delete_own_account() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.delete_own_account() TO contractor_api;

-- 7. Solicitudes de vinculación del usuario para la exportación (sin el
--    código de confirmación).
CREATE OR REPLACE FUNCTION private.export_own_connection_requests()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'id', connection.id,
           'companyId', connection.company_id,
           'companyName', company.name,
           'requestedByClient', connection.requested_by_client,
           'status', connection.status,
           'createdAt', connection.created_at,
           'updatedAt', connection.updated_at
         ) ORDER BY connection.created_at), '[]'::jsonb)
  FROM private.client_connection_requests AS connection
  LEFT JOIN public.companies AS company ON company.id = connection.company_id
  WHERE connection.client_user_id = app.current_user_id();
$function$;

REVOKE ALL ON FUNCTION private.export_own_connection_requests() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.export_own_connection_requests() TO contractor_api;

RESET ROLE;

COMMIT;
