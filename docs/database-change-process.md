# Proceso seguro de cambios de base de datos (PostgreSQL / Supabase)

Este procedimiento cubre cambios de esquema, políticas RLS y funciones de
LEURET. Los cambios de datos de catálogo siguen el [flujo de semillas](migrations-and-seeds.md#semillas-de-catálogo).
CI verifica el esquema y el despliegue compara el historial y el catálogo de
producción con los del commit que va a publicar.

## Resumen

| Paso | Dónde | Qué protege |
|---|---|---|
| 1. Migración nueva, numerada, en una transacción | PR | Historial inmutable, todo o nada |
| 2. CI: migraciones desde cero + lint + pruebas RLS | `Validate Codebase & Build` | Que la migración aplica, cumple las reglas y no rompe permisos |
| 3. Respaldo antes de aplicar | [Respaldos y recuperación](backup-restore-verification.md) | Restaurar datos y archivos desde una copia verificada |
| 4. Aplicar en producción | GitHub Actions *Aplicar migraciones a producción* o `npm run db:migrate:supabase` | Aplicar lo probado, con checksum, sin pegar SQL a mano |
| 5. Verificar | `db:check:supabase`, `db:drift:supabase`, asesores | Que producción quedó igual que el repositorio |
| 6. Publicación o reintento | `deploy.yml` pasos 5 y 5b | El deploy comprueba historial y esquema antes de publicar |

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
- Evalúa el tamaño de la tabla y el bloqueo esperado antes de crear un índice.
  Si hace falta `CREATE INDEX CONCURRENTLY`, documenta una operación revisada
  fuera de la transacción y cómo se registrará y verificará el esquema resultante.

### Reglas de esquema

| Regla | Por qué | Cómo cumplirla |
|---|---|---|
| `fk_without_index` | Sin índice, borrar o actualizar la fila padre recorre toda la tabla hija | `CREATE INDEX … (columna_fk)`; un índice parcial `WHERE col IS NOT NULL` sirve |
| `multiple_permissive_policies` | PostgreSQL evalúa **todas** las políticas permisivas en cada fila | Una política por tabla y acción, con `OR` de las condiciones |
| `rls_per_row_membership_call` | La consulta de membresía se evalúa por fila | Usar los arreglos que se calculan una vez por consulta (abajo) |
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

- Crea una base PostgreSQL 17 vacía, aplica las migraciones desde la 001 y comprueba el esquema con `schema-lint.mjs`.
- Restaura un respaldo de la base aislada, verifica claves foráneas y exige que el control de deriva rechace un checksum modificado.
- Prueba autenticación, aislamiento entre empresas, RLS y facturación con `contractor_api`.

Para cambios grandes de RLS, además del CI:
`database/scripts/rls/generate_rls_consolidation.py` (genera la reescritura y
su reversión) y `database/scripts/rls/verify_rls_equivalence.sql` /
`snapshot_visibility.sql` (comprueban, fila por fila y para cada tipo de
usuario, que nadie gana ni pierde acceso). Así se hizo la migración 048.

## 3. Respaldar antes de aplicar

Verifica que exista una copia recuperable según el [procedimiento de respaldo](backup-restore-verification.md).
Registra la hora UTC, el archivo, su verificación de integridad y el entorno de
restauración. `npm run db:backup:local` es la alternativa para una copia lógica
en una base descartable local. Los objetos de R2 requieren su propia copia.

## 4. Aplicar en producción

**Desde el teléfono o sin computadora: GitHub Actions** →
*Aplicar migraciones a producción* (`.github/workflows/db-migrate.yml`) →
*Run workflow*:

1. Selecciona `main` y ejecuta `mode = status` para listar el historial y los
   archivos pendientes. Este modo omite los archivos SQL de migración. El
   ejecutor puede inicializar las tablas de historial si faltan.
2. Luego con `mode = apply` y `confirm = APLICAR`. El flujo prueba todas las
   migraciones en una base efímera y pasa el lint. Recién después aplica en
   producción con `migrate.mjs`, que registra cada checksum, y al final
   verifica que no queden migraciones pendientes ni deriva de esquema.

El flujo usa las migraciones de `main`. Cuando se fusiona un PR con un archivo
pendiente, el despliegue se detiene en el control de historial antes de publicar
recursos. Aplica el cambio con este workflow, revisa el resultado y reintenta
el despliegue del commit validado. Si `main` avanzó, usa la ejecución del nuevo
commit. Los reviewers configurados en **Settings → Environments → production**
controlan la aprobación del job.

**Alternativa con `database/.env.supabase`:** usa el árbol validado y confirma
el destino, el respaldo y la compatibilidad con la API activa. Para aplicar
antes del merge, coordina la ventana porque un registro adelantado también
puede bloquear el control de deriva contra el `main` previo.

```bash
npm run db:status:supabase   # ver qué está pendiente
npm run db:migrate:supabase  # aplica y registra el checksum
```

**Recuperación excepcional desde SQL Editor o MCP de Supabase.** Registra
primero el cambio operativo y verifica su impacto, el entorno y el archivo
validado. Comprueba el estado antes de reintentar una ejecución interrumpida.

1. Aplica el SQL validado completo y comprueba el resultado y el esquema.
2. Registra el nombre y checksum SHA-256 del archivo después de verificar que
   se aplicó con éxito:

   ```sql
   INSERT INTO app_migrations.schema_migrations (filename, checksum)
   VALUES ('NNN_descripcion.sql', '<sha256 del archivo>');
   ```

   (`sha256sum database/migrations/NNN_descripcion.sql`).

3. Ejecuta los controles de historial y esquema del paso 5.

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
- Revisa el SQL de [`database/rollbacks/`](../database/rollbacks) y sus
  dependencias con las migraciones posteriores. Si se requiere revertir un
  cambio, usa un archivo nuevo con el siguiente prefijo disponible y ejecuta
  las pruebas del flujo afectado.
- Ver también `docs/rollback-procedure.md` para la API y las apps.

## Herramientas

| Archivo | Uso |
|---|---|
| `.github/workflows/db-migrate.yml` | Aplicar migraciones a producción desde GitHub (manual, con confirmación) |
| `database/scripts/migrate.mjs` | Aplica migraciones con checksum y bloqueo (`--status`, `--check`) |
| `database/scripts/schema-lint.sql` / `.mjs` | Reglas de esquema (`npm run db:lint`) |
| `database/scripts/schema-fingerprint.sql` | Huella normalizada del esquema |
| `database/scripts/schema-drift.mjs` | Compara dos huellas (deploy paso 5b, `npm run db:drift:supabase` con `REFERENCE_DATABASE_URL`) |
| `database/scripts/rls/` | Generador, verificador de equivalencia y foto de visibilidad RLS |
| `database/rollbacks/` | Reversiones preparadas (no las lee `migrate.mjs`) |
