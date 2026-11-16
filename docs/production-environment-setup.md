# Configuración de producción de LEURET

Usa esta guía para preparar y revisar los recursos del [despliegue](deployment.md). Los archivos de configuración versionan nombres de recursos, hosts y variables públicas. Las credenciales se gestionan en el servicio que las consume.

## Cloudflare Workers y Supabase

| Recurso o variable | Configuración |
| --- | --- |
| Worker `leuret-api-worker` | Dominio `api.leurettech.com`, `NODE_ENV=production` y `DATABASE_MODE=hyperdrive` |
| Binding `HYPERDRIVE` | PostgreSQL 17 en Supabase con el rol de la aplicación `contractor_api` |
| Binding `R2_STORAGE` | Bucket operativo privado `contractor-private-storage` |
| Binding `LEURET_METRICS` | Dataset de Analytics Engine `leuret_api_metrics` |
| Cron del Worker | `*/5 * * * *` para la limpieza de almacenamiento y los recordatorios de pago |
| `JWT_SECRET` | Clave de sesiones de al menos 43 caracteres, guardada como secreto del Worker |
| `TURNSTILE_SECRET_KEY` y `TURNSTILE_ALLOWED_HOSTNAMES` | Secreto del widget y lista de hostnames autorizados. La configuración versionada indica `app.leurettech.com,admin.leurettech.com` |
| `RESEND_API_KEY` y `EMAIL_FROM` | Credencial de envío y remitente del dominio verificado |
| `RESEND_ADMIN_MAIL_API_KEY`, `RESEND_PRIVACY_INBOX_ID` y `RESEND_LEGAL_INBOX_ID` | Configuración de las [bandejas de administración](admin-mail-inboxes.md) |
| `CORS_ORIGINS`, `ADMIN_WEB_ORIGINS` y `APP_WEB_ORIGINS` | Configuración de la API para orígenes exactos. Las listas de autenticación web deben estar incluidas también en CORS |

La [configuración del Worker](../apps/api/wrangler.worker.jsonc) determina bindings, secretos requeridos y rutas. [El esquema de entorno](../apps/api/src/config/env.ts) valida las variables y documenta sus valores predeterminados. En el modo Hyperdrive, el Worker recibe la cadena de conexión del binding.

Los jobs de migración y comprobación de esquema usan una conexión separada para `contractor_migrator`, con el certificado de Supabase. Los nombres técnicos de roles y bucket forman parte de la configuración operativa.

## GitHub Actions

| Tipo | Nombre | Uso |
| --- | --- | --- |
| Secreto | `CLOUDFLARE_API_TOKEN` | Publica el Worker y los proyectos Pages |
| Secreto | `CLOUDFLARE_ACCOUNT_ID` | Selecciona la cuenta de Cloudflare |
| Secreto | `PRODUCTION_MIGRATOR_DATABASE_URL` | Conexión de migrador que usan los workflows de despliegue y de migraciones |
| Secreto | `PRODUCTION_DATABASE_SSL_CA` | Certificado PEM que los workflows convierten en `DATABASE_SSL_CA_FILE` |
| Variable | `TURNSTILE_SITE_KEY` | Clave pública real de Turnstile, inyectada en ambas compilaciones web |

Verifica el alcance según los [secretos del workflow de despliegue](../.github/workflows/deploy.yml) y el entorno `production` del [workflow de migraciones](../.github/workflows/db-migrate.yml).

## Compilación de los clientes

| Cliente | URL de API | Clave pública de Turnstile | Página del desafío |
| --- | --- | --- | --- |
| Admin Web | `VITE_API_URL=https://api.leurettech.com` | `VITE_TURNSTILE_SITE_KEY` | `VITE_TURNSTILE_CHALLENGE_URL=/turnstile` |
| Aplicación web | `EXPO_PUBLIC_API_URL=https://api.leurettech.com` | `EXPO_PUBLIC_TURNSTILE_SITE_KEY` | `EXPO_PUBLIC_TURNSTILE_CHALLENGE_URL=https://app.leurettech.com/turnstile` |

Estas variables se incorporan a los bundles. Inyéctalas antes de compilar. Usa el widget correspondiente al entorno y conserva sus secretos del lado de la API.

## Verificación operativa

- Ejecuta la [lista posterior a la publicación](post-deployment-checklist.md).
- Verifica la ejecución y entrega de [monitoreo y alertas](monitoring-and-alerts.md).
- Revisa la última copia verificada y su evidencia de restauración según [respaldos y recuperación](backup-restore-verification.md).
