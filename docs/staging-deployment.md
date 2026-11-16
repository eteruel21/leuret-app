# Entorno de staging de LEURET

El repositorio contiene el flujo de producción y pruebas con PostgreSQL efímero. Esta guía describe cómo preparar un entorno persistente aislado. Los dominios bajo `.example` son marcadores para reemplazar con los del entorno que se configure.

## Recursos

- Prepara un PostgreSQL 17 de staging, roles de API y migrador, y un bucket privado separado.
- Aloja la API Node.js con el [punto de entrada de Fastify](../apps/api/src/server.ts). Compila con `npm run build:api` y arranca con `npm run start -w apps/api` desde la raíz.
- Compila Admin Web y la aplicación web después de configurar sus URLs y variables de Turnstile. Publica `apps/admin-web/dist` y `apps/mobile/dist` en proyectos de staging.
- Usa cuentas y datos de prueba, un widget Turnstile de staging y credenciales separadas para almacenamiento, correo y sesiones.

## Variables

| Componente | Configuración de staging |
| --- | --- |
| API Node.js | `NODE_ENV=staging`, `API_HOST` y `API_PORT` acordes al hosting. Para PostgreSQL usa `DATABASE_MODE=postgres`, variables `PGHOST`, `PGPORT`, `PGDATABASE`, `PGUSER` y `PGPASSWORD`. Usa `PGSSL=verify-full` con `PGSSL_CA_FILE` para conexiones remotas |
| Sesiones y correo | `JWT_SECRET`, `RESEND_API_KEY` y `EMAIL_FROM` propios de staging |
| Turnstile | `TURNSTILE_SECRET_KEY` y `TURNSTILE_ALLOWED_HOSTNAMES` con los hostnames web de staging. Distribuye la clave pública correspondiente en los dos builds |
| Archivos | `S3_ENDPOINT`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` y `S3_BUCKET` de staging para la API en Node.js |
| Admin Web | `VITE_API_URL=https://staging-api.example`, `VITE_TURNSTILE_SITE_KEY` y `VITE_TURNSTILE_CHALLENGE_URL=/turnstile` si el cliente se publica en Pages |
| Aplicación web | `EXPO_PUBLIC_API_URL=https://staging-api.example`, `EXPO_PUBLIC_TURNSTILE_SITE_KEY` y `EXPO_PUBLIC_TURNSTILE_CHALLENGE_URL=https://staging-app.example/turnstile` |

Define las tres listas de orígenes para habilitar CORS y las cookies de cada interfaz por HTTPS.

~~~env
CORS_ORIGINS=https://staging-admin.example,https://staging-app.example
ADMIN_WEB_ORIGINS=https://staging-admin.example
APP_WEB_ORIGINS=https://staging-app.example
~~~

Consulta la validación de variables de la [API](../apps/api/src/config/env.ts) y el [proveedor de almacenamiento](../apps/api/src/storage/provider.ts).

## Publicación y comprobación

1. Configura el migrador con el destino de staging. Aplica `npm run db:migrate` y verifica `npm run db:status`. Si el entorno necesita catálogo de prueba, ejecuta `npm run db:seed`. Consulta [migraciones y semillas](migrations-and-seeds.md).
2. Compila y arranca la API con las variables de staging. Compila los clientes con `npm run build:admin` y `npm run build:mobile`. Verifica que sus bundles apunten a la API de staging antes de publicar.
3. Comprueba `GET /health`, `GET /health/database`, Turnstile, sesión en ambas webs, persistencia de datos e integraciones de prueba. Registra el SHA y los resultados en el PR.
4. Para binarios destinados a staging, configura el entorno explícitamente. Los perfiles actuales `preview` y `pilot` en [Expo/EAS](native-testing-and-updates.md) apuntan a la API de producción.
