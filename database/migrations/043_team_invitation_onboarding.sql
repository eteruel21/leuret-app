BEGIN;

SET ROLE contractor_owner;

ALTER TABLE public.profiles
  ADD COLUMN contractor_requested_at timestamptz,
  ADD COLUMN contractor_approved_at timestamptz;

-- Conserva la aprobación profesional de los contratistas existentes.
UPDATE public.profiles
SET contractor_approved_at = approved_at
WHERE role = 'contractor' AND approved_at IS NOT NULL;

CREATE FUNCTION private.can_create_independent_company()
RETURNS boolean
LANGUAGE sql STABLE
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles AS profile
    JOIN app_auth.users AS account ON account.id = profile.id
    WHERE profile.id = app.current_user_id()
      AND profile.active
      AND profile.approved_at IS NOT NULL
      AND profile.role IN ('contractor', 'client')
      AND profile.contractor_approved_at IS NOT NULL
      AND account.email_confirmed_at IS NOT NULL
      AND account.deleted_at IS NULL
  );
$$;

CREATE OR REPLACE FUNCTION private.is_active_contractor()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT private.is_active_platform_user() AND EXISTS (
    SELECT 1
    FROM public.profiles AS profile
    WHERE profile.id = app.current_user_id()
      AND (
        profile.role = 'contractor'
        OR (profile.role = 'client' AND EXISTS (
          SELECT 1
          FROM public.company_members AS member
          JOIN public.companies AS company ON company.id = member.company_id AND company.active
          WHERE member.user_id = profile.id AND member.active
            AND member.role IN ('owner', 'admin', 'sales', 'estimator')
        ))
      )
  );
$$;

-- El único dato nuevo que habilita la creación de empresas solo lo puede
-- modificar un superadministrador, incluso usando el rol de conexión de la API.
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
  THEN
    RAISE EXCEPTION 'Solo un superadministrador puede cambiar la aprobación.'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER protect_profile_approval ON public.profiles;
CREATE TRIGGER protect_profile_approval
BEFORE UPDATE OF active, approved_at, approved_by, contractor_approved_at ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.prevent_unauthorized_profile_approval_change();

CREATE OR REPLACE FUNCTION public.create_company(
  company_name text, company_phone text DEFAULT NULL, company_email text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  new_company_id uuid;
  clean_name text := btrim(company_name);
  actor_id uuid := app.current_user_id();
BEGIN
  IF NOT private.can_create_independent_company() THEN
    RAISE EXCEPTION 'Tu cuenta debe estar aprobada como contratista para crear una empresa.'
      USING ERRCODE = '42501';
  END IF;
  IF clean_name IS NULL OR char_length(clean_name) < 2 THEN
    RAISE EXCEPTION 'El nombre de la empresa es obligatorio.' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.companies (name, phone, email, created_by)
  VALUES (clean_name, NULLIF(btrim(company_phone), ''), NULLIF(lower(btrim(company_email)), ''), actor_id)
  RETURNING id INTO new_company_id;

  INSERT INTO public.company_members (company_id, user_id, role, active)
  VALUES (new_company_id, actor_id, 'owner', true);

  INSERT INTO public.document_sequences (
    company_id, document_type, prefix, current_number, padding, yearly_reset, last_reset_year
  ) VALUES
    (new_company_id, 'budget', 'COT', 0, 6, false, extract(year FROM now())::integer),
    (new_company_id, 'invoice', 'FAC', 0, 6, false, extract(year FROM now())::integer);

  RETURN new_company_id;
END;
$$;

-- La bandeja y la aceptación usan el correo verificado de la sesión.
CREATE FUNCTION private.list_received_company_invitations()
RETURNS TABLE (
  id uuid, company_id uuid, company_name text, role public.company_role, expires_at timestamptz
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT invitation.id, invitation.company_id, company.name, invitation.role, invitation.expires_at
  FROM app_auth.users AS account
  JOIN public.profiles AS profile ON profile.id = account.id
  JOIN public.company_invitations AS invitation ON lower(invitation.email) = lower(account.email)
  JOIN public.companies AS company ON company.id = invitation.company_id AND company.active
  WHERE account.id = app.current_user_id()
    AND account.email_confirmed_at IS NOT NULL
    AND account.deleted_at IS NULL
    AND profile.role IN ('contractor', 'client')
    AND ((profile.active AND profile.approved_at IS NOT NULL)
         OR (profile.role = 'contractor' AND NOT profile.active AND profile.approved_at IS NULL))
    AND invitation.status = 'pending'
    AND invitation.expires_at > now()
    AND invitation.role <> 'owner'
  ORDER BY invitation.created_at DESC, invitation.id;
$$;

CREATE FUNCTION private.company_invitation_recipient(p_invitation_id uuid)
RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT account.id
  FROM public.company_invitations AS invitation
  JOIN app_auth.users AS account ON lower(account.email) = lower(invitation.email)
  JOIN public.profiles AS profile ON profile.id = account.id
  WHERE invitation.id = p_invitation_id AND invitation.status = 'pending'
    AND invitation.invited_by = app.current_user_id()
    AND invitation.expires_at > now()
    AND public.is_company_admin(invitation.company_id)
    AND profile.active AND profile.notifications_opt_in
    AND account.email_confirmed_at IS NOT NULL AND account.deleted_at IS NULL;
$$;

CREATE FUNCTION private.accept_company_invitation(p_token_hash text, p_invitation_id uuid)
RETURNS TABLE (accepted_invitation_id uuid, accepted_company_id uuid)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  actor_id uuid := app.current_user_id();
  actor_email text;
  selected_invitation public.company_invitations%ROWTYPE;
BEGIN
  IF (p_token_hash IS NULL) = (p_invitation_id IS NULL)
    OR (p_token_hash IS NOT NULL AND p_token_hash !~ '^[0-9a-f]{64}$') THEN
    RETURN;
  END IF;

  SELECT lower(account.email)
  INTO actor_email
  FROM app_auth.users AS account
  JOIN public.profiles AS profile ON profile.id = account.id
  WHERE account.id = actor_id
    AND account.email_confirmed_at IS NOT NULL
    AND account.deleted_at IS NULL
    AND profile.role IN ('contractor', 'client')
    AND ((profile.active AND profile.approved_at IS NOT NULL)
         OR (profile.role = 'contractor' AND NOT profile.active AND profile.approved_at IS NULL))
  FOR UPDATE OF profile;

  IF actor_email IS NULL THEN RETURN; END IF;

  SELECT invitation.*
  INTO selected_invitation
  FROM public.company_invitations AS invitation
  JOIN public.companies AS company ON company.id = invitation.company_id AND company.active
  WHERE ((p_token_hash IS NOT NULL AND invitation.token_hash = p_token_hash)
         OR (p_invitation_id IS NOT NULL AND invitation.id = p_invitation_id))
    AND lower(invitation.email) = actor_email
    AND invitation.status = 'pending'
    AND invitation.expires_at > now()
    AND invitation.role <> 'owner'
  FOR UPDATE OF invitation;

  IF NOT FOUND THEN RETURN; END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.company_members AS inviter
    JOIN public.profiles AS profile ON profile.id = inviter.user_id
    JOIN app_auth.users AS account ON account.id = inviter.user_id
    WHERE inviter.company_id = selected_invitation.company_id
      AND inviter.user_id = selected_invitation.invited_by
      AND inviter.active AND inviter.role IN ('owner', 'admin')
      AND profile.active AND profile.approved_at IS NOT NULL
      AND account.email_confirmed_at IS NOT NULL AND account.deleted_at IS NULL
  ) THEN
    RETURN;
  END IF;

  INSERT INTO public.company_members AS member (company_id, user_id, role, active)
  VALUES (selected_invitation.company_id, actor_id, selected_invitation.role, true)
  ON CONFLICT ON CONSTRAINT company_members_unique DO UPDATE
  SET role = CASE WHEN member.role = 'owner' THEN member.role ELSE EXCLUDED.role END,
      active = true, updated_at = now();

  -- La empresa autoriza el acceso con el rol que eligió. Solo un
  -- superadministrador puede habilitar el espacio de contratista propio.
  UPDATE public.profiles
  SET active = true, approved_at = now()
  WHERE id = actor_id AND role = 'contractor' AND NOT active AND approved_at IS NULL;

  UPDATE public.company_invitations SET status = 'accepted', updated_at = now()
  WHERE id = selected_invitation.id;

  INSERT INTO public.admin_audit_logs (company_id, user_id, action, target_type, target_id, metadata)
  VALUES (
    selected_invitation.company_id, actor_id, 'INVITATION_ACCEPTED', 'company_invitation',
    selected_invitation.id::text,
    jsonb_build_object('email', selected_invitation.email, 'role', selected_invitation.role)
  );

  RETURN QUERY SELECT selected_invitation.id, selected_invitation.company_id;
END;
$$;

CREATE OR REPLACE FUNCTION private.accept_company_invitation(p_token_hash text)
RETURNS TABLE (accepted_invitation_id uuid, accepted_company_id uuid)
LANGUAGE sql
SET search_path = ''
AS $$
  SELECT * FROM private.accept_company_invitation(p_token_hash, NULL::uuid);
$$;

REVOKE ALL ON FUNCTION private.can_create_independent_company(),
  private.list_received_company_invitations(), private.company_invitation_recipient(uuid),
  private.accept_company_invitation(text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.can_create_independent_company(),
  private.list_received_company_invitations(), private.company_invitation_recipient(uuid),
  private.accept_company_invitation(text, uuid) TO contractor_api, contractor_migrator;

-- Una misma cuenta puede participar como cliente y también gestionar
-- vinculaciones para la empresa en la que tiene un rol autorizado.
CREATE OR REPLACE FUNCTION private.can_manage_client_connections(p_company_id uuid)
RETURNS boolean
LANGUAGE sql STABLE
SET search_path = ''
AS $$
  SELECT private.is_active_platform_user()
    AND public.has_company_role(p_company_id, ARRAY['owner', 'admin', 'sales']::public.company_role[]);
$$;

CREATE OR REPLACE FUNCTION private.create_client_connection_request(
  p_company_id uuid, p_client_id uuid, p_email text, p_phone text
)
RETURNS TABLE (outcome text, request_id uuid, notify_user_ids uuid[])
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  actor_id uuid := app.current_user_id();
  actor_role public.global_user_role;
  from_client boolean;
  company uuid := p_company_id;
  customer_id uuid := p_client_id;
  customer_user_id uuid;
  contact_email text := nullif(lower(btrim(p_email)), '');
  contact_phone text := private.normalize_connection_phone(p_phone);
  verified_email text;
  phone_to_confirm text;
  matches uuid[];
  customer public.clients%ROWTYPE;
  pending_id uuid;
BEGIN
  IF actor_id IS NULL OR NOT private.is_active_platform_user() THEN
    RETURN QUERY SELECT 'forbidden'::text, NULL::uuid, NULL::uuid[];
    RETURN;
  END IF;
  SELECT profile.role INTO actor_role FROM public.profiles AS profile WHERE profile.id = actor_id;
  from_client := actor_role = 'client' AND p_company_id IS NULL;

  IF from_client THEN
    IF p_client_id IS NOT NULL THEN
      RETURN QUERY SELECT 'forbidden'::text, NULL::uuid, NULL::uuid[];
      RETURN;
    END IF;
    customer_user_id := actor_id;
    SELECT ARRAY(
      SELECT candidate.id
      FROM public.companies AS candidate
      WHERE candidate.active AND (
        lower(btrim(candidate.email)) = contact_email
        OR (candidate.phone IS NOT NULL AND private.normalize_connection_phone(candidate.phone) = contact_phone)
        OR EXISTS (
          SELECT 1
          FROM public.company_members AS owner
          JOIN public.profiles AS profile ON profile.id = owner.user_id
          JOIN app_auth.users AS account ON account.id = owner.user_id
          WHERE owner.company_id = candidate.id AND owner.active AND owner.role = 'owner'
            AND (profile.role = 'contractor' OR profile.contractor_approved_at IS NOT NULL)
            AND profile.active AND profile.approved_at IS NOT NULL
            AND account.email_confirmed_at IS NOT NULL AND account.deleted_at IS NULL
            AND (lower(account.email) = contact_email
                 OR private.normalize_connection_phone(profile.phone) = contact_phone)
        )
      ) LIMIT 2
    ) INTO matches;
    company := matches[1];
  ELSE
    IF actor_role NOT IN ('contractor', 'client') OR NOT private.can_manage_client_connections(company)
       OR NOT EXISTS (SELECT 1 FROM public.companies AS candidate WHERE candidate.id = company AND candidate.active) THEN
      RETURN QUERY SELECT 'forbidden'::text, NULL::uuid, NULL::uuid[];
      RETURN;
    END IF;

    -- Dar prioridad al correo confirmado cuando se proporcionan ambos datos.
    SELECT ARRAY(
      SELECT account.id FROM app_auth.users AS account
      JOIN public.profiles AS profile ON profile.id = account.id
      WHERE lower(account.email) = contact_email AND account.deleted_at IS NULL AND account.id <> actor_id
        AND account.email_confirmed_at IS NOT NULL AND profile.role = 'client'
        AND profile.active AND profile.approved_at IS NOT NULL
    ) INTO matches;
    IF cardinality(matches) = 0 AND contact_phone IS NOT NULL THEN
      SELECT ARRAY(
        SELECT profile.id FROM public.profiles AS profile
        JOIN app_auth.users AS account ON account.id = profile.id
        WHERE profile.role = 'client' AND profile.active AND profile.approved_at IS NOT NULL AND profile.id <> actor_id
          AND profile.phone IS NOT NULL AND private.normalize_connection_phone(profile.phone) = contact_phone
          AND account.email_confirmed_at IS NOT NULL AND account.deleted_at IS NULL
        LIMIT 2
      ) INTO matches;
      phone_to_confirm := contact_phone;
    END IF;
    customer_user_id := matches[1];
  END IF;

  IF cardinality(matches) <> 1 THEN
    RETURN QUERY SELECT CASE WHEN cardinality(matches) = 0 THEN 'not_found'
      WHEN from_client THEN 'ambiguous_company' ELSE 'ambiguous' END,
      NULL::uuid, NULL::uuid[];
    RETURN;
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(company::text || '/' || customer_user_id::text, 41));

  IF NOT from_client THEN
    SELECT lower(account.email) INTO verified_email FROM app_auth.users AS account WHERE account.id = customer_user_id;
    IF customer_id IS NULL THEN
      SELECT ARRAY(
        SELECT existing.id FROM public.clients AS existing
        WHERE existing.company_id = company AND existing.active AND lower(btrim(existing.email)) = verified_email
        LIMIT 2
      ) INTO matches;
      IF cardinality(matches) = 0 AND phone_to_confirm IS NOT NULL THEN
        SELECT ARRAY(
          SELECT existing.id FROM public.clients AS existing
          WHERE existing.company_id = company AND existing.active
            AND phone_to_confirm IN (private.normalize_connection_phone(existing.phone),
              private.normalize_connection_phone(existing.secondary_phone))
          LIMIT 2
        ) INTO matches;
      END IF;
      IF cardinality(matches) > 1 THEN
        RETURN QUERY SELECT 'ambiguous_record'::text, NULL::uuid, NULL::uuid[];
        RETURN;
      END IF;
      customer_id := matches[1];
    END IF;

    IF customer_id IS NOT NULL THEN
      SELECT existing.* INTO customer FROM public.clients AS existing
      WHERE existing.id = customer_id AND existing.company_id = company AND existing.active;
      IF NOT FOUND OR (customer.user_id IS NOT NULL AND customer.user_id <> customer_user_id) THEN
        RETURN QUERY SELECT 'unavailable_record'::text, NULL::uuid, NULL::uuid[];
        RETURN;
      END IF;
      IF lower(btrim(customer.email)) = verified_email THEN
        phone_to_confirm := NULL;
      ELSIF phone_to_confirm IS NULL OR NOT coalesce(phone_to_confirm IN (
        private.normalize_connection_phone(customer.phone), private.normalize_connection_phone(customer.secondary_phone)
      ), false) THEN
        RETURN QUERY SELECT 'unavailable_record'::text, NULL::uuid, NULL::uuid[];
        RETURN;
      END IF;
    END IF;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.clients AS existing
    WHERE existing.company_id = company AND existing.user_id = customer_user_id AND existing.active
      AND (customer_id IS NULL OR existing.id = customer_id)
  ) THEN
    RETURN QUERY SELECT 'linked'::text, NULL::uuid, NULL::uuid[];
    RETURN;
  END IF;

  SELECT pending.id INTO pending_id FROM private.client_connection_requests AS pending
  WHERE pending.company_id = company AND pending.client_user_id = customer_user_id AND pending.status = 'pending';
  IF FOUND THEN
    RETURN QUERY SELECT 'pending'::text, pending_id, NULL::uuid[];
    RETURN;
  END IF;

  INSERT INTO private.client_connection_requests AS request (
    company_id, client_user_id, requested_by, requested_by_client, client_id, phone_to_confirm, phone_code
  ) VALUES (
    company, customer_user_id, actor_id, from_client, customer_id, phone_to_confirm,
    CASE WHEN phone_to_confirm IS NOT NULL THEN left(replace(gen_random_uuid()::text, '-', ''), 12) END
  ) RETURNING request.id INTO pending_id;

  RETURN QUERY SELECT 'sent'::text, pending_id,
    CASE WHEN from_client THEN ARRAY(
      SELECT DISTINCT member.user_id FROM public.company_members AS member
      JOIN public.profiles AS profile ON profile.id = member.user_id
      JOIN app_auth.users AS account ON account.id = member.user_id
      WHERE member.company_id = company AND member.active AND member.role IN ('owner', 'admin', 'sales')
        AND profile.active AND profile.approved_at IS NOT NULL
        AND account.email_confirmed_at IS NOT NULL AND account.deleted_at IS NULL
    ) ELSE ARRAY[customer_user_id] END;
END;
$$;

CREATE FUNCTION private.list_client_connection_requests(p_as_client boolean)
RETURNS TABLE (
  id uuid, company_id uuid, client_id uuid, name text, incoming boolean, status text,
  requires_phone_code boolean, phone_code text, phone_to_confirm text, created_at timestamptz
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT request.id, request.company_id, CASE WHEN NOT viewer.is_client THEN request.client_id END,
    CASE WHEN viewer.is_client THEN company.name ELSE coalesce(
      nullif(btrim(customer.business_name), ''),
      nullif(btrim(concat_ws(' ', customer.first_name, customer.last_name)), ''),
      CASE WHEN request.requested_by_client OR request.status = 'accepted'
        THEN nullif(btrim(profile.full_name), '') END,
      'Cliente Leuret'
    ) END,
    viewer.is_client <> request.requested_by_client, request.status,
    request.phone_code IS NOT NULL,
    CASE WHEN NOT viewer.is_client THEN request.phone_code END,
    CASE WHEN NOT viewer.is_client THEN request.phone_to_confirm END,
    request.created_at
  FROM private.client_connection_requests AS request
  JOIN public.companies AS company ON company.id = request.company_id AND company.active
  JOIN public.profiles AS profile ON profile.id = request.client_user_id AND profile.role = 'client'
    AND profile.active AND profile.approved_at IS NOT NULL
  JOIN app_auth.users AS account ON account.id = request.client_user_id AND account.deleted_at IS NULL
    AND account.email_confirmed_at IS NOT NULL
  LEFT JOIN public.clients AS customer ON customer.id = request.client_id AND customer.company_id = request.company_id
  CROSS JOIN LATERAL (SELECT request.client_user_id = app.current_user_id() AS is_client) AS viewer
  WHERE (SELECT private.is_active_platform_user())
    AND (p_as_client IS NULL OR p_as_client = viewer.is_client)
    AND (viewer.is_client OR private.can_manage_client_connections(request.company_id))
  ORDER BY (request.status = 'pending') DESC, request.updated_at DESC;
$$;

CREATE OR REPLACE FUNCTION private.respond_to_client_connection_request(p_id uuid, p_action text, p_phone_code text)
RETURNS text
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  actor_id uuid := app.current_user_id();
  request private.client_connection_requests%ROWTYPE;
  actor_is_client boolean;
  new_status text;
  customer public.clients%ROWTYPE;
  customer_profile public.profiles%ROWTYPE;
  verified_email text;
  matching_clients uuid[];
BEGIN
  IF actor_id IS NULL OR NOT private.is_active_platform_user() THEN RETURN 'not_found'; END IF;
  SELECT existing.* INTO request FROM private.client_connection_requests AS existing WHERE existing.id = p_id;
  IF NOT FOUND THEN RETURN 'not_found'; END IF;

  actor_is_client := request.client_user_id = actor_id;
  IF NOT actor_is_client AND NOT private.can_manage_client_connections(request.company_id) THEN RETURN 'not_found'; END IF;
  IF (p_action = 'cancel' AND actor_is_client <> request.requested_by_client)
     OR (p_action IN ('accept', 'reject') AND actor_is_client = request.requested_by_client) THEN
    RETURN 'forbidden';
  END IF;
  new_status := CASE p_action WHEN 'accept' THEN 'accepted' WHEN 'reject' THEN 'rejected' WHEN 'cancel' THEN 'cancelled' END;
  IF new_status IS NULL THEN RETURN 'forbidden'; END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(request.company_id::text || '/' || request.client_user_id::text, 41));
  SELECT existing.* INTO request FROM private.client_connection_requests AS existing WHERE existing.id = p_id FOR UPDATE;
  IF NOT FOUND THEN RETURN 'not_found'; END IF;
  IF request.status <> 'pending' THEN
    IF request.status = new_status THEN RETURN new_status; END IF;
    RETURN 'resolved';
  END IF;

  IF p_action = 'accept' THEN
    IF NOT EXISTS (SELECT 1 FROM public.companies AS company WHERE company.id = request.company_id AND company.active) THEN
      RETURN 'unavailable_record';
    END IF;
    IF NOT request.requested_by_client AND NOT EXISTS (
      SELECT 1 FROM public.company_members AS member
      JOIN public.profiles AS profile ON profile.id = member.user_id
      JOIN app_auth.users AS account ON account.id = member.user_id
      WHERE member.company_id = request.company_id AND member.user_id = request.requested_by
        AND member.active AND member.role IN ('owner', 'admin', 'sales')
        AND profile.active AND profile.approved_at IS NOT NULL
        AND account.email_confirmed_at IS NOT NULL AND account.deleted_at IS NULL
    ) THEN RETURN 'unavailable_record'; END IF;
    SELECT profile.* INTO customer_profile FROM public.profiles AS profile
    WHERE profile.id = request.client_user_id AND profile.role = 'client' AND profile.active AND profile.approved_at IS NOT NULL;
    SELECT lower(account.email) INTO verified_email FROM app_auth.users AS account
    WHERE account.id = request.client_user_id AND account.deleted_at IS NULL AND account.email_confirmed_at IS NOT NULL;
    IF customer_profile.id IS NULL OR verified_email IS NULL THEN RETURN 'unavailable_record'; END IF;

    IF request.phone_code IS NOT NULL THEN
      IF lower(btrim(p_phone_code)) IS DISTINCT FROM request.phone_code THEN RETURN 'invalid_code'; END IF;
      IF private.normalize_connection_phone(customer_profile.phone) IS DISTINCT FROM request.phone_to_confirm THEN
        RETURN 'unavailable_record';
      END IF;
    END IF;

    IF request.client_id IS NULL THEN
      SELECT existing.id INTO request.client_id FROM public.clients AS existing
      WHERE existing.company_id = request.company_id AND existing.user_id = request.client_user_id AND existing.active
      ORDER BY existing.created_at, existing.id LIMIT 1;

      -- El teléfono escrito en un perfil de cliente no verifica su identidad.
      -- Solo el correo confirmado puede seleccionar una ficha existente aquí.
      IF request.client_id IS NULL THEN
        SELECT ARRAY(
          SELECT existing.id FROM public.clients AS existing
          WHERE existing.company_id = request.company_id AND existing.active AND existing.user_id IS NULL
            AND lower(btrim(existing.email)) = verified_email
          LIMIT 2
        ) INTO matching_clients;
        IF cardinality(matching_clients) = 1 THEN request.client_id := matching_clients[1]; END IF;
      END IF;
    END IF;

    IF request.client_id IS NOT NULL THEN
      SELECT existing.* INTO customer FROM public.clients AS existing
      WHERE existing.id = request.client_id AND existing.company_id = request.company_id AND existing.active FOR UPDATE;
      IF NOT FOUND OR (customer.user_id IS NOT NULL AND customer.user_id <> request.client_user_id) THEN
        RETURN 'unavailable_record';
      END IF;
      IF customer.user_id IS NULL
         AND lower(btrim(customer.email)) IS DISTINCT FROM verified_email
         AND NOT coalesce(request.phone_to_confirm IN (private.normalize_connection_phone(customer.phone),
           private.normalize_connection_phone(customer.secondary_phone)), false) THEN
        RETURN 'unavailable_record';
      END IF;
      UPDATE public.clients SET user_id = request.client_user_id WHERE clients.id = customer.id;
    ELSE
      INSERT INTO public.clients (company_id, first_name, last_name, email, phone, user_id, created_by)
      VALUES (request.company_id, coalesce(nullif(btrim(customer_profile.first_name), ''), 'Cliente Leuret'),
        customer_profile.last_name, verified_email, customer_profile.phone, request.client_user_id,
        CASE WHEN request.requested_by_client THEN actor_id ELSE request.requested_by END)
      RETURNING clients.id INTO request.client_id;
    END IF;
  END IF;

  UPDATE private.client_connection_requests AS existing
  SET status = new_status, client_id = request.client_id, phone_code = NULL, phone_to_confirm = NULL, updated_at = now()
  WHERE existing.id = request.id;
  RETURN new_status;
END;
$$;

CREATE OR REPLACE FUNCTION private.list_client_connection_requests()
RETURNS TABLE (
  id uuid, company_id uuid, client_id uuid, name text, incoming boolean, status text,
  requires_phone_code boolean, phone_code text, phone_to_confirm text, created_at timestamptz
)
LANGUAGE sql STABLE
SET search_path = ''
AS $$
  SELECT * FROM private.list_client_connection_requests(NULL::boolean);
$$;

REVOKE ALL ON FUNCTION private.list_client_connection_requests(boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.list_client_connection_requests(boolean) TO contractor_api;

RESET ROLE;

COMMIT;
