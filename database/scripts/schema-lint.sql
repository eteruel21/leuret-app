-- Reglas de esquema que CI exige en cada PR (database/scripts/schema-lint.mjs).
--
-- Cada fila es una infracción: (rule, object, detail). Sin filas = todo bien.
-- Las reglas evitan volver a los problemas corregidos en la migración 048.
-- Solo lee el catálogo.

WITH app_tables AS (
  SELECT c.oid, n.nspname, c.relname, c.relrowsecurity
  FROM pg_catalog.pg_class c
  JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
  WHERE c.relkind IN ('r', 'p')
    AND n.nspname IN ('public', 'private', 'app_auth')
    AND NOT EXISTS (
      SELECT 1 FROM pg_catalog.pg_depend d
      WHERE d.classid = 'pg_catalog.pg_class'::regclass AND d.objid = c.oid AND d.deptype = 'e'
    )
),
policy_actions AS (
  SELECT p.schemaname, p.tablename, p.policyname, role_name, action
  FROM pg_catalog.pg_policies p
  CROSS JOIN LATERAL pg_catalog.unnest(p.roles) AS role_name
  CROSS JOIN LATERAL pg_catalog.unnest(
    CASE WHEN p.cmd = 'ALL' THEN ARRAY['SELECT', 'INSERT', 'UPDATE', 'DELETE'] ELSE ARRAY[p.cmd] END
  ) AS action
  WHERE p.permissive = 'PERMISSIVE'
),
index_columns AS (
  SELECT i.indexrelid, i.indrelid, i.indisunique, i.indisprimary,
         pg_catalog.string_to_array(i.indkey::text, ' ')::int2[] AS cols,
         i.indpred IS NOT NULL OR i.indexprs IS NOT NULL AS special,
         i.indexprs IS NOT NULL AS has_expressions,
         c.relam
  FROM pg_catalog.pg_index i
  JOIN pg_catalog.pg_class c ON c.oid = i.indexrelid
  WHERE i.indrelid IN (SELECT oid FROM app_tables)
)

-- 1. Clave foránea sin índice que empiece por sus columnas.
SELECT 'fk_without_index' AS rule,
       con.conrelid::regclass::text || '.' || con.conname AS object,
       pg_catalog.pg_get_constraintdef(con.oid) AS detail
FROM pg_catalog.pg_constraint con
WHERE con.contype = 'f'
  AND con.conrelid IN (SELECT oid FROM app_tables)
  AND NOT EXISTS (
    SELECT 1 FROM index_columns ic
    WHERE ic.indrelid = con.conrelid
      -- Un índice parcial (p. ej. WHERE user_id IS NOT NULL) sirve para la FK.
      AND NOT ic.has_expressions
      AND ic.cols[1:pg_catalog.array_length(con.conkey, 1)] @> con.conkey
      AND ic.cols[1:pg_catalog.array_length(con.conkey, 1)] <@ con.conkey
  )

UNION ALL
-- 2. Más de una política permisiva para la misma tabla, rol y acción
--    (asesor multiple_permissive_policies). Fusionarlas con OR.
SELECT 'multiple_permissive_policies',
       schemaname || '.' || tablename || ' ' || action || ' ' || role_name,
       pg_catalog.string_agg(policyname, ', ' ORDER BY policyname)
FROM policy_actions
GROUP BY schemaname, tablename, role_name, action
HAVING count(*) > 1

UNION ALL
-- 3. Política que llama por fila a una función de membresía. Usar
--    company_id = ANY ((SELECT private.member_company_ids())::uuid[]) o
--    private.active_role_company_ids(...), que se evalúan una vez por consulta.
SELECT 'rls_per_row_membership_call',
       p.schemaname || '.' || p.tablename || '.' || p.policyname,
       pg_catalog."substring"(COALESCE(p.qual, '') || ' ' || COALESCE(p.with_check, ''),
         '(is_company_member|is_company_admin|is_company_owner|has_company_role|can_manage_job_requests|is_admin)\(')
FROM pg_catalog.pg_policies p
WHERE p.schemaname IN ('public', 'private', 'app_auth')
  AND (COALESCE(p.qual, '') || ' ' || COALESCE(p.with_check, ''))
      ~ '(^|[^_a-z])(is_company_member|is_company_admin|is_company_owner|has_company_role|can_manage_job_requests|is_admin)\('

UNION ALL
-- 4. Tabla de public o private sin RLS. (app_auth no se expone y se usa
--    solo desde la API con consultas propias.)
SELECT 'table_without_rls', t.nspname || '.' || t.relname, 'ALTER TABLE … ENABLE ROW LEVEL SECURITY'
FROM app_tables t
WHERE t.nspname IN ('public', 'private') AND NOT t.relrowsecurity

UNION ALL
-- 5. Tabla sin clave primaria.
SELECT 'table_without_primary_key', t.nspname || '.' || t.relname, ''
FROM app_tables t
WHERE NOT EXISTS (
  SELECT 1 FROM pg_catalog.pg_constraint con WHERE con.conrelid = t.oid AND con.contype = 'p'
)

UNION ALL
-- 6. SECURITY DEFINER sin search_path fijo.
SELECT 'security_definer_without_search_path', p.oid::regprocedure::text, ''
FROM pg_catalog.pg_proc p
JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname IN ('public', 'private', 'app', 'app_auth')
  AND p.prosecdef
  AND NOT EXISTS (
    SELECT 1 FROM pg_catalog.unnest(COALESCE(p.proconfig, '{}')) AS setting
    WHERE setting LIKE 'search_path=%'
  )

UNION ALL
-- 7. Índice redundante: no único, sin predicado ni expresiones, y otro índice
--    del mismo tipo empieza por las mismas columnas.
SELECT 'redundant_index',
       a.indexrelid::regclass::text,
       'cubierto por ' || pg_catalog.string_agg(b.indexrelid::regclass::text, ', ')
FROM index_columns a
JOIN index_columns b
  ON b.indrelid = a.indrelid
 AND b.indexrelid <> a.indexrelid
 AND b.relam = a.relam
 AND NOT b.special
 AND b.cols[1:pg_catalog.array_length(a.cols, 1)] = a.cols
 AND (pg_catalog.array_length(b.cols, 1) > pg_catalog.array_length(a.cols, 1)
      OR b.indisunique OR b.indexrelid < a.indexrelid)
WHERE NOT a.indisunique AND NOT a.indisprimary AND NOT a.special
GROUP BY a.indexrelid

ORDER BY 1, 2;
