# Instalación local de LEURET

Usa Git, Node.js 22 actualizado con npm y PostgreSQL 17, la versión mayor usada en CI. Para pruebas nativas, consulta la [guía de Expo/EAS](native-testing-and-updates.md).

## Clonar e instalar

~~~bash
git clone https://github.com/eteruel21/leuret-app.git
cd leuret-app
npm ci
~~~

## Preparar PostgreSQL

Copia la plantilla y completa las credenciales locales.

~~~bash
cp database/.env.example database/.env
~~~

| Variable | Valor local |
| --- | --- |
| `DATABASE_ADMIN_URL` | Conexión administrativa a la base `postgres` del servidor local |
| `DATABASE_NAME` | `contractor_pro`, nombre usado en las plantillas |
| `CONTRACTOR_MIGRATOR_PASSWORD` y `CONTRACTOR_API_PASSWORD` | Contraseñas para los roles locales creados por el bootstrap |
| `MIGRATOR_DATABASE_URL` | URI de `contractor_migrator` para la base de desarrollo. Usa la misma contraseña del bootstrap |
| `TEST_DATABASE_URL` | URI de una base local descartable y distinta de la de desarrollo, por ejemplo `contractor_pro_test` |

Desde la raíz, prepara la base, aplica el esquema y carga el catálogo.

~~~bash
npm run db:bootstrap
npm run db:migrate
npm run db:status
npm run db:seed
~~~

Para una base existente con historial incompleto, consulta [migraciones y semillas](migrations-and-seeds.md).

## Configurar la API y los clientes

~~~bash
cp apps/api/.env.local.example apps/api/.env.development
cp apps/admin-web/.env.example apps/admin-web/.env
cp apps/mobile/.env.example apps/mobile/.env
~~~

- **API.** `npm run dev -w apps/api` requiere `apps/api/.env.development`. Completa `PGPASSWORD` con la contraseña local de `contractor_api` y genera un `JWT_SECRET` de al menos 43 caracteres. Conserva la configuración local de Turnstile de la plantilla. `API_HOST=127.0.0.1` y `API_PORT=3001` sirven para desarrollo en el mismo equipo.
- **Admin Web.** Usa `VITE_API_URL=http://127.0.0.1:3001`, la clave pública de prueba de la plantilla y `VITE_TURNSTILE_CHALLENGE_URL=/turnstile.html`.
- **Aplicación web.** Usa `EXPO_PUBLIC_API_URL=http://127.0.0.1:3001` y la clave pública de prueba de la plantilla. El origen del navegador debe coincidir con los permitidos por la API. Usa `127.0.0.1` en cliente y API cuando pruebes cookies locales.
- **Emulador y dispositivo físico.** En el emulador Android usa `http://10.0.2.2:3001`. Desde un teléfono, usa la IP de tu equipo en la red local y configura `API_HOST=0.0.0.0` para esa sesión de desarrollo. El perfil EAS `development` parte de la URL del emulador.

## Ejecutar y verificar

Abre una terminal por servicio en la raíz.

| Servicio | Comando | Dirección |
| --- | --- | --- |
| API | `npm run dev -w apps/api` | `http://127.0.0.1:3001` |
| Admin Web | `npm run dev -w apps/admin-web` | `http://127.0.0.1:3000` |
| Aplicación web | `npm run web -w apps/mobile` | `http://127.0.0.1:8081` |

~~~bash
curl --fail --silent --show-error http://127.0.0.1:3001/health
curl --fail --silent --show-error http://127.0.0.1:3001/health/database
npm run validate
npm run test:unit -w apps/api
npm run test -w apps/mobile
~~~

Para integración y Playwright, sigue las variables y preparación de PostgreSQL del [workflow Validate](../.github/workflows/validate.yml). Las suites de base de datos requieren un destino local descartable.
