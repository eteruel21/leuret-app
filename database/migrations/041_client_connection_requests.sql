BEGIN;

SET ROLE contractor_owner;

DROP TRIGGER IF EXISTS on_profile_created_link_client ON public.profiles;

-- Los vínculos existentes siguen usando clients.user_id. Solo la aceptación
-- de una solicitud nueva puede asignar esa columna desde la API.
REVOKE INSERT, UPDATE ON public.clients FROM contractor_api;
GRANT INSERT (
  id, company_id, client_type, first_name, last_name, business_name,
  document_type, document_number, email, phone, secondary_phone, notes,
  active, created_by, created_at, updated_at
) ON public.clients TO contractor_api;
GRANT UPDATE (
  id, company_id, client_type, first_name, last_name, business_name,
  document_type, document_number, email, phone, secondary_phone, notes,
  active, created_by, created_at, updated_at
) ON public.clients TO contractor_api;

CREATE TABLE private.client_connection_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  client_user_id uuid NOT NULL REFERENCES app_auth.users(id) ON DELETE CASCADE,
  requested_by uuid REFERENCES app_auth.users(id) ON DELETE SET NULL,
  requested_by_client boolean NOT NULL,
  client_id uuid REFERENCES public.clients(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'rejected', 'cancelled')),
  phone_to_confirm text,
  phone_code text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((phone_to_confirm IS NULL) = (phone_code IS NULL)),
  CHECK (phone_code IS NULL OR (status = 'pending' AND NOT requested_by_client))
);

CREATE UNIQUE INDEX client_connection_pending_pair_idx
  ON private.client_connection_requests (company_id, client_user_id) WHERE status = 'pending';
CREATE INDEX client_connection_company_idx ON private.client_connection_requests (company_id, updated_at DESC);
CREATE INDEX client_connection_user_idx ON private.client_connection_requests (client_user_id, updated_at DESC);
CREATE INDEX client_connection_client_idx ON private.client_connection_requests (client_id) WHERE client_id IS NOT NULL;

ALTER TABLE private.client_connection_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.client_connection_requests FROM PUBLIC, contractor_api;

CREATE FUNCTION private.normalize_connection_phone(value text)
RETURNS text
LANGUAGE sql IMMUTABLE STRICT
SET search_path = ''
AS $$
  WITH phone AS (SELECT regexp_replace(value, '[^0-9]', '', 'g') AS digits)
  SELECT CASE
    WHEN value !~ '^[+0-9().[:space:]-]+$' OR digits !~ '^[0-9]{7,17}$' THEN NULL
    WHEN digits ~ '^00[1-9][0-9]{6,14}$' THEN substring(digits FROM 3)
    WHEN digits ~ '^00' OR length(digits) > 15 THEN NULL
    WHEN digits ~ '^[0-9]{7,8}$' AND ltrim(value) NOT LIKE '+%' THEN '507' || digits
    ELSE digits
  END FROM phone;
$$;

CREATE INDEX profiles_connection_phone_idx ON public.profiles (private.normalize_connection_phone(phone))
  WHERE active AND approved_at IS NOT NULL AND phone IS NOT NULL;
CREATE INDEX companies_connection_phone_idx ON public.companies (private.normalize_connection_phone(phone))
  WHERE active AND phone IS NOT NULL;
CREATE INDEX companies_connection_email_idx ON public.companies (lower(btrim(email))) WHERE active;
CREATE INDEX clients_connection_email_idx ON public.clients (company_id, lower(btrim(email))) WHERE active;

CREATE FUNCTION private.can_manage_client_connections(p_company_id uuid)
RETURNS boolean
LANGUAGE sql STABLE
SET search_path = ''
AS $$
  SELECT EXISTS (SELECT 1 FROM public.profiles WHERE id = app.current_user_id() AND role = 'contractor')
    AND public.has_company_role(p_company_id, ARRAY['owner', 'admin', 'sales']::public.company_role[]);
$$;

CREATE FUNCTION private.create_client_connection_request(
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
  from_client := actor_role = 'client';

  IF from_client THEN
    IF p_company_id IS NOT NULL OR p_client_id IS NOT NULL THEN
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
            AND profile.role = 'contractor' AND profile.active AND profile.approved_at IS NOT NULL
            AND account.email_confirmed_at IS NOT NULL AND account.deleted_at IS NULL
            AND (lower(account.email) = contact_email
                 OR private.normalize_connection_phone(profile.phone) = contact_phone)
        )
      ) LIMIT 2
    ) INTO matches;
    company := matches[1];
  ELSE
    IF actor_role <> 'contractor' OR NOT private.can_manage_client_connections(company)
       OR NOT EXISTS (SELECT 1 FROM public.companies AS candidate WHERE candidate.id = company AND candidate.active) THEN
      RETURN QUERY SELECT 'forbidden'::text, NULL::uuid, NULL::uuid[];
      RETURN;
    END IF;

    -- Dar prioridad al correo confirmado cuando se proporcionan ambos datos.
    SELECT ARRAY(
      SELECT account.id FROM app_auth.users AS account
      JOIN public.profiles AS profile ON profile.id = account.id
      WHERE lower(account.email) = contact_email AND account.deleted_at IS NULL
        AND account.email_confirmed_at IS NOT NULL AND profile.role = 'client'
        AND profile.active AND profile.approved_at IS NOT NULL
    ) INTO matches;
    IF cardinality(matches) = 0 AND contact_phone IS NOT NULL THEN
      SELECT ARRAY(
        SELECT profile.id FROM public.profiles AS profile
        JOIN app_auth.users AS account ON account.id = profile.id
        WHERE profile.role = 'client' AND profile.active AND profile.approved_at IS NOT NULL
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
        AND profile.role = 'contractor' AND profile.active AND profile.approved_at IS NOT NULL
        AND account.email_confirmed_at IS NOT NULL AND account.deleted_at IS NULL
    ) ELSE ARRAY[customer_user_id] END;
END;
$$;

CREATE FUNCTION private.list_client_connection_requests()
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
    AND (viewer.is_client OR private.can_manage_client_connections(request.company_id))
  ORDER BY (request.status = 'pending') DESC, request.updated_at DESC;
$$;

CREATE FUNCTION private.respond_to_client_connection_request(p_id uuid, p_action text, p_phone_code text)
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
        AND profile.role = 'contractor' AND profile.active AND profile.approved_at IS NOT NULL
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

REVOKE ALL ON FUNCTION private.normalize_connection_phone(text), private.can_manage_client_connections(uuid),
  private.create_client_connection_request(uuid, uuid, text, text), private.list_client_connection_requests(),
  private.respond_to_client_connection_request(uuid, text, text) FROM PUBLIC;
-- Se requiere EXECUTE de la función inmutable para mantener los índices de expresión.
GRANT EXECUTE ON FUNCTION private.normalize_connection_phone(text),
  private.create_client_connection_request(uuid, uuid, text, text), private.list_client_connection_requests(),
  private.respond_to_client_connection_request(uuid, text, text) TO contractor_api;

RESET ROLE;

COMMIT;
