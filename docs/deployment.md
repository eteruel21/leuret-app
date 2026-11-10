# LEURET APP — Guía de despliegue

**Última revisión:** 9 de noviembre de 2026  
**Alcance:** API, panel administrativo y aplicación web en Cloudflare. Las compilaciones nativas de Expo/EAS no forman parte de este flujo.

> **Fuente de verdad:** `.github/workflows/deploy.yml`, `.github/workflows/validate.yml`, `apps/api/wrangler.worker.jsonc` y `package.json`. Este documento no sustituye la configuración real ni autoriza una publicación.

## 1. Arquitectura operativa

El repositorio `eteruel21/leuret-app` contiene tres workspaces (`apps/api`, `apps/admin-web`, `apps/mobile`). GitHub Actions publica mediante Wrangler: los proyectos Cloudflare Pages no necesitan una conexión Git directa.

| Componente | Servicio Cloudflare | Dominio | Origen |
| --- | --- | --- | --- |
| API REST Fastify/TypeScript | Worker `leuret-api-worker` | `https://api.leurettech.com` | `apps/api` |
| Panel de administración React/Vite | Pages `leuret-admin-web` | `https://admin.leurettech.com` | `apps/admin-web` |
| Aplicación de usuarios Expo Web | Pages `leuret-pro-web` | `https://app.leurettech.com` | `apps/mobile` |
| App iOS/Android | Expo/EAS, separado | Distribución nativa | `apps/mobile` |

La API ejecuta Fastify en Cloudflare Workers, usa PostgreSQL en Supabase mediante el binding **`HYPERDRIVE`** y archivos privados en R2 mediante **`R2_STORAGE`**. El bucket actual sigue llamándose `contractor-private-storage`: **no renombrar recursos productivos solo para actualizar la marca**. El Worker tiene un cron `*/5 * * * *` para limpiar archivos de cuentas eliminadas.

~~~mermaid
flowchart TD
    A[PR a main] --> B[GitHub Actions: Validate]
    B --> C[Merge autorizado a main]
    C --> D[GitHub Actions: Deploy to Cloudflare]
    D --> E[Verificación de migraciones, tipos y builds]
    E --> F[Worker: leuret-api-worker]
    F --> G[Pages: leuret-admin-web]
    G --> H[Pages: leuret-pro-web]
    F --> I[(Supabase PostgreSQL vía Hyperdrive)]
    F --> J[(Cloudflare R2)]
~~~

## 2. Cómo se ejecuta CI/CD

- **Pull Request hacia `main`:** `validate.yml` ejecuta pruebas, validación de tipos, builds y pruebas de respaldo/restauración en una base **aislada**, sin restaurar datos de producción.
- **Push a `main`:** `deploy.yml` comprueba configuración de certificado, ausencia de deriva en migraciones, tipos, runtime Worker, compilaciones y configuración cliente. Después publica, en orden, API → Admin Web → Pro Web.
- Si el paso de API o Admin falla, los pasos siguientes pueden omitirse.
- **Un push solo documental también dispara el despliegue**, salvo que se omita de forma controlada. No saltarse validaciones para cambios funcionales.

El paso `npm run db:check:supabase` inspecciona migraciones pendientes, checksums y registros inesperados **sin aplicar migraciones**. Si encuentra deriva, bloquea la publicación. El comando `npm run db:migrate:supabase` sí puede cambiar la base: solo se ejecuta por procedimiento separado, con autorización y respaldo.

## 3. Credenciales y bindings

La configuración de GitHub Actions referencia secretos `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, `PRODUCTION_DATABASE_SSL_CA`, `PRODUCTION_MIGRATOR_DATABASE_URL` y variable `TURNSTILE_SITE_KEY`. Verificar su existencia y permisos **sin exponer valores**.

En el Worker `wrangler.worker.jsonc` se configuran dominio `api.leurettech.com`, bindings `HYPERDRIVE` y `R2_STORAGE`, y secretos declarados `JWT_SECRET`, `TURNSTILE_SECRET_KEY`, `RESEND_API_KEY`, `EMAIL_FROM`.

Los clientes web se compilan con `VITE_API_URL` y `EXPO_PUBLIC_API_URL`, ambos dirigidos a `https://api.leurettech.com`. Nunca añadir contraseñas, dumps, certificados o archivos `.env` al repositorio.

## 4. Validaciones locales y publicación

Desde la raíz del repositorio, sin publicar:

~~~bash
npm ci
npm run typecheck
npm run test:worker-runtime -w apps/api
npm run build:api
npm run build:admin
npm run build:mobile
~~~

`npm run deploy:safe` instala hooks, valida tipos y compila API/Admin; **no hace push a `main`, no despliega y no incluye el build móvil**. No reemplaza las comprobaciones de CI.

**Publicación habitual:**

1. Abrir PR; comprobar `Validate` y revisar impacto de API, interfaces, base y almacenamiento.
2. Antes de la fusión, registrar el commit y preparar un plan de rollback.
3. Fusionar a `main` solo con aprobación. Comprobar el workflow **Deploy to Cloudflare** y sus tres pasos de publicación.
4. Verificar los dominios y las funciones críticas; un workflow exitoso no garantiza que el producto esté funcional.

**Publicaciones manuales:** `npm run deploy:api`, `npm run deploy:admin`, `npm run deploy:mobile` o `npm run deploy:all` **modifican producción**. Requieren validación y autorización separadas.

## 5. Comprobación posterior al despliegue

Usar **GET**, no `curl -I` (HEAD):

~~~bash
curl --fail --show-error --silent https://api.leurettech.com/health
curl --fail --show-error --silent https://api.leurettech.com/health/database
~~~

Después comprobar carga de `https://app.leurettech.com` y `https://admin.leurettech.com`, login con usuario de prueba autorizado, logs/errores HTTP del Worker, conectividad Hyperdrive y acceso a R2. Registrar IDs de despliegue y resultados. Revisar migraciones solo con `npm run db:check:supabase` y el entorno autorizado; no aplicarlas automáticamente.

Ante incidentes, seguir [el procedimiento de rollback](./rollback-procedure.md).

## 6. Referencias

- [Backups y recuperación](./backup-restore-verification.md).
- [Cloudflare: Workers Rollbacks](https://developers.cloudflare.com/workers/versions-and-deployments/rollbacks/).
- [Cloudflare: Pages Rollbacks](https://developers.cloudflare.com/pages/configuration/rollbacks/).
- [GitHub: omitir ejecuciones por mensaje de commit](https://docs.github.com/en/actions/how-tos/manage-workflow-runs/skip-workflow-runs).
