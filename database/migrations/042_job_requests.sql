BEGIN;

SET ROLE contractor_owner;

-- Peticiones de trabajo: los clientes publican lo que necesitan y los
-- contratistas las ven, piden más información y envían presupuestos.
--
-- Reglas:
--   * Publica un cliente (profiles.role = 'client') activo.
--   * Un contratista activo ve las peticiones abiertas, vigentes (30 días) y
--     con cupo. La API ordena primero las de su categoría y provincia.
--   * Antes de recibir un presupuesto, el contratista solo ve el trabajo, las
--     fotos, la ubicación general y el nombre de pila. La dirección exacta y
--     los datos de contacto se revelan cuando su empresa envía el presupuesto.
--   * Cada empresa tiene una conversación privada con el cliente.
--   * Máximo 5 presupuestos enviados por petición. Al llegar al máximo deja
--     de aparecer; también se cierra si el cliente aprueba uno o la cierra.
--   * Todas las escrituras pasan por funciones SECURITY DEFINER.

-- Utilidades ---------------------------------------------------------------

CREATE OR REPLACE FUNCTION private.normalize_match_text(value text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $function$
  SELECT NULLIF(
    lower(translate(btrim(COALESCE(value, '')), 'ÁÉÍÓÚÜÑáéíóúüñ', 'AEIOUUNaeiouun')),
    ''
  );
$function$;

CREATE OR REPLACE FUNCTION private.is_active_contractor()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT private.is_active_platform_user()
    AND EXISTS (
      SELECT 1
      FROM public.profiles AS profile
      WHERE profile.id = app.current_user_id()
        AND profile.role = 'contractor'::public.global_user_role
    );
$function$;

-- ¿La petición corresponde a la categoría y zona del contratista?
-- Categoría: la principal, una especialidad o «General».
-- Zona: su provincia o un área de trabajo que contenga la provincia o el
-- distrito (las áreas son texto libre, p. ej. «Panamá Centro, Chorrera»).
-- Si el contratista no indicó provincia ni áreas, se considera que cubre todo.
CREATE OR REPLACE FUNCTION private.job_request_matches_profile(
  request_category text,
  request_province text,
  request_district text,
  profile_category text,
  profile_specialties text[],
  profile_province text,
  profile_work_areas text[]
)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $function$
  SELECT
    (
      private.normalize_match_text(request_category) = 'general'
      OR private.normalize_match_text(request_category) = private.normalize_match_text(profile_category)
      OR EXISTS (
        SELECT 1
        FROM unnest(COALESCE(profile_specialties, ARRAY[]::text[])) AS specialty
        WHERE private.normalize_match_text(specialty) = private.normalize_match_text(request_category)
      )
    )
    AND (
      (
        private.normalize_match_text(profile_province) IS NULL
        AND COALESCE(cardinality(profile_work_areas), 0) = 0
      )
      OR private.normalize_match_text(profile_province) = private.normalize_match_text(request_province)
      OR EXISTS (
        SELECT 1
        FROM unnest(COALESCE(profile_work_areas, ARRAY[]::text[])) AS area
        WHERE private.normalize_match_text(area) IS NOT NULL
          AND (
            position(private.normalize_match_text(request_province) IN private.normalize_match_text(area)) > 0
            OR position(private.normalize_match_text(area) IN private.normalize_match_text(request_province)) > 0
            OR (
              private.normalize_match_text(request_district) IS NOT NULL
              AND position(private.normalize_match_text(request_district) IN private.normalize_match_text(area)) > 0
            )
          )
      )
    );
$function$;

-- Tablas -------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.job_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  requester_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  requester_first_name text NOT NULL,
  title text NOT NULL,
  description text NOT NULL,
  category text NOT NULL,
  province text NOT NULL,
  district text,
  corregimiento text,
  desired_timing text NOT NULL DEFAULT 'flexible',
  budget_min numeric(12,2),
  budget_max numeric(12,2),
  status text NOT NULL DEFAULT 'open',
  max_quotes smallint NOT NULL DEFAULT 5,
  quotes_sent_count smallint NOT NULL DEFAULT 0,
  awarded_company_id uuid REFERENCES public.companies(id) ON DELETE SET NULL,
  awarded_budget_id uuid REFERENCES public.budgets(id) ON DELETE SET NULL,
  closed_reason text,
  closed_at timestamptz,
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '30 days'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT job_requests_title_length CHECK (char_length(btrim(title)) BETWEEN 5 AND 120),
  CONSTRAINT job_requests_description_length CHECK (char_length(btrim(description)) BETWEEN 20 AND 4000),
  CONSTRAINT job_requests_category_length CHECK (char_length(btrim(category)) BETWEEN 2 AND 60),
  CONSTRAINT job_requests_province_length CHECK (char_length(btrim(province)) BETWEEN 2 AND 60),
  CONSTRAINT job_requests_district_length CHECK (district IS NULL OR char_length(district) <= 80),
  CONSTRAINT job_requests_corregimiento_length CHECK (corregimiento IS NULL OR char_length(corregimiento) <= 80),
  CONSTRAINT job_requests_first_name_length CHECK (char_length(requester_first_name) BETWEEN 1 AND 80),
  CONSTRAINT job_requests_timing CHECK (desired_timing IN ('urgent', 'this_week', 'this_month', 'flexible')),
  CONSTRAINT job_requests_budget_range CHECK (
    (budget_min IS NULL OR (budget_min >= 0 AND budget_min < 100000000))
    AND (budget_max IS NULL OR (budget_max > 0 AND budget_max < 100000000))
    AND (budget_min IS NULL OR budget_max IS NULL OR budget_min <= budget_max)
  ),
  CONSTRAINT job_requests_status CHECK (status IN ('open', 'awarded', 'closed', 'expired')),
  CONSTRAINT job_requests_quotes CHECK (max_quotes BETWEEN 1 AND 20 AND quotes_sent_count >= 0),
  CONSTRAINT job_requests_closed_reason_length CHECK (closed_reason IS NULL OR char_length(closed_reason) <= 500)
);

COMMENT ON TABLE public.job_requests IS 'Peticiones de trabajo publicadas por clientes para recibir presupuestos.';

CREATE INDEX IF NOT EXISTS job_requests_open_feed_idx
  ON public.job_requests (created_at DESC)
  WHERE status = 'open';
CREATE INDEX IF NOT EXISTS job_requests_requester_idx
  ON public.job_requests (requester_id, created_at DESC);
CREATE INDEX IF NOT EXISTS job_requests_awarded_company_fk_idx
  ON public.job_requests (awarded_company_id);
CREATE INDEX IF NOT EXISTS job_requests_awarded_budget_fk_idx
  ON public.job_requests (awarded_budget_id);

-- Dirección exacta: separada para que el contratista no la vea antes de enviar
-- un presupuesto.
CREATE TABLE IF NOT EXISTS public.job_request_details (
  request_id uuid PRIMARY KEY REFERENCES public.job_requests(id) ON DELETE CASCADE,
  address_line text NOT NULL,
  reference text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT job_request_details_address_length CHECK (char_length(btrim(address_line)) BETWEEN 3 AND 300),
  CONSTRAINT job_request_details_reference_length CHECK (reference IS NULL OR char_length(reference) <= 300)
);

CREATE TABLE IF NOT EXISTS public.job_request_photos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL REFERENCES public.job_requests(id) ON DELETE CASCADE,
  storage_path text NOT NULL UNIQUE,
  mime_type text NOT NULL,
  file_size integer NOT NULL,
  sort_order smallint NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT job_request_photos_mime CHECK (mime_type IN ('image/jpeg', 'image/png', 'image/webp')),
  CONSTRAINT job_request_photos_size CHECK (file_size > 0 AND file_size <= 5242880)
);

CREATE INDEX IF NOT EXISTS job_request_photos_request_idx
  ON public.job_request_photos (request_id, sort_order, created_at);

-- Una conversación privada por petición y empresa.
CREATE TABLE IF NOT EXISTS public.job_request_threads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL REFERENCES public.job_requests(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  company_name text NOT NULL,
  started_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  last_message_at timestamptz,
  client_last_read_at timestamptz,
  company_last_read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT job_request_threads_unique UNIQUE (request_id, company_id)
);

CREATE INDEX IF NOT EXISTS job_request_threads_company_idx
  ON public.job_request_threads (company_id, last_message_at DESC);
CREATE INDEX IF NOT EXISTS job_request_threads_started_by_fk_idx
  ON public.job_request_threads (started_by);

CREATE TABLE IF NOT EXISTS public.job_request_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id uuid NOT NULL REFERENCES public.job_request_threads(id) ON DELETE CASCADE,
  request_id uuid NOT NULL REFERENCES public.job_requests(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  sender_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  sender_side text NOT NULL,
  body text,
  photo_storage_path text UNIQUE,
  photo_mime_type text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT job_request_messages_side CHECK (sender_side IN ('client', 'company')),
  CONSTRAINT job_request_messages_body_length CHECK (body IS NULL OR char_length(body) BETWEEN 1 AND 2000),
  CONSTRAINT job_request_messages_content CHECK (body IS NOT NULL OR photo_storage_path IS NOT NULL),
  CONSTRAINT job_request_messages_photo_mime CHECK (
    photo_storage_path IS NULL
    OR photo_mime_type IN ('image/jpeg', 'image/png', 'image/webp')
  )
);

CREATE INDEX IF NOT EXISTS job_request_messages_thread_idx
  ON public.job_request_messages (thread_id, created_at);
CREATE INDEX IF NOT EXISTS job_request_messages_request_fk_idx
  ON public.job_request_messages (request_id);
CREATE INDEX IF NOT EXISTS job_request_messages_company_fk_idx
  ON public.job_request_messages (company_id);
CREATE INDEX IF NOT EXISTS job_request_messages_sender_fk_idx
  ON public.job_request_messages (sender_id);

-- Presupuesto de una empresa para una petición (uno por empresa).
CREATE TABLE IF NOT EXISTS public.job_request_quotes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL REFERENCES public.job_requests(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  budget_id uuid NOT NULL UNIQUE REFERENCES public.budgets(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'draft',
  sent_at timestamptz,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT job_request_quotes_unique UNIQUE (request_id, company_id),
  CONSTRAINT job_request_quotes_status CHECK (status IN ('draft', 'sent', 'approved', 'rejected', 'expired', 'cancelled'))
);

CREATE INDEX IF NOT EXISTS job_request_quotes_company_idx
  ON public.job_request_quotes (company_id, created_at DESC);
CREATE INDEX IF NOT EXISTS job_request_quotes_client_fk_idx
  ON public.job_request_quotes (client_id);
CREATE INDEX IF NOT EXISTS job_request_quotes_project_fk_idx
  ON public.job_request_quotes (project_id);
CREATE INDEX IF NOT EXISTS job_request_quotes_created_by_fk_idx
  ON public.job_request_quotes (created_by);

DROP TRIGGER IF EXISTS job_requests_touch_updated_at ON public.job_requests;
CREATE TRIGGER job_requests_touch_updated_at
  BEFORE UPDATE ON public.job_requests
  FOR EACH ROW EXECUTE FUNCTION private.touch_updated_at();

DROP TRIGGER IF EXISTS job_request_details_touch_updated_at ON public.job_request_details;
CREATE TRIGGER job_request_details_touch_updated_at
  BEFORE UPDATE ON public.job_request_details
  FOR EACH ROW EXECUTE FUNCTION private.touch_updated_at();

DROP TRIGGER IF EXISTS job_request_quotes_touch_updated_at ON public.job_request_quotes;
CREATE TRIGGER job_request_quotes_touch_updated_at
  BEFORE UPDATE ON public.job_request_quotes
  FOR EACH ROW EXECUTE FUNCTION private.touch_updated_at();

-- Ayudantes de visibilidad (SECURITY DEFINER para no encadenar políticas) --

CREATE OR REPLACE FUNCTION private.is_job_request_owner(requested_request_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.job_requests AS job
    WHERE job.id = requested_request_id
      AND job.requester_id = app.current_user_id()
  );
$function$;

-- La empresa del usuario ya conversó o cotizó: sigue viendo la petición
-- aunque se cierre o se llene.
CREATE OR REPLACE FUNCTION private.has_job_request_engagement(requested_request_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.job_request_threads AS thread
    JOIN public.company_members AS member
      ON member.company_id = thread.company_id
     AND member.user_id = app.current_user_id()
     AND member.active = true
    WHERE thread.request_id = requested_request_id
  ) OR EXISTS (
    SELECT 1
    FROM public.job_request_quotes AS quote
    JOIN public.company_members AS member
      ON member.company_id = quote.company_id
     AND member.user_id = app.current_user_id()
     AND member.active = true
    WHERE quote.request_id = requested_request_id
  );
$function$;

-- La empresa del usuario envió un presupuesto: ve la dirección exacta.
CREATE OR REPLACE FUNCTION private.job_request_contact_revealed(requested_request_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.job_request_quotes AS quote
    JOIN public.company_members AS member
      ON member.company_id = quote.company_id
     AND member.user_id = app.current_user_id()
     AND member.active = true
    WHERE quote.request_id = requested_request_id
      AND quote.sent_at IS NOT NULL
  );
$function$;

REVOKE EXECUTE ON FUNCTION private.normalize_match_text(text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION private.is_active_contractor() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION private.job_request_matches_profile(text, text, text, text, text[], text, text[]) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION private.is_job_request_owner(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION private.has_job_request_engagement(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION private.job_request_contact_revealed(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.normalize_match_text(text) TO contractor_api;
GRANT EXECUTE ON FUNCTION private.is_active_contractor() TO contractor_api;
GRANT EXECUTE ON FUNCTION private.job_request_matches_profile(text, text, text, text, text[], text, text[]) TO contractor_api;
GRANT EXECUTE ON FUNCTION private.is_job_request_owner(uuid) TO contractor_api;
GRANT EXECUTE ON FUNCTION private.has_job_request_engagement(uuid) TO contractor_api;
GRANT EXECUTE ON FUNCTION private.job_request_contact_revealed(uuid) TO contractor_api;

-- RLS: solo lectura; sin políticas de escritura ------------------------------

ALTER TABLE public.job_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.job_request_details ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.job_request_photos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.job_request_threads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.job_request_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.job_request_quotes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS job_requests_select_own ON public.job_requests;
CREATE POLICY job_requests_select_own ON public.job_requests
  FOR SELECT TO contractor_api
  USING (requester_id = (SELECT app.current_user_id()));

DROP POLICY IF EXISTS job_requests_select_open_for_contractors ON public.job_requests;
CREATE POLICY job_requests_select_open_for_contractors ON public.job_requests
  FOR SELECT TO contractor_api
  USING (
    status = 'open'
    AND expires_at > now()
    AND quotes_sent_count < max_quotes
    AND (SELECT private.is_active_contractor())
  );

DROP POLICY IF EXISTS job_requests_select_engaged_company ON public.job_requests;
CREATE POLICY job_requests_select_engaged_company ON public.job_requests
  FOR SELECT TO contractor_api
  USING (private.has_job_request_engagement(id));

DROP POLICY IF EXISTS job_requests_super_admin_select ON public.job_requests;
CREATE POLICY job_requests_super_admin_select ON public.job_requests
  FOR SELECT TO contractor_api
  USING ((SELECT private.is_super_admin()));

DROP POLICY IF EXISTS job_request_details_select ON public.job_request_details;
CREATE POLICY job_request_details_select ON public.job_request_details
  FOR SELECT TO contractor_api
  USING (
    private.is_job_request_owner(request_id)
    OR private.job_request_contact_revealed(request_id)
    OR (SELECT private.is_super_admin())
  );

-- Las fotos siguen la visibilidad de su petición.
DROP POLICY IF EXISTS job_request_photos_select ON public.job_request_photos;
CREATE POLICY job_request_photos_select ON public.job_request_photos
  FOR SELECT TO contractor_api
  USING (
    EXISTS (
      SELECT 1 FROM public.job_requests AS job
      WHERE job.id = job_request_photos.request_id
    )
  );

DROP POLICY IF EXISTS job_request_threads_select ON public.job_request_threads;
CREATE POLICY job_request_threads_select ON public.job_request_threads
  FOR SELECT TO contractor_api
  USING (
    public.is_company_member(company_id)
    OR private.is_job_request_owner(request_id)
    OR (SELECT private.is_super_admin())
  );

DROP POLICY IF EXISTS job_request_messages_select ON public.job_request_messages;
CREATE POLICY job_request_messages_select ON public.job_request_messages
  FOR SELECT TO contractor_api
  USING (
    public.is_company_member(company_id)
    OR private.is_job_request_owner(request_id)
    OR (SELECT private.is_super_admin())
  );

-- El cliente solo ve los presupuestos ya enviados.
DROP POLICY IF EXISTS job_request_quotes_select ON public.job_request_quotes;
CREATE POLICY job_request_quotes_select ON public.job_request_quotes
  FOR SELECT TO contractor_api
  USING (
    public.is_company_member(company_id)
    OR (sent_at IS NOT NULL AND private.is_job_request_owner(request_id))
    OR (SELECT private.is_super_admin())
  );

GRANT SELECT ON public.job_requests TO contractor_api;
GRANT SELECT ON public.job_request_details TO contractor_api;
GRANT SELECT ON public.job_request_photos TO contractor_api;
GRANT SELECT ON public.job_request_threads TO contractor_api;
GRANT SELECT ON public.job_request_messages TO contractor_api;
GRANT SELECT ON public.job_request_quotes TO contractor_api;

-- 1. El cliente publica una petición -----------------------------------------

CREATE OR REPLACE FUNCTION public.create_job_request(
  requested_title text,
  requested_description text,
  requested_category text,
  requested_province text,
  requested_district text,
  requested_corregimiento text,
  requested_address_line text,
  requested_reference text,
  requested_timing text DEFAULT 'flexible',
  requested_budget_min numeric DEFAULT NULL,
  requested_budget_max numeric DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_user_id uuid := app.current_user_id();
  v_profile public.profiles%ROWTYPE;
  v_title text := btrim(COALESCE(requested_title, ''));
  v_description text := btrim(COALESCE(requested_description, ''));
  v_category text := btrim(COALESCE(requested_category, ''));
  v_province text := btrim(COALESCE(requested_province, ''));
  v_district text := NULLIF(btrim(requested_district), '');
  v_corregimiento text := NULLIF(btrim(requested_corregimiento), '');
  v_address text := btrim(COALESCE(requested_address_line, ''));
  v_reference text := NULLIF(btrim(requested_reference), '');
  v_timing text := COALESCE(NULLIF(btrim(requested_timing), ''), 'flexible');
  v_first_name text;
  v_open_count integer;
  v_request_id uuid;
BEGIN
  IF v_user_id IS NULL OR NOT private.is_active_platform_user() THEN
    RAISE EXCEPTION 'Tu cuenta no está activa.' USING ERRCODE = '42501';
  END IF;

  SELECT profile.* INTO v_profile
  FROM public.profiles AS profile
  WHERE profile.id = v_user_id;

  IF v_profile.role IS DISTINCT FROM 'client'::public.global_user_role THEN
    RAISE EXCEPTION 'Solo las cuentas de cliente pueden publicar peticiones.' USING ERRCODE = '42501';
  END IF;

  IF char_length(v_title) NOT BETWEEN 5 AND 120 THEN
    RAISE EXCEPTION 'El título debe tener entre 5 y 120 caracteres.' USING ERRCODE = '22023';
  END IF;
  IF char_length(v_description) NOT BETWEEN 20 AND 4000 THEN
    RAISE EXCEPTION 'Describe el trabajo con al menos 20 caracteres (máximo 4000).' USING ERRCODE = '22023';
  END IF;
  IF char_length(v_category) NOT BETWEEN 2 AND 60 THEN
    RAISE EXCEPTION 'Elige el tipo de trabajo.' USING ERRCODE = '22023';
  END IF;
  IF char_length(v_province) NOT BETWEEN 2 AND 60 THEN
    RAISE EXCEPTION 'Elige la provincia.' USING ERRCODE = '22023';
  END IF;
  IF char_length(COALESCE(v_district, '')) > 80 OR char_length(COALESCE(v_corregimiento, '')) > 80 THEN
    RAISE EXCEPTION 'El distrito y el corregimiento admiten 80 caracteres.' USING ERRCODE = '22023';
  END IF;
  IF char_length(v_address) NOT BETWEEN 3 AND 300 OR char_length(COALESCE(v_reference, '')) > 300 THEN
    RAISE EXCEPTION 'Escribe la dirección (máximo 300 caracteres).' USING ERRCODE = '22023';
  END IF;
  IF v_timing NOT IN ('urgent', 'this_week', 'this_month', 'flexible') THEN
    RAISE EXCEPTION 'El plazo no es válido.' USING ERRCODE = '22023';
  END IF;
  IF (requested_budget_min IS NOT NULL AND (requested_budget_min < 0 OR requested_budget_min >= 100000000))
    OR (requested_budget_max IS NOT NULL AND (requested_budget_max <= 0 OR requested_budget_max >= 100000000))
    OR (requested_budget_min IS NOT NULL AND requested_budget_max IS NOT NULL AND requested_budget_min > requested_budget_max)
  THEN
    RAISE EXCEPTION 'El rango de presupuesto no es válido.' USING ERRCODE = '22023';
  END IF;

  SELECT count(*) INTO v_open_count
  FROM public.job_requests AS job
  WHERE job.requester_id = v_user_id
    AND job.status = 'open'
    AND job.expires_at > now();

  IF v_open_count >= 10 THEN
    RAISE EXCEPTION 'Tienes 10 peticiones abiertas. Cierra alguna para publicar otra.' USING ERRCODE = '55000';
  END IF;

  v_first_name := left(COALESCE(
    NULLIF(btrim(v_profile.first_name), ''),
    NULLIF(split_part(btrim(COALESCE(v_profile.full_name, '')), ' ', 1), ''),
    'Cliente'
  ), 80);

  INSERT INTO public.job_requests (
    requester_id, requester_first_name, title, description, category, province,
    district, corregimiento, desired_timing, budget_min, budget_max
  )
  VALUES (
    v_user_id, v_first_name, v_title, v_description, v_category, v_province,
    v_district, v_corregimiento, v_timing,
    round(requested_budget_min, 2), round(requested_budget_max, 2)
  )
  RETURNING id INTO v_request_id;

  INSERT INTO public.job_request_details (request_id, address_line, reference)
  VALUES (v_request_id, v_address, v_reference);

  RETURN v_request_id;
END
$function$;

-- 2. Fotos de la petición (máximo 8, solo mientras está abierta) -------------

CREATE OR REPLACE FUNCTION public.add_job_request_photo(
  requested_request_id uuid,
  requested_storage_path text,
  requested_mime_type text,
  requested_file_size integer
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_job public.job_requests%ROWTYPE;
  v_count integer;
  v_photo_id uuid;
BEGIN
  IF app.current_user_id() IS NULL OR NOT private.is_active_platform_user() THEN
    RAISE EXCEPTION 'Tu cuenta no está activa.' USING ERRCODE = '42501';
  END IF;

  SELECT job.* INTO v_job
  FROM public.job_requests AS job
  WHERE job.id = requested_request_id
    AND job.requester_id = app.current_user_id()
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'No se encontró la petición.' USING ERRCODE = 'P0002';
  END IF;

  IF v_job.status <> 'open' THEN
    RAISE EXCEPTION 'La petición ya está cerrada.' USING ERRCODE = '55000';
  END IF;

  SELECT count(*) INTO v_count
  FROM public.job_request_photos AS photo
  WHERE photo.request_id = v_job.id;

  IF v_count >= 8 THEN
    RAISE EXCEPTION 'La petición admite 8 fotos.' USING ERRCODE = '55000';
  END IF;

  INSERT INTO public.job_request_photos (request_id, storage_path, mime_type, file_size, sort_order)
  VALUES (v_job.id, requested_storage_path, requested_mime_type, requested_file_size, v_count)
  RETURNING id INTO v_photo_id;

  RETURN v_photo_id;
END
$function$;

-- Devuelve la ruta del archivo para borrarlo del almacenamiento.
CREATE OR REPLACE FUNCTION public.delete_job_request_photo(
  requested_request_id uuid,
  requested_photo_id uuid
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_path text;
BEGIN
  IF app.current_user_id() IS NULL OR NOT private.is_active_platform_user() THEN
    RAISE EXCEPTION 'Tu cuenta no está activa.' USING ERRCODE = '42501';
  END IF;

  DELETE FROM public.job_request_photos AS photo
  USING public.job_requests AS job
  WHERE photo.id = requested_photo_id
    AND photo.request_id = requested_request_id
    AND job.id = photo.request_id
    AND job.requester_id = app.current_user_id()
    AND job.status = 'open'
  RETURNING photo.storage_path INTO v_path;

  RETURN v_path;
END
$function$;

-- 3. El cliente cierra su petición ------------------------------------------

CREATE OR REPLACE FUNCTION public.close_job_request(
  requested_request_id uuid,
  requested_reason text DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_reason text := NULLIF(btrim(requested_reason), '');
BEGIN
  IF app.current_user_id() IS NULL OR NOT private.is_active_platform_user() THEN
    RAISE EXCEPTION 'Tu cuenta no está activa.' USING ERRCODE = '42501';
  END IF;

  IF v_reason IS NOT NULL AND char_length(v_reason) > 500 THEN
    RAISE EXCEPTION 'El motivo admite 500 caracteres.' USING ERRCODE = '22023';
  END IF;

  UPDATE public.job_requests
  SET status = 'closed',
      closed_reason = v_reason,
      closed_at = now()
  WHERE id = requested_request_id
    AND requester_id = app.current_user_id()
    AND status = 'open';

  RETURN FOUND;
END
$function$;

-- 4. Mensajes ---------------------------------------------------------------
-- El cliente responde en la conversación de una empresa. El contratista
-- (dueño, administrador, estimador o ventas) inicia o continúa la de su
-- empresa. Devuelve el mensaje y a quién avisar.

CREATE OR REPLACE FUNCTION public.send_job_request_message(
  requested_request_id uuid,
  requested_company_id uuid,
  requested_body text DEFAULT NULL,
  requested_photo_path text DEFAULT NULL,
  requested_photo_mime text DEFAULT NULL
)
RETURNS TABLE (message_id uuid, thread_id uuid, recipient_ids uuid[])
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_user_id uuid := app.current_user_id();
  v_job public.job_requests%ROWTYPE;
  v_thread public.job_request_threads%ROWTYPE;
  v_company public.companies%ROWTYPE;
  v_body text := NULLIF(btrim(requested_body), '');
  v_side text;
  v_message_id uuid;
  v_recipients uuid[];
BEGIN
  IF v_user_id IS NULL OR NOT private.is_active_platform_user() THEN
    RAISE EXCEPTION 'Tu cuenta no está activa.' USING ERRCODE = '42501';
  END IF;

  IF v_body IS NULL AND requested_photo_path IS NULL THEN
    RAISE EXCEPTION 'Escribe un mensaje o adjunta una foto.' USING ERRCODE = '22023';
  END IF;
  IF v_body IS NOT NULL AND char_length(v_body) > 2000 THEN
    RAISE EXCEPTION 'El mensaje admite 2000 caracteres.' USING ERRCODE = '22023';
  END IF;

  SELECT job.* INTO v_job
  FROM public.job_requests AS job
  WHERE job.id = requested_request_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'No se encontró la petición.' USING ERRCODE = 'P0002';
  END IF;

  SELECT thread.* INTO v_thread
  FROM public.job_request_threads AS thread
  WHERE thread.request_id = v_job.id
    AND thread.company_id = requested_company_id
  FOR UPDATE;

  IF v_job.requester_id = v_user_id THEN
    v_side := 'client';
    IF v_thread.id IS NULL THEN
      RAISE EXCEPTION 'No se encontró la conversación.' USING ERRCODE = 'P0002';
    END IF;
    IF v_job.status = 'closed'
      OR (v_job.status = 'awarded' AND v_job.awarded_company_id IS DISTINCT FROM v_thread.company_id)
    THEN
      RAISE EXCEPTION 'La petición está cerrada.' USING ERRCODE = '55000';
    END IF;
  ELSE
    v_side := 'company';
    IF NOT public.has_company_role(
      requested_company_id,
      ARRAY['owner', 'admin', 'estimator', 'sales']::public.company_role[]
    ) THEN
      RAISE EXCEPTION 'Tu rol en la empresa no permite responder peticiones.' USING ERRCODE = '42501';
    END IF;

    SELECT company.* INTO v_company
    FROM public.companies AS company
    WHERE company.id = requested_company_id;

    IF NOT FOUND OR v_company.active IS NOT TRUE THEN
      RAISE EXCEPTION 'La empresa no está activa.' USING ERRCODE = '42501';
    END IF;

    IF v_thread.id IS NULL THEN
      -- Solo se inicia una conversación si la petición sigue recibiendo presupuestos.
      IF v_job.status <> 'open' OR v_job.expires_at <= now()
        OR v_job.quotes_sent_count >= v_job.max_quotes
        OR NOT private.is_active_contractor()
      THEN
        RAISE EXCEPTION 'La petición ya no recibe presupuestos.' USING ERRCODE = '55000';
      END IF;

      INSERT INTO public.job_request_threads (request_id, company_id, company_name, started_by)
      VALUES (v_job.id, v_company.id, v_company.name, v_user_id)
      RETURNING * INTO v_thread;
    ELSIF v_job.status = 'closed'
      OR (v_job.status = 'awarded' AND v_job.awarded_company_id IS DISTINCT FROM v_thread.company_id)
    THEN
      RAISE EXCEPTION 'La petición está cerrada.' USING ERRCODE = '55000';
    END IF;
  END IF;

  INSERT INTO public.job_request_messages (
    thread_id, request_id, company_id, sender_id, sender_side, body, photo_storage_path, photo_mime_type
  )
  VALUES (
    v_thread.id, v_job.id, v_thread.company_id, v_user_id, v_side, v_body,
    requested_photo_path, CASE WHEN requested_photo_path IS NULL THEN NULL ELSE requested_photo_mime END
  )
  RETURNING id INTO v_message_id;

  UPDATE public.job_request_threads
  SET last_message_at = now(),
      client_last_read_at = CASE WHEN v_side = 'client' THEN now() ELSE client_last_read_at END,
      company_last_read_at = CASE WHEN v_side = 'company' THEN now() ELSE company_last_read_at END
  WHERE id = v_thread.id;

  IF v_side = 'company' THEN
    v_recipients := ARRAY[v_job.requester_id];
  ELSE
    -- Quien inició la conversación y los dueños/administradores de la empresa.
    SELECT array_agg(DISTINCT member.user_id) INTO v_recipients
    FROM public.company_members AS member
    WHERE member.company_id = v_thread.company_id
      AND member.active = true
      AND (member.user_id = v_thread.started_by OR member.role IN ('owner', 'admin'));
  END IF;

  message_id := v_message_id;
  thread_id := v_thread.id;
  recipient_ids := COALESCE(v_recipients, ARRAY[]::uuid[]);
  RETURN NEXT;
END
$function$;

CREATE OR REPLACE FUNCTION public.mark_job_request_thread_read(
  requested_request_id uuid,
  requested_company_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_user_id uuid := app.current_user_id();
BEGIN
  IF v_user_id IS NULL THEN
    RETURN false;
  END IF;

  IF private.is_job_request_owner(requested_request_id) THEN
    UPDATE public.job_request_threads
    SET client_last_read_at = now()
    WHERE request_id = requested_request_id
      AND company_id = requested_company_id;
  ELSIF public.is_company_member(requested_company_id) THEN
    UPDATE public.job_request_threads
    SET company_last_read_at = now()
    WHERE request_id = requested_request_id
      AND company_id = requested_company_id;
  ELSE
    RETURN false;
  END IF;

  RETURN FOUND;
END
$function$;

-- 5. El contratista prepara un presupuesto ----------------------------------
-- Crea (o reutiliza) el cliente de la empresa vinculado al usuario, una obra
-- en estado «lead» y un presupuesto en borrador. Si la empresa ya tiene uno
-- para la petición, lo devuelve. El cliente se crea solo con el nombre de
-- pila: los datos de contacto se copian cuando se envía el presupuesto.

CREATE OR REPLACE FUNCTION public.start_job_request_quote(
  requested_request_id uuid,
  requested_company_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_user_id uuid := app.current_user_id();
  v_job public.job_requests%ROWTYPE;
  v_company public.companies%ROWTYPE;
  v_existing public.job_request_quotes%ROWTYPE;
  v_client_id uuid;
  v_project_id uuid;
  v_budget_id uuid;
  v_project_code text;
BEGIN
  IF v_user_id IS NULL OR NOT private.is_active_contractor() THEN
    RAISE EXCEPTION 'Tu cuenta no puede cotizar peticiones.' USING ERRCODE = '42501';
  END IF;

  IF NOT public.has_company_role(
    requested_company_id,
    ARRAY['owner', 'admin', 'estimator']::public.company_role[]
  ) THEN
    RAISE EXCEPTION 'Tu rol en la empresa no permite crear presupuestos.' USING ERRCODE = '42501';
  END IF;

  SELECT company.* INTO v_company
  FROM public.companies AS company
  WHERE company.id = requested_company_id;

  IF NOT FOUND OR v_company.active IS NOT TRUE THEN
    RAISE EXCEPTION 'La empresa no está activa.' USING ERRCODE = '42501';
  END IF;

  SELECT job.* INTO v_job
  FROM public.job_requests AS job
  WHERE job.id = requested_request_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'No se encontró la petición.' USING ERRCODE = 'P0002';
  END IF;

  SELECT quote.* INTO v_existing
  FROM public.job_request_quotes AS quote
  WHERE quote.request_id = v_job.id
    AND quote.company_id = v_company.id;

  IF FOUND THEN
    RETURN v_existing.budget_id;
  END IF;

  IF v_job.requester_id = v_user_id THEN
    RAISE EXCEPTION 'No puedes cotizar tu propia petición.' USING ERRCODE = '42501';
  END IF;

  IF v_job.status <> 'open' OR v_job.expires_at <= now()
    OR v_job.quotes_sent_count >= v_job.max_quotes
  THEN
    RAISE EXCEPTION 'La petición ya no recibe presupuestos.' USING ERRCODE = '55000';
  END IF;

  SELECT customer.id INTO v_client_id
  FROM public.clients AS customer
  WHERE customer.company_id = v_company.id
    AND customer.user_id = v_job.requester_id
    AND customer.active = true
  ORDER BY customer.created_at
  LIMIT 1;

  IF v_client_id IS NULL THEN
    INSERT INTO public.clients (
      company_id, client_type, first_name, notes, user_id, created_by
    )
    VALUES (
      v_company.id,
      'person'::public.client_type,
      CASE WHEN char_length(v_job.requester_first_name) >= 2 THEN v_job.requester_first_name ELSE 'Cliente' END,
      'Cliente de la petición de trabajo «' || v_job.title || '». Sus datos de contacto se completan al enviar el presupuesto.',
      v_job.requester_id,
      v_user_id
    )
    RETURNING id INTO v_client_id;
  END IF;

  v_project_code := public.next_document_number(v_company.id, 'project'::public.document_type);

  INSERT INTO public.projects (
    company_id, client_id, project_code, name, description, status, budget_estimate, created_by
  )
  VALUES (
    v_company.id,
    v_client_id,
    v_project_code,
    v_job.title,
    v_job.description,
    'lead'::public.project_status,
    COALESCE(v_job.budget_max, v_job.budget_min, 0),
    v_user_id
  )
  RETURNING id INTO v_project_id;

  v_budget_id := public.create_project_budget(v_company.id, v_project_id, v_job.title);

  INSERT INTO public.budget_change_history (company_id, budget_id, version, action, performed_by, notes)
  VALUES (v_company.id, v_budget_id, 1, 'created', v_user_id, 'Presupuesto creado desde una petición de trabajo');

  INSERT INTO public.job_request_threads (request_id, company_id, company_name, started_by)
  VALUES (v_job.id, v_company.id, v_company.name, v_user_id)
  ON CONFLICT (request_id, company_id) DO NOTHING;

  INSERT INTO public.job_request_quotes (
    request_id, company_id, client_id, project_id, budget_id, status, created_by
  )
  VALUES (v_job.id, v_company.id, v_client_id, v_project_id, v_budget_id, 'draft', v_user_id);

  RETURN v_budget_id;
END
$function$;

-- 6. Sincronizar con el estado del presupuesto --------------------------------
-- Al enviarse por primera vez: valida el cupo, cuenta el presupuesto y revela
-- los datos de contacto y la dirección. Al aprobarse: adjudica la petición.

CREATE OR REPLACE FUNCTION private.sync_job_request_quote()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_quote public.job_request_quotes%ROWTYPE;
  v_job public.job_requests%ROWTYPE;
  v_profile public.profiles%ROWTYPE;
  v_email text;
  v_details public.job_request_details%ROWTYPE;
  v_address_id uuid;
BEGIN
  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RETURN NEW;
  END IF;

  SELECT quote.* INTO v_quote
  FROM public.job_request_quotes AS quote
  WHERE quote.budget_id = NEW.id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  SELECT job.* INTO v_job
  FROM public.job_requests AS job
  WHERE job.id = v_quote.request_id
  FOR UPDATE;

  IF NEW.status = 'sent'::public.budget_status AND v_quote.sent_at IS NULL THEN
    IF v_job.status <> 'open' OR v_job.expires_at <= now()
      OR v_job.quotes_sent_count >= v_job.max_quotes
    THEN
      RAISE EXCEPTION 'La petición ya no recibe presupuestos: se cerró, venció o llegó al máximo de %.', v_job.max_quotes
        USING ERRCODE = '55000', HINT = 'job_request_not_accepting';
    END IF;

    UPDATE public.job_request_quotes
    SET status = 'sent', sent_at = now()
    WHERE id = v_quote.id;

    UPDATE public.job_requests
    SET quotes_sent_count = quotes_sent_count + 1
    WHERE id = v_job.id;

    -- Revelar contacto: completar solo lo que el cliente de la empresa no tiene.
    SELECT profile.* INTO v_profile
    FROM public.profiles AS profile
    WHERE profile.id = v_job.requester_id;

    SELECT auth_user.email INTO v_email
    FROM app_auth.users AS auth_user
    WHERE auth_user.id = v_job.requester_id;

    UPDATE public.clients
    SET last_name = COALESCE(NULLIF(btrim(last_name), ''), NULLIF(btrim(v_profile.last_name), '')),
        phone = COALESCE(NULLIF(btrim(phone), ''), NULLIF(btrim(v_profile.phone), '')),
        email = COALESCE(NULLIF(btrim(email), ''), lower(NULLIF(btrim(v_email), '')))
    WHERE id = v_quote.client_id;

    SELECT detail.* INTO v_details
    FROM public.job_request_details AS detail
    WHERE detail.request_id = v_job.id;

    IF FOUND THEN
      INSERT INTO public.client_addresses (
        company_id, client_id, label, address, province, district, township, reference, is_primary
      )
      SELECT
        v_quote.company_id,
        v_quote.client_id,
        'Petición de trabajo',
        v_details.address_line,
        v_job.province,
        v_job.district,
        v_job.corregimiento,
        v_details.reference,
        NOT EXISTS (
          SELECT 1 FROM public.client_addresses AS existing
          WHERE existing.client_id = v_quote.client_id
            AND existing.is_primary = true
        )
      WHERE NOT EXISTS (
        SELECT 1 FROM public.client_addresses AS existing
        WHERE existing.client_id = v_quote.client_id
          AND existing.company_id = v_quote.company_id
          AND lower(btrim(existing.address)) = lower(btrim(v_details.address_line))
      )
      RETURNING id INTO v_address_id;

      IF v_address_id IS NULL THEN
        SELECT existing.id INTO v_address_id
        FROM public.client_addresses AS existing
        WHERE existing.client_id = v_quote.client_id
          AND existing.company_id = v_quote.company_id
          AND lower(btrim(existing.address)) = lower(btrim(v_details.address_line))
        LIMIT 1;
      END IF;

      UPDATE public.projects
      SET address_id = COALESCE(address_id, v_address_id),
          status = CASE WHEN status = 'lead'::public.project_status THEN 'quoted'::public.project_status ELSE status END
      WHERE id = v_quote.project_id;
    END IF;

    RETURN NEW;
  END IF;

  UPDATE public.job_request_quotes
  SET status = CASE NEW.status
    WHEN 'draft'::public.budget_status THEN 'draft'
    WHEN 'sent'::public.budget_status THEN 'sent'
    WHEN 'viewed'::public.budget_status THEN 'sent'
    WHEN 'approved'::public.budget_status THEN 'approved'
    WHEN 'rejected'::public.budget_status THEN 'rejected'
    WHEN 'expired'::public.budget_status THEN 'expired'
    ELSE 'cancelled'
  END
  WHERE id = v_quote.id;

  IF NEW.status = 'approved'::public.budget_status AND v_job.status = 'open' THEN
    UPDATE public.job_requests
    SET status = 'awarded',
        awarded_company_id = v_quote.company_id,
        awarded_budget_id = NEW.id,
        closed_at = now()
    WHERE id = v_job.id;
  END IF;

  RETURN NEW;
END
$function$;

REVOKE EXECUTE ON FUNCTION private.sync_job_request_quote() FROM PUBLIC;

DROP TRIGGER IF EXISTS budgets_sync_job_request_quote ON public.budgets;
CREATE TRIGGER budgets_sync_job_request_quote
  AFTER UPDATE OF status ON public.budgets
  FOR EACH ROW EXECUTE FUNCTION private.sync_job_request_quote();

-- 7. Contratistas a avisar de una petición nueva -----------------------------
-- Miembros con rol comercial de empresas activas, cuyo perfil corresponde a
-- la categoría y zona. Solo la puede consultar quien publicó la petición.

CREATE OR REPLACE FUNCTION public.job_request_matching_recipients(
  requested_request_id uuid,
  requested_limit integer DEFAULT 100
)
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT DISTINCT member.user_id
  FROM public.job_requests AS job
  JOIN public.profiles AS profile
    ON profile.role = 'contractor'::public.global_user_role
   AND profile.active = true
   AND profile.approved_at IS NOT NULL
  JOIN public.company_members AS member
    ON member.user_id = profile.id
   AND member.active = true
   AND member.role IN ('owner', 'admin', 'estimator', 'sales')
  JOIN public.companies AS company
    ON company.id = member.company_id
   AND company.active = true
  WHERE job.id = requested_request_id
    AND job.requester_id = app.current_user_id()
    AND job.status = 'open'
    AND profile.id <> job.requester_id
    AND private.job_request_matches_profile(
      job.category, job.province, job.district,
      profile.primary_category, profile.specialties, profile.province, profile.work_areas
    )
  LIMIT LEAST(GREATEST(COALESCE(requested_limit, 100), 1), 500);
$function$;

REVOKE EXECUTE ON FUNCTION public.create_job_request(text, text, text, text, text, text, text, text, text, numeric, numeric) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.add_job_request_photo(uuid, text, text, integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.delete_job_request_photo(uuid, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.close_job_request(uuid, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.send_job_request_message(uuid, uuid, text, text, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.mark_job_request_thread_read(uuid, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.start_job_request_quote(uuid, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.job_request_matching_recipients(uuid, integer) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.create_job_request(text, text, text, text, text, text, text, text, text, numeric, numeric) TO contractor_api;
GRANT EXECUTE ON FUNCTION public.add_job_request_photo(uuid, text, text, integer) TO contractor_api;
GRANT EXECUTE ON FUNCTION public.delete_job_request_photo(uuid, uuid) TO contractor_api;
GRANT EXECUTE ON FUNCTION public.close_job_request(uuid, text) TO contractor_api;
GRANT EXECUTE ON FUNCTION public.send_job_request_message(uuid, uuid, text, text, text) TO contractor_api;
GRANT EXECUTE ON FUNCTION public.mark_job_request_thread_read(uuid, uuid) TO contractor_api;
GRANT EXECUTE ON FUNCTION public.start_job_request_quote(uuid, uuid) TO contractor_api;
GRANT EXECUTE ON FUNCTION public.job_request_matching_recipients(uuid, integer) TO contractor_api;

RESET ROLE;

COMMIT;
