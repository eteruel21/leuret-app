BEGIN;

SET ROLE contractor_owner;

-- Precios regionales del catálogo de plataforma.
--
-- Los precios base del catálogo son de Panamá metropolitano (Panamá y
-- San Miguelito, donde el INEC levanta el IPMC). Cada usuario puede elegir
-- la región donde trabaja y el catálogo le devuelve los precios ajustados
-- por un factor según el tipo de partida. Los precios personales
-- (user_catalog_price_overrides) nunca se ajustan: mandan siempre.

CREATE TABLE IF NOT EXISTS public.platform_price_regions (
  code text PRIMARY KEY,
  name text NOT NULL,
  coverage text NOT NULL,
  material_factor numeric(5,3) NOT NULL DEFAULT 1,
  labor_factor numeric(5,3) NOT NULL DEFAULT 1,
  equipment_factor numeric(5,3) NOT NULL DEFAULT 1,
  service_factor numeric(5,3) NOT NULL DEFAULT 1,
  notes text,
  sort_order integer NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT platform_price_regions_code_format CHECK (code ~ '^[a-z0-9_]+$'),
  CONSTRAINT platform_price_regions_factors_range CHECK (
    material_factor BETWEEN 0.5 AND 2
    AND labor_factor BETWEEN 0.5 AND 2
    AND equipment_factor BETWEEN 0.5 AND 2
    AND service_factor BETWEEN 0.5 AND 2
  )
);

DROP TRIGGER IF EXISTS platform_price_regions_touch_updated_at ON public.platform_price_regions;
CREATE TRIGGER platform_price_regions_touch_updated_at
  BEFORE UPDATE ON public.platform_price_regions
  FOR EACH ROW EXECUTE FUNCTION private.touch_updated_at();

CREATE TABLE IF NOT EXISTS public.user_price_regions (
  user_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  region_code text NOT NULL REFERENCES public.platform_price_regions(code) ON UPDATE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS user_price_regions_region_code_fk_idx
  ON public.user_price_regions (region_code);

DROP TRIGGER IF EXISTS user_price_regions_touch_updated_at ON public.user_price_regions;
CREATE TRIGGER user_price_regions_touch_updated_at
  BEFORE UPDATE ON public.user_price_regions
  FOR EACH ROW EXECUTE FUNCTION private.touch_updated_at();

ALTER TABLE public.platform_price_regions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_price_regions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS platform_price_regions_select ON public.platform_price_regions;
CREATE POLICY platform_price_regions_select
  ON public.platform_price_regions FOR SELECT TO contractor_api
  USING ((SELECT private.is_active_platform_user()));

DROP POLICY IF EXISTS platform_price_regions_super_admin_insert ON public.platform_price_regions;
CREATE POLICY platform_price_regions_super_admin_insert
  ON public.platform_price_regions FOR INSERT TO contractor_api
  WITH CHECK ((SELECT private.is_super_admin()));

DROP POLICY IF EXISTS platform_price_regions_super_admin_update ON public.platform_price_regions;
CREATE POLICY platform_price_regions_super_admin_update
  ON public.platform_price_regions FOR UPDATE TO contractor_api
  USING ((SELECT private.is_super_admin()))
  WITH CHECK ((SELECT private.is_super_admin()));

DROP POLICY IF EXISTS user_price_regions_own ON public.user_price_regions;
CREATE POLICY user_price_regions_own
  ON public.user_price_regions FOR ALL TO contractor_api
  USING (
    (SELECT private.is_active_platform_user())
    AND user_id = (SELECT app.current_user_id())
  )
  WITH CHECK (
    (SELECT private.is_active_platform_user())
    AND user_id = (SELECT app.current_user_id())
  );

GRANT SELECT, INSERT, UPDATE ON public.platform_price_regions TO contractor_api;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_price_regions TO contractor_api;

-- Factores iniciales (estimados, editables por el super admin).
-- Mano de obra: el salario mínimo de construcción 2026 es B/.3.51/h en
-- Región 1 y B/.3.30/h en Región 2 (D.E. 13 de 2025), un 6% menos; en el
-- interior el mercado se mueve cerca de ese diferencial. Darién, Bocas y
-- las comarcas suman viáticos y traslado de cuadrilla.
-- Materiales y equipo: flete desde Panamá; las cabeceras con ferreterías
-- grandes (Cochez, Novey, Do it Center) apenas varían.
-- Partidas (service/subcontract): 55% materiales, 35% mano de obra, 10% equipo.
INSERT INTO public.platform_price_regions
  (code, name, coverage, material_factor, labor_factor, equipment_factor, service_factor, notes, sort_order)
VALUES
  ('panama_metro', 'Panamá metropolitano', 'Panamá, San Miguelito', 1.000, 1.000, 1.000, 1.000,
   'Base del catálogo (IPMC del INEC, convención de la construcción).', 10),
  ('panama_oeste', 'Panamá Oeste', 'Arraiján, La Chorrera, Capira, Chame, San Carlos', 1.000, 0.970, 1.000, 0.990,
   'Mismo abastecimiento que la capital; mano de obra algo menor.', 20),
  ('colon', 'Colón', 'Provincia de Colón', 1.020, 1.000, 1.030, 1.014,
   'Flete corto desde Panamá.', 30),
  ('cocle', 'Coclé', 'Penonomé, Aguadulce, Antón, Natá', 1.020, 0.950, 1.020, 0.996,
   'Interior: salario mínimo de Región 2 en gran parte de la provincia.', 40),
  ('azuero', 'Azuero', 'Herrera y Los Santos', 1.030, 0.950, 1.030, 1.002,
   'Interior con ferreterías grandes en Chitré.', 50),
  ('veraguas', 'Veraguas', 'Santiago y resto de la provincia', 1.030, 0.950, 1.030, 1.002,
   'Interior con ferreterías grandes en Santiago.', 60),
  ('chiriqui', 'Chiriquí', 'David, Boquete, Bugaba y resto de la provincia', 1.030, 0.950, 1.030, 1.002,
   'Interior con ferreterías grandes en David.', 70),
  ('bocas_del_toro', 'Bocas del Toro', 'Changuinola, Almirante, islas', 1.120, 1.000, 1.100, 1.076,
   'Flete largo; en islas sumar transporte marítimo aparte.', 80),
  ('darien', 'Darién', 'Provincia de Darién', 1.100, 1.050, 1.100, 1.078,
   'Flete largo y viáticos de cuadrilla.', 90),
  ('comarcas', 'Comarcas', 'Guna Yala, Ngäbe-Buglé, Emberá-Wounaan', 1.180, 1.100, 1.150, 1.149,
   'Acceso difícil; revisar caso por caso.', 100)
ON CONFLICT (code) DO NOTHING;

-- La vista añade la región al final (CREATE OR REPLACE solo permite agregar
-- columnas al final). unit_cost y sale_price ya vienen ajustados.
CREATE OR REPLACE VIEW public.effective_platform_catalog_prices
WITH (security_invoker = true) AS
WITH user_region AS (
  SELECT region.*
  FROM public.user_price_regions AS choice
  JOIN public.platform_price_regions AS region
    ON region.code = choice.region_code
   AND region.active = true
  WHERE choice.user_id = (SELECT app.current_user_id())
)
SELECT
  catalog.id,
  catalog.code,
  catalog.sku,
  catalog.name,
  catalog.description,
  catalog.item_type,
  catalog.category_name,
  catalog.unit_name,
  catalog.unit_symbol,
  catalog.default_unit_cost,
  catalog.default_sale_price,
  catalog.default_waste_percentage,
  COALESCE(overrides.unit_cost, round(catalog.default_unit_cost * factor.value, 2)) AS unit_cost,
  COALESCE(overrides.sale_price, round(catalog.default_sale_price * factor.value, 2)) AS sale_price,
  COALESCE(overrides.waste_percentage, catalog.default_waste_percentage) AS waste_percentage,
  (overrides.catalog_item_id IS NOT NULL) AS has_override,
  catalog.active,
  catalog.updated_at,
  overrides.updated_at AS override_updated_at,
  COALESCE((SELECT user_region.code FROM user_region), 'panama_metro') AS region_code,
  factor.value AS region_factor
FROM public.platform_catalog_items AS catalog
LEFT JOIN public.user_catalog_price_overrides AS overrides
  ON overrides.catalog_item_id = catalog.id
 AND overrides.user_id = (SELECT app.current_user_id())
CROSS JOIN LATERAL (
  SELECT COALESCE(
    (
      SELECT CASE catalog.item_type::text
        WHEN 'material' THEN user_region.material_factor
        WHEN 'labor' THEN user_region.labor_factor
        WHEN 'equipment' THEN user_region.equipment_factor
        ELSE user_region.service_factor
      END
      FROM user_region
    ),
    1::numeric
  ) AS value
) AS factor;

GRANT SELECT ON public.effective_platform_catalog_prices TO contractor_api;

RESET ROLE;

COMMIT;
