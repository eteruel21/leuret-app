BEGIN;

SET ROLE contractor_owner;

-- Aportes de precio de los usuarios al catálogo de plataforma.
--
-- Cuando un insumo no tiene precio (o el usuario conoce uno mejor), el usuario
-- escribe lo que le cuesta. Ese precio:
--   1. se guarda como su precio personal (user_catalog_price_overrides), así
--      que lo usa de inmediato en calculadoras y presupuestos;
--   2. queda como aporte pendiente en catalog_price_contributions.
-- El superadministrador revisa los aportes de cada insumo (cantidad, mediana,
-- mínimo y máximo) y los aprueba (pasa al catálogo de todos, con historial) o
-- los rechaza. Las escrituras solo ocurren por funciones SECURITY DEFINER con
-- reglas explícitas.

CREATE TABLE IF NOT EXISTS public.catalog_price_contributions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  catalog_item_id uuid NOT NULL REFERENCES public.platform_catalog_items(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  unit_cost numeric(12,2) NOT NULL,
  store_name text,
  notes text,
  region_code text REFERENCES public.platform_price_regions(code) ON UPDATE CASCADE,
  status text NOT NULL DEFAULT 'pending',
  reviewed_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  review_notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT catalog_price_contributions_cost_range CHECK (unit_cost > 0 AND unit_cost < 1000000),
  CONSTRAINT catalog_price_contributions_status CHECK (status IN ('pending', 'approved', 'rejected')),
  CONSTRAINT catalog_price_contributions_store_length CHECK (store_name IS NULL OR char_length(store_name) <= 120),
  CONSTRAINT catalog_price_contributions_notes_length CHECK (notes IS NULL OR char_length(notes) <= 500),
  CONSTRAINT catalog_price_contributions_review_notes_length CHECK (review_notes IS NULL OR char_length(review_notes) <= 500)
);

-- Un solo aporte pendiente por usuario e insumo: si vuelve a aportar, se actualiza.
CREATE UNIQUE INDEX IF NOT EXISTS catalog_price_contributions_one_pending_idx
  ON public.catalog_price_contributions (catalog_item_id, user_id)
  WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS catalog_price_contributions_status_item_idx
  ON public.catalog_price_contributions (status, catalog_item_id, created_at DESC);
CREATE INDEX IF NOT EXISTS catalog_price_contributions_user_idx
  ON public.catalog_price_contributions (user_id);
CREATE INDEX IF NOT EXISTS catalog_price_contributions_region_fk_idx
  ON public.catalog_price_contributions (region_code);
CREATE INDEX IF NOT EXISTS catalog_price_contributions_reviewed_by_fk_idx
  ON public.catalog_price_contributions (reviewed_by);

DROP TRIGGER IF EXISTS catalog_price_contributions_touch_updated_at ON public.catalog_price_contributions;
CREATE TRIGGER catalog_price_contributions_touch_updated_at
  BEFORE UPDATE ON public.catalog_price_contributions
  FOR EACH ROW EXECUTE FUNCTION private.touch_updated_at();

ALTER TABLE public.catalog_price_contributions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS catalog_price_contributions_select_own ON public.catalog_price_contributions;
CREATE POLICY catalog_price_contributions_select_own
  ON public.catalog_price_contributions FOR SELECT TO contractor_api
  USING (
    (SELECT private.is_active_platform_user())
    AND user_id = (SELECT app.current_user_id())
  );

DROP POLICY IF EXISTS catalog_price_contributions_super_admin_select ON public.catalog_price_contributions;
CREATE POLICY catalog_price_contributions_super_admin_select
  ON public.catalog_price_contributions FOR SELECT TO contractor_api
  USING ((SELECT private.is_super_admin()));

GRANT SELECT ON public.catalog_price_contributions TO contractor_api;

-- 1. El usuario aporta un precio ----------------------------------------------
-- Guarda (o actualiza) su aporte pendiente y su precio personal.
-- Si no indica precio de venta, se usa costo × 1.35, el margen del catálogo.

CREATE OR REPLACE FUNCTION public.submit_catalog_price_contribution(
  requested_item_id uuid,
  requested_unit_cost numeric,
  requested_sale_price numeric DEFAULT NULL,
  requested_store_name text DEFAULT NULL,
  requested_notes text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  current_user_id uuid := app.current_user_id();
  item_record public.platform_catalog_items%ROWTYPE;
  clean_cost numeric(12,2) := round(requested_unit_cost, 2);
  clean_sale numeric(12,2);
  clean_store text := NULLIF(btrim(requested_store_name), '');
  clean_notes text := NULLIF(btrim(requested_notes), '');
  user_region text;
  contribution_id uuid;
BEGIN
  IF current_user_id IS NULL OR NOT private.is_active_platform_user() THEN
    RAISE EXCEPTION 'La cuenta no está activa.' USING ERRCODE = '42501';
  END IF;

  IF clean_cost IS NULL OR clean_cost <= 0 OR clean_cost >= 1000000 THEN
    RAISE EXCEPTION 'Escribe un precio mayor que cero.' USING ERRCODE = '22023';
  END IF;

  clean_sale := round(COALESCE(requested_sale_price, clean_cost * 1.35), 2);
  IF clean_sale <= 0 OR clean_sale >= 1000000 THEN
    RAISE EXCEPTION 'El precio de venta no es válido.' USING ERRCODE = '22023';
  END IF;

  IF clean_store IS NOT NULL AND char_length(clean_store) > 120 THEN
    RAISE EXCEPTION 'El nombre de la tienda es demasiado largo.' USING ERRCODE = '22023';
  END IF;

  IF clean_notes IS NOT NULL AND char_length(clean_notes) > 500 THEN
    RAISE EXCEPTION 'La nota es demasiado larga.' USING ERRCODE = '22023';
  END IF;

  SELECT item.*
  INTO item_record
  FROM public.platform_catalog_items AS item
  WHERE item.id = requested_item_id
    AND item.active = true;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'El concepto no existe o está inactivo.' USING ERRCODE = 'P0002';
  END IF;

  SELECT choice.region_code
  INTO user_region
  FROM public.user_price_regions AS choice
  WHERE choice.user_id = current_user_id;

  UPDATE public.catalog_price_contributions
  SET
    unit_cost = clean_cost,
    store_name = clean_store,
    notes = clean_notes,
    region_code = COALESCE(user_region, 'panama_metro')
  WHERE catalog_item_id = item_record.id
    AND user_id = current_user_id
    AND status = 'pending'
  RETURNING id INTO contribution_id;

  IF contribution_id IS NULL THEN
    INSERT INTO public.catalog_price_contributions (
      catalog_item_id, user_id, unit_cost, store_name, notes, region_code
    )
    VALUES (
      item_record.id, current_user_id, clean_cost, clean_store, clean_notes,
      COALESCE(user_region, 'panama_metro')
    )
    RETURNING id INTO contribution_id;
  END IF;

  INSERT INTO public.user_catalog_price_overrides (
    user_id, catalog_item_id, unit_cost, sale_price, waste_percentage
  )
  VALUES (
    current_user_id, item_record.id, clean_cost, clean_sale, item_record.default_waste_percentage
  )
  ON CONFLICT (user_id, catalog_item_id) DO UPDATE
  SET
    unit_cost = EXCLUDED.unit_cost,
    sale_price = EXCLUDED.sale_price,
    updated_at = now();

  RETURN contribution_id;
END
$function$;

-- 2. El superadministrador aprueba o rechaza los aportes pendientes ----------
-- Aprobar: cambia el precio del catálogo de plataforma (con historial,
-- fuente 'aporte_usuarios') y marca como aprobados los aportes pendientes.
-- Rechazar: marca los aportes pendientes como rechazados con el motivo.

CREATE OR REPLACE FUNCTION public.admin_review_price_contributions(
  requested_item_id uuid,
  requested_action text,
  requested_unit_cost numeric DEFAULT NULL,
  requested_sale_price numeric DEFAULT NULL,
  requested_reason text DEFAULT NULL
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  item_record public.platform_catalog_items%ROWTYPE;
  clean_reason text := NULLIF(btrim(requested_reason), '');
  clean_cost numeric(12,2);
  clean_sale numeric(12,2);
  reviewed_count integer;
BEGIN
  IF app.current_user_id() IS NULL OR NOT private.is_super_admin() THEN
    RAISE EXCEPTION 'Solo el superadministrador puede usar esta acción.' USING ERRCODE = '42501';
  END IF;

  IF requested_action NOT IN ('approve', 'reject') THEN
    RAISE EXCEPTION 'La acción no es válida.' USING ERRCODE = '22023';
  END IF;

  IF clean_reason IS NOT NULL AND char_length(clean_reason) > 500 THEN
    RAISE EXCEPTION 'El motivo es demasiado largo.' USING ERRCODE = '22023';
  END IF;

  IF requested_action = 'reject' AND (clean_reason IS NULL OR char_length(clean_reason) < 5) THEN
    RAISE EXCEPTION 'Indica el motivo del rechazo (entre 5 y 500 caracteres).' USING ERRCODE = '22023';
  END IF;

  SELECT item.*
  INTO item_record
  FROM public.platform_catalog_items AS item
  WHERE item.id = requested_item_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  IF requested_action = 'approve' THEN
    clean_cost := round(requested_unit_cost, 2);
    clean_sale := round(COALESCE(requested_sale_price, requested_unit_cost * 1.35), 2);

    IF clean_cost IS NULL OR clean_cost <= 0 OR clean_cost >= 1000000
      OR clean_sale IS NULL OR clean_sale <= 0 OR clean_sale >= 1000000 THEN
      RAISE EXCEPTION 'Los precios aprobados no son válidos.' USING ERRCODE = '22023';
    END IF;

    UPDATE public.platform_catalog_items
    SET
      default_unit_cost = clean_cost,
      default_sale_price = clean_sale,
      updated_at = now()
    WHERE id = item_record.id;

    INSERT INTO public.platform_catalog_price_history (
      catalog_item_id, previous_unit_cost, previous_sale_price, previous_waste_percentage,
      unit_cost, sale_price, waste_percentage, source, notes, changed_by
    )
    VALUES (
      item_record.id,
      item_record.default_unit_cost,
      item_record.default_sale_price,
      item_record.default_waste_percentage,
      clean_cost,
      clean_sale,
      item_record.default_waste_percentage,
      'aporte_usuarios',
      clean_reason,
      app.current_user_id()
    );
  END IF;

  UPDATE public.catalog_price_contributions
  SET
    status = CASE requested_action WHEN 'approve' THEN 'approved' ELSE 'rejected' END,
    reviewed_by = app.current_user_id(),
    reviewed_at = now(),
    review_notes = clean_reason
  WHERE catalog_item_id = item_record.id
    AND status = 'pending';

  GET DIAGNOSTICS reviewed_count = ROW_COUNT;

  INSERT INTO public.admin_audit_logs (company_id, user_id, action, target_type, target_id, metadata)
  VALUES (
    NULL,
    app.current_user_id(),
    CASE requested_action
      WHEN 'approve' THEN 'ADMIN_PRICE_CONTRIBUTIONS_APPROVED'
      ELSE 'ADMIN_PRICE_CONTRIBUTIONS_REJECTED'
    END,
    'platform_catalog_item',
    item_record.id::text,
    jsonb_build_object(
      'itemName', item_record.name,
      'itemCode', item_record.code,
      'contributions', reviewed_count,
      'reason', clean_reason,
      'previousUnitCost', item_record.default_unit_cost,
      'previousSalePrice', item_record.default_sale_price,
      'unitCost', clean_cost,
      'salePrice', clean_sale
    )
  );

  RETURN reviewed_count;
END
$function$;

REVOKE EXECUTE ON FUNCTION public.submit_catalog_price_contribution(uuid, numeric, numeric, text, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_review_price_contributions(uuid, text, numeric, numeric, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_catalog_price_contribution(uuid, numeric, numeric, text, text) TO contractor_api;
GRANT EXECUTE ON FUNCTION public.admin_review_price_contributions(uuid, text, numeric, numeric, text) TO contractor_api;

RESET ROLE;

COMMIT;
