# Despliegue de LEURET en Cloudflare

El flujo de GitHub Actions publica la API y los dos clientes web. Las compilaciones de Android e iOS siguen el [procedimiento de Expo/EAS](native-testing-and-updates.md).

| Componente | Recurso | Dominio | Fuente |
| --- | --- | --- | --- |
| API | Worker `leuret-api-worker` | [api.leurettech.com](https://api.leurettech.com/health) | `apps/api` |
| LEURET Admin | Pages `leuret-admin-web` | [admin.leurettech.com](https://admin.leurettech.com/) | `apps/admin-web/dist` |
| Aplicación web | Pages `leuret-pro-web` | [app.leurettech.com](https://app.leurettech.com/) | `apps/mobile/dist` |

Wrangler publica los dos directorios `dist` directamente en Pages. Los bindings del Worker y las variables de compilación se describen en la [configuración de producción](production-environment-setup.md).

## Flujo habitual en GitHub Actions

1. Abre un PR hacia `main`. Revisa el job **Validate Codebase & Build**, que verifica tipos, compilaciones, API, los paquetes Android e iOS, restauración y permisos en PostgreSQL aislado, y el flujo de sesión web en Chrome. [Workflow Validate](../.github/workflows/validate.yml).
2. Antes del merge, identifica dependencias de esquema y prepara el [rollback](rollback-procedure.md). Si el PR lleva migraciones, revisa su compatibilidad con la API activa y aplica el [procedimiento de cambios de base de datos](database-change-process.md).
3. El push a `main` vuelve a ejecutar **Validate**. Si pasa, llama a **Build & Deploy to Cloudflare** con el mismo SHA. El workflow comprueba el historial de migraciones y compara el esquema de Supabase con un PostgreSQL 17 efímero. Valida los bundles y comprueba que el commit sigue en la punta de `main`. [Workflow de despliegue](../.github/workflows/deploy.yml).
4. Cloudflare recibe la API, luego Admin Web y finalmente la aplicación web. Al terminar, el workflow hace peticiones GET a ambas webs, a `/health` y a `/health/database`. Completa la [lista posterior al despliegue](post-deployment-checklist.md) y registra las versiones.

## Cuando el despliegue detecta una migración pendiente

1. Revisa el mensaje del paso **Block deployment when database migrations drift**. Un archivo pendiente bloquea la publicación antes de que cambien los recursos de Cloudflare. Un checksum distinto o un archivo registrado que falta requieren reconciliar el historial.
2. Si el archivo está pendiente y pertenece a `main`, confirma el respaldo. Ejecuta **Aplicar migraciones a producción** con `mode=status` desde Actions. Para aplicar, usa `mode=apply` y la confirmación `APLICAR` según el [procedimiento de base de datos](database-change-process.md).
3. Comprueba que el job terminó sin pendientes ni deriva. Reintenta el despliegue del commit validado si sigue siendo el último de `main`. Si hay un commit posterior, revisa la ejecución de ese commit.
4. Si el control de historial pasa y falla **Block deployment when production schema drifts from migrations**, revisa qué objetos difieren. Coteja el resultado con la migración y la base de referencia antes de reintentar.

## Validación local y publicación manual

Desde la raíz del monorepo, `npm run validate` verifica tipos y compila los tres workspaces. `npm run deploy:safe` instala hooks, verifica tipos y compila la API y el panel. Su alcance es local.

Los scripts `npm run deploy:api`, `npm run deploy:admin`, `npm run deploy:mobile` y `npm run deploy:all` publican en producción. Para una publicación manual autorizada, usa el commit validado, comprueba los controles de historial y esquema e inyecta las [variables de compilación de producción](production-environment-setup.md#compilación-de-los-clientes). Registra los IDs de Cloudflare y ejecuta la [lista posterior al despliegue](post-deployment-checklist.md).

Consulta la [publicación directa de Pages con Wrangler](https://developers.cloudflare.com/workers/wrangler/commands/pages/#pages-deploy) y el [procedimiento de rollback de LEURET](rollback-procedure.md).
