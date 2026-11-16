# Arquitectura de LEURET

LEURET reúne la API, la administración y la aplicación de usuarios en un monorepo npm. GitHub Actions usa Node.js 22 para validar y compilar los tres workspaces.

## Componentes y responsabilidades

| Componente | Responsabilidad | Código y configuración |
| --- | --- | --- |
| API | Fastify y TypeScript. Registra rutas, valida entradas con Zod y ejecuta la lógica de negocio. Usa `pg` para PostgreSQL | [Rutas registradas](../apps/api/src/app.ts), [entrada local Node.js](../apps/api/src/server.ts), [entrada Worker](../apps/api/src/worker.ts) |
| Administración | SPA React 19 y Vite. Gestiona usuarios, empresas, catálogo, soporte y bandejas legales | [Workspace](../apps/admin-web), [cliente HTTP](../apps/admin-web/src/api.ts) |
| Aplicación de usuarios | Expo SDK 57, React Native y Expo Router. Comparte pantallas entre web, Android e iOS. Opera presupuestos, clientes, equipos, obras, agenda y facturación | [Pantallas](../apps/mobile/src/app), [servicios de acceso a la API](../apps/mobile/src/services), [configuración Expo](../apps/mobile/app.json) y [variables de compilación nativa](../apps/mobile/app.config.js) |
| Base de datos | PostgreSQL 17 en Supabase. Persiste cuentas, sesiones y operaciones comerciales | [Migraciones](../database/migrations), [semillas](../database/seeds), [herramientas de base de datos](../database/scripts) |
| Infraestructura | Worker Fastify con `nodejs_compat`, dos proyectos Cloudflare Pages, Hyperdrive, R2 y Analytics Engine | [Configuración Worker](../apps/api/wrangler.worker.jsonc), [despliegue](deployment.md), [monitoreo](monitoring-and-alerts.md) |

## Flujo de solicitudes en producción

~~~mermaid
flowchart TD
    App["Aplicación web y nativa"] --> API["API Fastify en Cloudflare Workers"]
    Admin["Panel en Cloudflare Pages"] --> API
    API --> H["Hyperdrive"]
    H --> DB[("PostgreSQL en Supabase")]
    API --> R2[("Cloudflare R2")]
    API --> Servicios["Turnstile, Resend y Expo Push"]
~~~

- La API emite JWT de acceso y administra sus propias cuentas y sesiones en PostgreSQL. El contrato HTTP, la renovación y las cookies se describen en la [referencia de API](api.md).
- Las rutas protegidas validan la sesión y, según el recurso, exigen aprobación de la cuenta, pertenencia y rol en la empresa o el rol de superadministrador. Para las consultas con identidad, [`withUserTransaction`](../apps/api/src/db/with-user-transaction.ts) configura `app.user_id` dentro de la transacción. Las políticas RLS consultan esa identidad mediante `app.current_user_id()`.
- El Worker usa la conexión de `HYPERDRIVE` con el rol operativo `contractor_api`. La administración del esquema usa credenciales de migrador separadas. Consulta [migraciones y semillas](migrations-and-seeds.md).
- `R2_STORAGE` da acceso a los archivos. La API sirve las fotos privadas y los documentos mediante enlaces firmados. Los avatares y logotipos publicados usan rutas de lectura específicas.
- Turnstile verifica los desafíos de autenticación, Resend envía correos y la API envía solicitudes de notificación a Expo Push. El cron del Worker procesa la cola de limpieza de cuentas eliminadas y los recordatorios de facturación cada cinco minutos.

## Esquemas PostgreSQL

| Esquema | Contenido |
| --- | --- |
| `app` | Funciones de contexto de usuario, entre ellas `app.current_user_id()` |
| `app_auth` | Cuentas, identidades, credenciales, sesiones y constancias legales |
| `public` | Perfiles y datos comerciales, incluyendo empresas, clientes, presupuestos, proyectos, facturas y catálogo |
| `private` | Funciones internas, colas y registros operativos |
| `app_migrations` | Historial de migraciones y semillas, con nombre de archivo, checksum SHA-256 y fecha |

La [guía de respaldo](backup-restore-verification.md) explica cómo verificar juntos el PostgreSQL restaurado y los archivos de R2. El [roadmap](ROADMAP.md) conserva el plan de lanzamiento y sus criterios de evidencia.
