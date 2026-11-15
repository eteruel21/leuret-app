-- Comprueba que la reescritura de políticas RLS es equivalente.
--
-- Uso (base local con datos de prueba, como superusuario):
--   psql -v pairs="$(cat pairs.json)" -f verify_rls_equivalence.sql
--
-- `pairs` lo genera generate_rls_consolidation.py: por cada tabla y acción,
-- la expresión efectiva antigua y la nueva ((OR permisivas) AND restrictivas).
-- Para cada usuario de prueba y cada fila (reales y sintéticas) evalúa las
-- dos expresiones y cuenta las filas donde dan un resultado distinto.
-- Termina con error si hay alguna diferencia.

\set ON_ERROR_STOP on

CREATE TEMP TABLE rls_pairs AS
SELECT * FROM jsonb_to_recordset(:'pairs'::jsonb)
  AS x(schema text, "table" text, cmd text, kind text, old text, new text);

CREATE TEMP TABLE rls_test_users AS
SELECT DISTINCT user_id FROM (
  -- Un usuario por cada combinación de rol de empresa, estado de membresía,
  -- estado de perfil y de empresa, más clientes vinculados y sueltos.
  SELECT DISTINCT ON (m.role, m.active, p.active, p.approved_at IS NULL, c.active)
         m.user_id
  FROM public.company_members m
  JOIN public.profiles p ON p.id = m.user_id
  JOIN public.companies c ON c.id = m.company_id
  UNION ALL
  SELECT user_id FROM (SELECT user_id FROM public.clients WHERE user_id IS NOT NULL LIMIT 3) linked
  UNION ALL
  SELECT id FROM public.profiles WHERE role::text = 'super_admin'
  UNION ALL
  SELECT u.id FROM app_auth.users u WHERE u.email_confirmed_at IS NULL
  UNION ALL
  SELECT m.user_id FROM public.company_members m GROUP BY m.user_id HAVING count(*) > 1
  UNION ALL
  SELECT NULL::uuid
) s;

CREATE TEMP TABLE rls_results (
  schema text, "table" text, cmd text, kind text,
  user_id uuid, rows_checked bigint, mismatches bigint
);

DO $verify$
DECLARE
  pair record;
  tester record;
  source_sql text;
  checked bigint;
  bad bigint;
  has_rows boolean;
BEGIN
  FOR pair IN SELECT * FROM rls_pairs ORDER BY 1, 2, 3, 4 LOOP
    EXECUTE format('SELECT EXISTS (SELECT 1 FROM %I.%I)', pair.schema, pair."table")
      INTO has_rows;

    IF has_rows THEN
      source_sql := format(
        '(SELECT * FROM %I.%I ORDER BY random() LIMIT 3000) AS %I',
        pair.schema, pair."table", pair."table");
    ELSE
      -- Tabla vacía: filas sintéticas con cada empresa y cada usuario de
      -- prueba en las columnas que suelen decidir el acceso.
      source_sql := format($src$
        (SELECT (jsonb_populate_record(NULL::%1$I.%2$I, jsonb_build_object(
            'id', gen_random_uuid(),
            'company_id', c.id,
            'user_id', u.user_id,
            'requester_id', u.user_id,
            'created_by', u.user_id,
            'client_id', cl.id,
            'active', true
          ))).*
         FROM public.companies c
         CROSS JOIN rls_test_users u
         LEFT JOIN LATERAL (SELECT id FROM public.clients WHERE company_id = c.id LIMIT 1) cl ON true
        ) AS %2$I$src$, pair.schema, pair."table");
    END IF;

    FOR tester IN SELECT user_id FROM rls_test_users LOOP
      PERFORM set_config('app.user_id', COALESCE(tester.user_id::text, ''), true);
      EXECUTE format(
        'SELECT count(*), count(*) FILTER (WHERE COALESCE((%s), false) IS DISTINCT FROM COALESCE((%s), false)) FROM %s',
        COALESCE(pair.old, 'false'), COALESCE(pair.new, 'false'), source_sql)
        INTO checked, bad;
      INSERT INTO rls_results VALUES (pair.schema, pair."table", pair.cmd, pair.kind,
        tester.user_id, checked, bad);
    END LOOP;
  END LOOP;
END
$verify$;

SELECT count(DISTINCT (schema, "table", cmd, kind)) AS expresiones,
       count(DISTINCT user_id) + 1 AS usuarios,
       sum(rows_checked) AS evaluaciones,
       sum(mismatches) AS diferencias
FROM rls_results;

SELECT schema, "table", cmd, kind, user_id, rows_checked, mismatches
FROM rls_results WHERE mismatches > 0 ORDER BY 1, 2, 3, 4 LIMIT 50;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM rls_results WHERE mismatches > 0) THEN
    RAISE EXCEPTION 'La reescritura RLS cambia el resultado en algunas filas';
  END IF;
END $$;
