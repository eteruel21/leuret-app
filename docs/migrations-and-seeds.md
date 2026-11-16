# Migraciones y semillas de LEURET

El ejecutor de LEURET usa los archivos SQL de [`database/migrations/`](../database/migrations) para el esquema y de [`database/seeds/`](../database/seeds) para los datos de catálogo. Las guías de [instalación local](local-installation.md) y [cambios en producción](database-change-process.md) contienen los pasos por entorno.

## Roles e historial

| Rol o esquema | Uso |
| --- | --- |
| `contractor_owner` | Propietario de los objetos. El migrador puede asumirlo durante un cambio de esquema |
| `contractor_migrator` | Conexión de mantenimiento para migraciones, semillas y verificaciones |
| `contractor_api` | Conexión de la API con los permisos concedidos por las migraciones y las políticas RLS |
| `app_migrations.schema_migrations` | Registra el nombre completo, SHA-256 y fecha de cada migración aplicada |
| `app_migrations.seed_history` | Registro equivalente para las semillas |

[El ejecutor](../database/scripts/migrate.mjs) ordena los archivos por nombre completo, comprueba el checksum de los ya registrados y usa un bloqueo asesor de PostgreSQL para serializar las ejecuciones. Cada archivo pendiente se aplica junto con su registro de historial en una transacción. Si falla, se revierte ese archivo y la próxima ejecución puede retomarlo. Las migraciones anteriores confirmadas conservan su registro.

Hay prefijos históricos compartidos. Por ejemplo, `045_account_deletion_completion.sql` y `045_scope_company_data_access.sql` son dos migraciones. Usa el nombre completo al revisar o registrar un cambio.

## Comandos

| Operación | PostgreSQL local | Supabase |
| --- | --- | --- |
| Preparar una base vacía | `npm run db:bootstrap` | Sigue el [procedimiento de cambios](database-change-process.md) y la [configuración de producción](production-environment-setup.md) |
| Aplicar migraciones pendientes | `npm run db:migrate` | Workflow [Aplicar migraciones a producción](../.github/workflows/db-migrate.yml) o `npm run db:migrate:supabase` |
| Consultar estado | `npm run db:status` | `npm run db:status:supabase` |
| Comprobar historial sin crear objetos | `node --env-file=database/.env database/scripts/migrate.mjs --check` | `npm run db:check:supabase` |
| Aplicar semillas pendientes | `npm run db:seed` | `npm run db:seed:supabase` |
| Ejecutar lint de esquema | `npm run db:lint` | Se ejecuta sobre una base efímera en CI |
| Comparar estructura real y esperada | Pasa las conexiones de ambas bases a [`schema-drift.mjs`](../database/scripts/schema-drift.mjs) | `npm run db:drift:supabase` con `REFERENCE_DATABASE_URL` |

`--check` detecta archivos pendientes, checksums distintos y registros sin su archivo SQL. `schema-drift.mjs` compara el catálogo real con el de una base de referencia creada con las migraciones del mismo commit. Detecta, entre otros, cambios en columnas, restricciones, índices, políticas RLS, funciones y permisos. El workflow de despliegue ejecuta ambos controles y bloquea la publicación si hay diferencias.

En local, copia [`database/.env.example`](../database/.env.example) a `database/.env`. Para Supabase, parte de [`database/.env.supabase.example`](../database/.env.supabase.example). Configura `MIGRATOR_DATABASE_URL` y `DATABASE_SSL_CA_FILE`. Usa la conexión directa o el pooler de sesión en el puerto 5432 si tu red requiere IPv4. Consulta [las opciones de conexión de Supabase](https://supabase.com/docs/guides/database/connecting-to-postgres).

`db:baseline` y `db:repair-checksums` son herramientas de mantenimiento excepcional. Revisa el [script de baseline](../database/scripts/baseline.mjs) y sus validaciones antes de usarlas.

## Añadir una migración

1. Usa el siguiente prefijo numérico disponible en `database/migrations/NNN_descripcion.sql`. Documenta qué objetos cambian y qué debe comprobarse.
2. Si necesitas corregir una migración aplicada, añade un archivo nuevo. Conserva el archivo aplicado y su checksum.
3. Revisa compatibilidad con la API activa, permisos del rol operativo y políticas RLS. Consulta las [reglas de esquema](database-change-process.md#reglas-de-esquema).
4. Aplica el cambio en local. Ejecuta `npm run db:status`, `npm run db:lint` y las pruebas del flujo afectado.
5. Incluye en el PR el efecto del cambio, el resultado de las pruebas y el plan de reversión cuando corresponda. Los scripts de [`database/rollbacks/`](../database/rollbacks) se revisan como base para una migración de reversión nueva.

## Semillas de catálogo

Las semillas se procesan después de las migraciones. [`seed.mjs`](../database/scripts/seed.mjs) exige el historial de migraciones al día y aplica cada semilla pendiente con su propio registro y checksum. Para actualizar precios o insumos, agrega una semilla.

- `001_import_contraloria_catalog.sql` carga las partidas de referencia de Panamá.
- `002_calculator_materials_unpriced.sql` agrega insumos base para las calculadoras.
- Las siguientes semillas incorporan precios de mercado, materiales y mano de obra. Consulta la [actualización de noviembre de 2026](pricing/market-update-2026-11.md) y el [catálogo regional](pricing/regional-prices.md).

El [workflow de migraciones](../.github/workflows/db-migrate.yml) aplica esquema. La siembra de datos usa su comando y su verificación por entorno.
