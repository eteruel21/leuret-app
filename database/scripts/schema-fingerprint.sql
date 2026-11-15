-- Huella del esquema de la aplicación.
--
-- Devuelve una fila por objeto (kind, name, hash, definition) de los esquemas
-- public, private, app y app_auth. Las definiciones se normalizan para que dos
-- bases construidas con las mismas migraciones den la misma huella aunque una
-- se haya aplicado desde el SQL Editor o el MCP de Supabase (que colapsan
-- saltos de línea y quitan comentarios).
--
-- Lo usa database/scripts/schema-drift.mjs, que compara producción con una
-- base efímera construida con las migraciones de main (paso 5b de
-- deploy.yml). Así se detectan cambios hechos a mano fuera de las migraciones.
--
-- Solo lee el catálogo. No toca datos. app_migrations se excluye: lo crea la
-- herramienta de migraciones, no las migraciones.

WITH app_schemas AS (
  SELECT oid, nspname
  FROM pg_catalog.pg_namespace
  WHERE nspname IN ('public', 'private', 'app', 'app_auth')
),
relations AS (
  SELECT c.oid, s.nspname, c.relname, c.relkind
  FROM pg_catalog.pg_class c
  JOIN app_schemas s ON s.oid = c.relnamespace
  WHERE c.relkind IN ('r', 'p', 'v', 'm', 'S')
    -- Extensiones instaladas en public (p. ej. pg_stat_statements en Supabase)
    AND NOT EXISTS (
      SELECT 1 FROM pg_catalog.pg_depend d
      WHERE d.classid = 'pg_catalog.pg_class'::regclass
        AND d.objid = c.oid AND d.deptype = 'e'
    )
),
objects AS (
  -- Tablas, vistas y secuencias: tipo, dueño, RLS
  SELECT 'relation' AS kind,
         r.nspname || '.' || r.relname AS name,
         concat_ws(' ', 'relkind=' || r.relkind::text,
                   'owner=' || pg_catalog.pg_get_userbyid(c.relowner),
                   'rls=' || c.relrowsecurity,
                   'force_rls=' || c.relforcerowsecurity) AS definition
  FROM relations r JOIN pg_catalog.pg_class c ON c.oid = r.oid

  UNION ALL
  -- Columnas
  SELECT 'column',
         r.nspname || '.' || r.relname || '.' || a.attname,
         concat_ws(' ',
           pg_catalog.format_type(a.atttypid, a.atttypmod),
           CASE WHEN a.attnotnull THEN 'not null' END,
           CASE WHEN a.attidentity <> '' THEN 'identity=' || a.attidentity::text END,
           CASE WHEN a.attgenerated <> '' THEN 'generated' END,
           'default=' || pg_catalog.pg_get_expr(d.adbin, d.adrelid))
  FROM relations r
  JOIN pg_catalog.pg_attribute a ON a.attrelid = r.oid AND a.attnum > 0 AND NOT a.attisdropped
  LEFT JOIN pg_catalog.pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
  WHERE r.relkind IN ('r', 'p', 'v', 'm')

  UNION ALL
  -- Vistas: definición
  SELECT 'view', r.nspname || '.' || r.relname, pg_catalog.pg_get_viewdef(r.oid, true)
  FROM relations r WHERE r.relkind IN ('v', 'm')

  UNION ALL
  -- Restricciones (PK, FK, UNIQUE, CHECK, EXCLUDE)
  SELECT 'constraint',
         r.nspname || '.' || r.relname || '.' || con.conname,
         pg_catalog.pg_get_constraintdef(con.oid, true)
  FROM relations r JOIN pg_catalog.pg_constraint con ON con.conrelid = r.oid

  UNION ALL
  -- Índices
  SELECT 'index', r.nspname || '.' || i.relname, pg_catalog.pg_get_indexdef(i.oid)
  FROM relations r
  JOIN pg_catalog.pg_index x ON x.indrelid = r.oid
  JOIN pg_catalog.pg_class i ON i.oid = x.indexrelid

  UNION ALL
  -- Políticas RLS
  SELECT 'policy',
         p.schemaname || '.' || p.tablename || '.' || p.policyname,
         concat_ws(' | ', p.permissive, p.cmd, p.roles::text,
                   'using=' || p.qual, 'check=' || p.with_check)
  FROM pg_catalog.pg_policies p
  WHERE p.schemaname IN (SELECT nspname FROM app_schemas)

  UNION ALL
  -- Disparadores
  SELECT 'trigger', r.nspname || '.' || r.relname || '.' || t.tgname,
         pg_catalog.pg_get_triggerdef(t.oid) || ' enabled=' || t.tgenabled::text
  FROM relations r JOIN pg_catalog.pg_trigger t ON t.tgrelid = r.oid AND NOT t.tgisinternal

  UNION ALL
  -- Funciones: firma, atributos de seguridad y cuerpo
  SELECT 'function',
         s.nspname || '.' || p.proname || '(' || pg_catalog.pg_get_function_identity_arguments(p.oid) || ')',
         concat_ws(' ',
           'returns=' || pg_catalog.pg_get_function_result(p.oid),
           'lang=' || l.lanname,
           'volatile=' || p.provolatile::text,
           'secdef=' || p.prosecdef,
           'owner=' || pg_catalog.pg_get_userbyid(p.proowner),
           'config=' || COALESCE(pg_catalog.array_to_string(p.proconfig, ','), ''),
           'acl=' || COALESCE(pg_catalog.array_to_string(
             ARRAY(SELECT x FROM pg_catalog.unnest(p.proacl::text[]) x ORDER BY x), ','), 'default'),
           -- Sin comentarios ni espacios: el SQL Editor y el MCP de Supabase
           -- guardan el cuerpo sin comentarios y con otros saltos de línea.
           'body=' || pg_catalog.md5(pg_catalog.regexp_replace(
             pg_catalog.regexp_replace(p.prosrc, '--[^\n]*', '', 'g'), '\s+', '', 'g')))
  FROM pg_catalog.pg_proc p
  JOIN app_schemas s ON s.oid = p.pronamespace
  JOIN pg_catalog.pg_language l ON l.oid = p.prolang
  WHERE NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_depend d
    WHERE d.classid = 'pg_catalog.pg_proc'::regclass AND d.objid = p.oid AND d.deptype = 'e'
  )

  UNION ALL
  -- Permisos de tablas, vistas y secuencias
  SELECT 'grant', r.nspname || '.' || r.relname,
         COALESCE(pg_catalog.array_to_string(
           ARRAY(SELECT x FROM pg_catalog.unnest(c.relacl::text[]) x ORDER BY x), ','), 'default')
  FROM relations r JOIN pg_catalog.pg_class c ON c.oid = r.oid

  UNION ALL
  -- Tipos enumerados
  SELECT 'enum', s.nspname || '.' || t.typname,
         pg_catalog.array_to_string(ARRAY(
           SELECT e.enumlabel FROM pg_catalog.pg_enum e
           WHERE e.enumtypid = t.oid ORDER BY e.enumsortorder), ',')
  FROM pg_catalog.pg_type t JOIN app_schemas s ON s.oid = t.typnamespace
  WHERE t.typtype = 'e'
)
SELECT kind,
       name,
       pg_catalog.md5(
         pg_catalog.regexp_replace(
           pg_catalog.regexp_replace(pg_catalog.btrim(COALESCE(definition, '')), '\s+', ' ', 'g'),
           '\s*([(),])\s*', '\1', 'g')
       ) AS hash,
       definition
FROM objects
ORDER BY kind, name;
