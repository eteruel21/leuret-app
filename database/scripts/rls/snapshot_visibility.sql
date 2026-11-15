-- Foto de visibilidad RLS: para cada usuario de prueba y cada tabla con RLS,
-- cuántas filas ve contractor_api y un hash de sus identificadores.
--
-- Uso (superusuario, base local de pruebas):
--   psql -v label=antes -f snapshot_visibility.sql
--   ... aplicar la migración ...
--   psql -v label=despues -f snapshot_visibility.sql
--   SELECT * FROM rls_visibility_diff;   -- debe estar vacío

\set ON_ERROR_STOP on

CREATE TABLE IF NOT EXISTS public.rls_visibility_snapshot (
  label text, table_name text, user_id uuid, visible bigint, ids_hash text
);
DELETE FROM public.rls_visibility_snapshot WHERE label = :'label';
SELECT set_config('rls_snapshot.label', :'label', false);

DO $snap$
DECLARE
  t record;
  u record;
  n bigint;
  h text;
  snapshot_label text := current_setting('rls_snapshot.label');
BEGIN
  FOR u IN
    SELECT DISTINCT user_id FROM (
      SELECT DISTINCT ON (m.role, m.active, p.active, p.approved_at IS NULL, c.active) m.user_id
      FROM public.company_members m
      JOIN public.profiles p ON p.id = m.user_id
      JOIN public.companies c ON c.id = m.company_id
      UNION ALL SELECT user_id FROM (SELECT user_id FROM public.clients WHERE user_id IS NOT NULL LIMIT 3) x
      UNION ALL SELECT id FROM public.profiles WHERE role::text = 'super_admin'
      UNION ALL SELECT m.user_id FROM public.company_members m GROUP BY 1 HAVING count(*) > 1
    ) s
  LOOP
    FOR t IN
      SELECT format('%I.%I', n.nspname, c.relname) AS fq,
             EXISTS (SELECT 1 FROM pg_attribute a WHERE a.attrelid = c.oid AND a.attname = 'id' AND NOT a.attisdropped) AS has_id
      FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE c.relkind = 'r' AND c.relrowsecurity AND n.nspname IN ('public', 'private')
        AND c.relname <> 'rls_visibility_snapshot'
      ORDER BY 1
    LOOP
      PERFORM set_config('app.user_id', u.user_id::text, true);
      BEGIN
        EXECUTE 'SET LOCAL ROLE contractor_api';
        EXECUTE format(
          'SELECT count(*), md5(COALESCE(string_agg(%s, '','' ORDER BY %s), '''')) FROM %s',
          CASE WHEN t.has_id THEN 'id::text' ELSE 'ctid::text' END,
          CASE WHEN t.has_id THEN 'id::text' ELSE 'ctid::text' END,
          t.fq)
          INTO n, h;
      EXCEPTION WHEN insufficient_privilege THEN
        n := -1; h := 'sin permiso';
      END;
      EXECUTE 'RESET ROLE';
      INSERT INTO public.rls_visibility_snapshot VALUES (snapshot_label, t.fq, u.user_id, n, h);
    END LOOP;
  END LOOP;
END
$snap$;

CREATE OR REPLACE VIEW public.rls_visibility_diff AS
SELECT a.table_name, a.user_id, a.visible AS antes, b.visible AS despues
FROM public.rls_visibility_snapshot a
FULL JOIN public.rls_visibility_snapshot b
  ON b.label = 'despues' AND a.table_name = b.table_name AND a.user_id = b.user_id
WHERE a.label = 'antes'
  AND (b.ids_hash IS DISTINCT FROM a.ids_hash);

SELECT label, count(*) AS combinaciones, sum(visible) FILTER (WHERE visible >= 0) AS filas_visibles,
       count(*) FILTER (WHERE visible < 0) AS sin_permiso
FROM public.rls_visibility_snapshot GROUP BY label ORDER BY label;
