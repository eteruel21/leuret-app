# Referencia de la API de LEURET

| Entorno | URL base |
| --- | --- |
| Producción | `https://api.leurettech.com` |
| Desarrollo local | `http://127.0.0.1:3001` |
| Staging | Usa la URL del entorno aislado descrito en la [guía de staging](staging-deployment.md) |

Usa las rutas desde la raíz de la URL base. Envía `Content-Type: application/json` para los cuerpos JSON. El registro de rutas está en [`apps/api/src/app.ts`](../apps/api/src/app.ts). Los módulos definen sus esquemas Zod y las respuestas de cada operación.

## Estado y autenticación

| Método y ruta | Acceso y respuesta |
| --- | --- |
| `GET /health` | Público. HTTP 200 con `status`, `service` y `environment`. El valor técnico de `service` es `contractor-api` |
| `GET /health/database` | Público. HTTP 200 con `{"status":"ok"}` si PostgreSQL responde. HTTP 503 con `{"status":"error"}` si falla |
| `POST /auth/register` | Público. Recibe perfil, `role` (`contractor` o `client`), `captchaToken` y las confirmaciones legales vigentes |
| `POST /auth/login` | Público. Recibe `email`, `password`, `captchaToken` y `clientType`. Devuelve `accessToken`, `expiresIn` en segundos, `sessionId`, `user` y `requiresApproval` |
| `POST /auth/refresh` | Renueva la sesión y rota el token de actualización. Conserva el mismo `clientType` |
| `POST /auth/logout` | Requiere Bearer. Revoca la sesión activa. Envía el mismo `clientType` para que el servidor limpie la cookie correspondiente |
| `GET /auth/me` y `GET /auth/sessions` | Requieren Bearer. Consultan el perfil de sesión y las sesiones propias |
| `POST /auth/sessions/revoke` y `POST /auth/sessions/revoke-all` | Requieren Bearer. Revocan una sesión propia mediante `sessionId` o todas las sesiones |
| `POST /auth/verify-email` y `POST /auth/resend-verification` | Confirmación de correo mediante token y solicitud de reenvío con CAPTCHA |
| `POST /auth/recover-password` y `POST /auth/reset-password` | Solicitud de recuperación con CAPTCHA y restablecimiento mediante token y `newPassword` |

Los endpoints protegidos aceptan `Authorization: Bearer <accessToken>`. El servidor comprueba que la sesión siga vigente y limita las operaciones de una cuenta pendiente de aprobación. Los clientes web deben usar `credentials: "include"` en inicio, renovación y cierre de sesión. El origen debe estar permitido tanto por CORS como por la lista del cliente correspondiente.

| `clientType` | Cliente | Entrega y renovación del token de actualización |
| --- | --- | --- |
| `app-web` | Aplicación de usuarios en navegador | Cookie `appRefreshToken` `HttpOnly`, con ruta `/auth` |
| `web` | Panel administrativo | Cookie `refreshToken` `HttpOnly` |
| `native` | Android e iOS | `refreshToken` en JSON. El cliente lo almacena en SecureStore y lo envía en el cuerpo de `POST /auth/refresh` |

En producción y staging, la API emite las cookies de actualización con `Secure` y `SameSite=None`. Consulta los contratos en [rutas](../apps/api/src/auth/routes.ts) y [esquemas de autenticación](../apps/api/src/auth/schemas.ts).

## Rutas de negocio

La tabla recoge los puntos de entrada de cada módulo. En cada archivo de rutas están los métodos restantes, los parámetros, los códigos de respuesta y los roles autorizados. `companyId` identifica la empresa y puede ir en la ruta, la consulta o el cuerpo según la operación.

| Módulo | Rutas principales | Contrato |
| --- | --- | --- |
| Perfil | `GET /profile/details`, `PATCH /profile`, `PATCH /profile/avatar`, `POST /profile/documents` | [Perfil](../apps/api/src/profile/routes.ts), [documentos](../apps/api/src/profile/document-routes.ts) |
| Empresas y equipos | `GET /companies`, `POST /companies/:companyId/invitations`, `GET /companies/invitations/received`, `POST /companies/invitations/accept`, `GET /companies/:companyId/members` | [Empresas](../apps/api/src/companies/routes.ts) |
| Clientes, direcciones y contactos | `GET /clients`, `POST /clients`, `GET /clients/:clientId`, `POST /clients/:clientId/addresses`, `GET /clients/:clientId/contacts` | [Clientes](../apps/api/src/clients/routes.ts) |
| Vinculación cliente–contratista | `GET /client-connections`, `POST /client-connections`, `PATCH /client-connections/:id`, `POST /client-connections/end` | [Solicitudes de vinculación](../apps/api/src/client-connections/routes.ts) |
| Portal de clientes | `GET /client/summary`, `GET /client/contractors/:companyId`, `GET /budgets/client`, `GET /client/invoices`, `POST /client/projects/:projectId/invoice-request` | [Portal](../apps/api/src/client-portal/routes.ts), [presupuestos](../apps/api/src/budgets/routes.ts) |
| Solicitudes de trabajo | `POST /job-requests`, `GET /job-requests/mine`, `GET /companies/:companyId/job-requests`, `POST /companies/:companyId/job-requests/:requestId/quote` | [Solicitudes de trabajo](../apps/api/src/job-requests/routes.ts) |
| Catálogo, precios y calculadoras | `GET /catalog/items`, `GET /catalog/regions`, `PUT /catalog/region`, `GET /formulas/runtime`, `GET /calculations`, `POST /calculations` | [Catálogo](../apps/api/src/catalog/routes.ts), [fórmulas y precios](../apps/api/src/operations/routes.ts), [cálculos](../apps/api/src/calculations/routes.ts) |
| Presupuestos | `GET /budgets`, `POST /budgets/from-project`, `POST /budgets/:budgetId/items`, `POST /budgets/:budgetId/approve`, `POST /budgets/:budgetId/send` | [Presupuestos](../apps/api/src/budgets/routes.ts) |
| Obras y avance | `GET /projects`, `PATCH /projects/:projectId/status`, `GET /companies/:companyId/projects/:projectId/tasks`, `GET /companies/:companyId/projects/:projectId/progress-history` | [Proyectos](../apps/api/src/projects/routes.ts), [tareas](../apps/api/src/projects/tasks/routes.ts), [avance](../apps/api/src/projects/progress/routes.ts) |
| Agenda e inicio | `GET /companies/:companyId/activities`, `POST /companies/:companyId/activities`, `GET /companies/:companyId/dashboard/role` | [Agenda](../apps/api/src/activities/routes.ts), [inicio](../apps/api/src/dashboard/routes.ts) |
| Facturas, abonos y notas de crédito (propietario y administrador: todas; ventas: las que generó) | `GET /invoices`, `POST /invoices/from-budget`, `POST /invoices/:invoiceId/issue`, `POST /invoices/:invoiceId/payments`, `POST /invoices/:invoiceId/credit-notes` | [Facturación](../apps/api/src/invoices/routes.ts) |
| Informe de ventas (cotizado, aprobado, ejecutado y cobrado por mes) | `GET /companies/:companyId/sales-performance?year=` | [Ventas](../apps/api/src/sales/routes.ts) |
| Preferencias y notificaciones | `GET /me/settings`, `PUT /me/settings/:key`, `GET /notifications`, `POST /notifications/read`, `POST /push-tokens` | [Preferencias](../apps/api/src/settings/routes.ts), [notificaciones](../apps/api/src/notifications/routes.ts) |
| Archivos | `POST /profile/media`, `POST /companies/:companyId/logo`, `GET /companies/:companyId/projects/:projectId/photos`, `GET /storage/files/:photoId` | [Almacenamiento](../apps/api/src/storage/routes.ts) |
| Administración | `GET /admin/overview`, `GET /admin/companies`, `GET /admin/search`, `GET /admin/price-contributions`, `GET /admin/mail/:mailbox/threads` | [Panel](../apps/api/src/admin/routes.ts), [soporte](../apps/api/src/admin/operations-routes.ts), [aportes](../apps/api/src/admin/price-contributions-routes.ts), [bandejas](../apps/api/src/admin/mail-routes.ts) |

## Documentos legales y privacidad

| Método y ruta | Contrato |
| --- | --- |
| `GET /legal/terms` y `GET /legal/privacy` | Público. Devuelven el documento vigente en JSON, incluida su versión |
| `GET /legal/terms/version/:version` y `GET /legal/privacy/version/:version` | Público. Devuelven HTML para la versión vigente |
| `GET /account/legal-acceptances` y `POST /account/legal-acceptances` | Requieren Bearer. Consultan y registran constancias versionadas. Si las versiones cambiaron, la confirmación devuelve HTTP 409 y `LEGAL_DOCUMENTS_CHANGED` |
| `GET /account/export` | Requiere Bearer. Descarga los datos propios como archivo JSON |
| `POST /account/export/link` y `GET /account/export/download` | La primera ruta exige Bearer y genera un enlace firmado de diez minutos. La segunda valida el token del enlace antes de entregar el JSON |
| `GET /account/deletion-preview` y `DELETE /account` | Requieren Bearer. Presentan el alcance y ejecutan la eliminación de la cuenta propia. Si se requiere transferir la propiedad de una empresa, la eliminación devuelve HTTP 409 |

Para el registro, `legalConfirmations.terms` incluye `accepted: true` y la versión de Términos. `legalConfirmations.privacy` incluye `acknowledged: true` y la versión de Privacidad. Consulta el [módulo de cuenta](../apps/api/src/account/routes.ts) y sus [esquemas de constancias](../apps/api/src/account/legal-acceptances.ts).

## Diagnóstico

Las respuestas incluyen `X-Request-ID` para correlacionar la petición con los logs. Los errores suelen incluir `message` y algunas rutas devuelven un `code` específico. HTTP 400 indica una entrada rechazada, 401 una sesión inválida o ausente, 403 falta de autorización o un desafío rechazado, 404 un recurso no encontrado y 429 un límite de solicitudes. Registra el identificador y el código HTTP al reportar un fallo.

Ejemplos de lectura. Ajusta la URL al entorno y proporciona un token y un UUID de empresa autorizados para la segunda consulta.

~~~bash
curl --fail-with-body --silent --show-error https://api.leurettech.com/health/database

curl --fail-with-body --silent --show-error --get \
  --header "Authorization: Bearer $LEURET_ACCESS_TOKEN" \
  --data-urlencode "companyId=$LEURET_COMPANY_ID" \
  https://api.leurettech.com/budgets
~~~

La consulta de presupuestos de empresa devuelve `{ budgets: [...] }` y requiere uno de los roles `owner`, `admin` o `estimator` en esa empresa.
