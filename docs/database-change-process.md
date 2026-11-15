# Proceso seguro de cambios de base de datos (PostgreSQL / Supabase)

Este es el camino para cualquier cambio de esquema, políticas RLS, funciones o
datos de catálogo en producción. Resume las reglas que antes estaban repartidas
en notas de cada PR y agrega dos controles automáticos nuevos: el **lint de
esquema** (CI) y la **detección de deriva** (despliegue).

## Resumen

| Paso | Dónde | Qué protege |
|---|---|---|
| 1. Migración nueva, numerada, en una transacción | PR | Historial inmutable, todo o nada |
| 2. CI: migraciones desde cero + lint + pruebas RLS | `validate.yml` pasos 8, 8b, 10 | Que la migración aplica, cumple las reglas y no rompe permisos |
| 3. Respaldo antes de aplicar | `npm run db:backup:local` | Poder volver atrás con datos |
| 4. Aplicar en producción **antes** del merge | `npm run db:migrate:supabase` | Que el deploy no se bloquee |
| 5. Verificar | `db:check:supabase`, `db:drift:supabase`, asesores | Que producción quedó igual que el repositorio |
| 6. Merge → deploy | `deploy.yml` pasos 5 y 5b | Bloquea el deploy si falta una migración o si alguien cambió algo a mano |

## 1. Escribir la migración

- Archivo nuevo en `database/migrations/NNN_descripcion.sql`, con el número
  siguiente. **Nunca** se edita una migración aplicada: el checksum cambia y
  `migrate.mjs` se niega a seguir. Para corregir, otra migración.
- Estructura:

  ```sql
  BEGIN;

  SET ROLE contractor_owner;

  -- Qué cambia y por qué (en español, para quien la lea en un año).

  SET LOCAL lock_timeout = '5s';      -- falla rápido en vez de bloquear la API
  SET LOCAL statement_timeout = '120s';

  ...

  RESET ROLE;

  COMMIT;
  ```

- `lock_timeout` es importante en tablas con uso: `ALTER TABLE`, `CREATE/DROP
  POLICY` y `DROP INDEX` toman un bloqueo exclusivo. Si hay una transacción
  larga, sin `lock_timeout` la migración espera y detrás de ella se encolan
  todas las consultas de la API. Con `lock_timeout` falla en 5 s y se reintenta.
- Mientras las tablas sean pequeñas (hoy la mayor tiene ~1 400 filas), crear un
  índice dentro de la transacción es instantáneo. Cuando una tabla pase de
  ~1 millón de filas, el índice debe crearse con `CREATE INDEX CONCURRENTLY`,
  que no puede ir dentro de `BEGIN … COMMIT`: habrá que aplicarlo aparte desde
  el SQL Editor y registrarlo a mano (ver paso 4).

### Reglas de esquema (las comprueba `schema-lint.sql` en CI)

| Regla | Por qué | Cómo cumplirla |
|---|---|---|
| `fk_without_index` | Sin índice, borrar o actualizar la fila padre recorre toda la tabla hija | `CREATE INDEX … (columna_fk)`; un índice parcial `WHERE col IS NOT NULL` sirve |
| `multiple_permissive_policies` | PostgreSQL evalúa **todas** las políticas permisivas en cada fila | Una política por tabla y acción, con `OR` de las condiciones |
| `rls_per_row_membership_call` | `is_company_member(company_id)` se ejecuta una vez **por fila** (200× más lento con 2 000 filas) | Usar los arreglos que se calculan una vez por consulta (abajo) |
| `table_without_rls` | Una tabla de `public`/`private` sin RLS es visible para todo el que tenga permiso | `ALTER TABLE … ENABLE ROW LEVEL SECURITY` y sus políticas |
| `table_without_primary_key` | Sin PK no hay forma segura de editar o replicar filas | Agregar PK |
| `security_definer_without_search_path` | Una función privilegiada sin `search_path` fijo puede ejecutar objetos de otro esquema | `SET search_path = ''` y nombres calificados |
| `redundant_index` | Un índice cubierto por otro solo cuesta en cada escritura | No crearlo, o quitarlo |

Se puede correr en local con `npm run db:lint` (usa `MIGRATOR_DATABASE_URL`).

### Plantillas para políticas RLS

```sql
-- Miembros activos de la empresa (antes: public.is_company_member(company_id))
company_id = ANY ((SELECT private.member_company_ids())::uuid[])

-- Propietario o administrador (antes: public.is_company_admin(company_id))
company_id = ANY ((SELECT private.member_company_ids(
  ARRAY['owner', 'admin']::public.company_role[]))::uuid[])

-- Rol con usuario y empresa activos (antes: public.has_company_role(company_id, ARRAY[...]))
company_id = ANY ((SELECT private.active_role_company_ids(
  ARRAY['owner', 'admin', 'estimator']::public.company_role[]))::uuid[])

-- Superadministrador y usuario actual: siempre dentro de (SELECT …)
(SELECT private.is_super_admin())
user_id = (SELECT app.current_user_id())
```

- El `(SELECT …)` hace que PostgreSQL calcule el valor una sola vez por
  consulta (InitPlan). El `::uuid[]` es obligatorio: sin él, `= ANY ((SELECT
  f()))` se interpreta como subconsulta de arreglos y falla (`uuid = uuid[]`).
- Las políticas restrictivas `approved_platform_users_only` se mantienen en
  cada tabla.
- Las funciones `public.is_company_member()`, `is_company_admin()`, etc. siguen
  existiendo para la API (donde se llaman con valores fijos y se evalúan una
  vez); solo no deben usarse dentro de políticas.

## 2. Probar en CI

La PR corre `validate.yml`:

- **Paso 8:** crea una base PostgreSQL 17 vacía y aplica todas las migraciones
  desde la 001.
- **Paso 8b:** `schema-lint.mjs` sobre esa base. Cualquier infracción falla la PR.
- **Paso 9:** respaldo y restauración de esa base.
- **Paso 10:** pruebas de autenticación, aislamiento entre empresas y RLS como
  `contractor_api`.

Para cambios grandes de RLS, además del CI:
`database/scripts/rls/generate_rls_consolidation.py` (genera la reescritura y
su reversión) y `database/scripts/rls/verify_rls_equivalence.sql` /
`snapshot_visibility.sql` (comprueban, fila por fila y para cada tipo de
usuario, que nadie gana ni pierde acceso). Así se hizo la migración 048.

## 3. Respaldar antes de aplicar

```bash
npm run db:backup:local      # copia lógica en tu equipo (docs/backup-restore-verification.md)
```

Y anotar la hora: si el plan de Supabase tiene PITR, sirve para restaurar a
ese punto.

## 4. Aplicar en producción (antes del merge)

**Opción recomendada** (desde una computadora con `database/.env.supabase`):

```bash
npm run db:status:supabase   # ver qué está pendiente
npm run db:migrate:supabase  # aplica y registra el checksum
```

**Si solo hay acceso desde el teléfono** (SQL Editor o MCP de Supabase):

1. Pegar el archivo completo tal como está.
   - El MCP pide confirmación para SQL con `DROP …`; desde el móvil ese aviso
     puede vencer. En ese caso, pegarlo en el SQL Editor.
   - Si la confirmación venció, antes de reintentar comprobar que no quedó
     nada a medias (la transacción no se ejecuta si no se confirma).
2. Registrar la migración con el checksum SHA-256 del archivo:

   ```sql
   INSERT INTO app_migrations.schema_migrations (filename, checksum)
   VALUES ('NNN_descripcion.sql', '<sha256 del archivo>');
   ```

   (`sha256sum database/migrations/NNN_descripcion.sql`).

**Por qué antes del merge:** el deploy (`deploy.yml`, paso 5) se bloquea si hay
migraciones en el repositorio que producción no tiene. Si se fusiona primero,
todos los deploys fallan hasta aplicarla (pasó con la 040 y la 045).

## 5. Verificar

```bash
npm run db:check:supabase    # "Sin deriva: N migraciones coinciden"
npm run db:drift:supabase    # compara el esquema completo (ver abajo)
```

Y en el panel de Supabase → Advisors (seguridad y rendimiento), o con el MCP
`get_advisors`. Después de la 048, el asesor de rendimiento solo debería
mostrar índices "sin uso" (normal con poco tráfico; no se quitan los de FK).

## 6. Merge y despliegue

`deploy.yml` ahora tiene dos bloqueos de base de datos:

- **Paso 5 — migraciones:** falla si hay migraciones pendientes, alteradas o
  registradas sin archivo.
- **Paso 5b — deriva de esquema (nuevo):** construye una base de referencia
  con las migraciones de `main` y compara su **huella** (`schema-fingerprint.sql`:
  tablas, columnas, restricciones, índices, políticas, funciones, disparadores,
  permisos, enums, vistas) con la de producción. Falla si alguien cambió algo a
  mano en producción que no está en una migración, o si una migración se
  aplicó con un contenido distinto del archivo. Normaliza espacios y
  comentarios, porque el SQL Editor y el MCP los alteran.

Si el paso 5b falla:

1. Leer el informe: dice qué objeto falta, sobra o tiene otra definición.
2. Si el cambio de producción es correcto, escribirlo como migración nueva
   (que deje la base de referencia igual a producción) y seguir este proceso.
3. Si no lo es, revertirlo en producción.

## Reversión

- Nunca se edita una migración aplicada. Se revierte con una migración nueva.
- Para la 048 hay una reversión lista y probada:
  `database/rollbacks/048_rls_and_index_optimization.down.sql` (restaura las
  223 políticas originales, los 23 índices y la función de recordatorios).
  Se copia como `049_…sql` y se aplica con este mismo proceso.
- Ver también `docs/rollback-procedure.md` para la API y las apps.

## Herramientas

| Archivo | Uso |
|---|---|
| `database/scripts/migrate.mjs` | Aplica migraciones con checksum y bloqueo (`--status`, `--check`) |
| `database/scripts/schema-lint.sql` / `.mjs` | Reglas de esquema (CI paso 8b, `npm run db:lint`) |
| `database/scripts/schema-fingerprint.sql` | Huella normalizada del esquema |
| `database/scripts/schema-drift.mjs` | Compara dos huellas (deploy paso 5b, `npm run db:drift:supabase` con `REFERENCE_DATABASE_URL`) |
| `database/scripts/rls/` | Generador, verificador de equivalencia y foto de visibilidad RLS |
| `database/rollbacks/` | Reversiones preparadas (no las lee `migrate.mjs`) |
