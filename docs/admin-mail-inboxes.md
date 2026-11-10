# LEURET ADMIN — Correos corporativos (Resend Inboxes)

## Alcance

El módulo `Correos` es un **cliente de correo**, no un chat. Permite al superadministrador autenticado abrir los correos de:

- `privacidad@leurettech.com` — bandeja Resend «Privacidad y Protección de Datos».
- `legal@leurettech.com` — bandeja Resend «Asuntos Legales».

Desde el panel se pueden consultar **Recibidos** y **Enviados**, seleccionar conversaciones, abrir el contenido de un mensaje, identificar adjuntos por nombre, marcar conversaciones como leídas y **responder manualmente**. Resend dirige la respuesta al remitente o Reply-To del correo y mantiene el hilo de email. No se publica ningún mensaje en la aplicación de los usuarios. No hay respuesta automática ni agente.

La lectura se ejecuta directamente bajo petición del superadministrador. El módulo **no crea webhooks** ni almacena copias de los correos en PostgreSQL: Resend mantiene los hilos y su política de retención propia. El botón «Actualizar correos» hace la consulta manual; los contadores automáticos, alertas push y descarga de adjuntos no están incluidos en esta primera versión.

## Configuración de la API (antes de probar o desplegar)

Establecer como **secrets de backend** en el entorno de la API (nunca en `VITE_*`, frontend, repositorio o cliente móvil):

```env
RESEND_ADMIN_MAIL_API_KEY=<clave de Resend con Full access>
RESEND_PRIVACY_INBOX_ID=<UUID de la bandeja de privacidad>
RESEND_LEGAL_INBOX_ID=<UUID de la bandeja legal>
```

Resend exige **Full access** en la clave para listar hilos y leer mensajes. Una clave de tipo «Sending access» permite envíos, pero no la lectura de bandejas. Crear una clave independiente para el buzón administrativo sin reemplazar la clave de correo transaccional `RESEND_API_KEY`, y almacenarla mediante un canal seguro. Nunca enviar claves por chat ni consignarlas en archivos de Git.

### Acceso y seguridad

- Todas las rutas comienzan con `/admin/mail/` y requieren `requireSuperAdmin` en el servidor: autenticación, rol `super_admin` y cuenta activa comprobados en PostgreSQL.
- Los identificadores de buzón proceden exclusivamente de variables de entorno, asignados a una lista fija `privacy | legal`.
- Las rutas validan UUID para hilo y mensaje y no aceptan URLs de usuario ni nombres de archivo como destinos HTTP.
- Todas las respuestas incluyen `Cache-Control: private, no-store`.
- Se muestran los mensajes externos **como texto**, nunca como HTML activo, y no se insertan scripts ni imágenes remotas provenientes del email en el DOM.
- Cada respuesta exige un clic explícito, confirmación visible, un cuerpo de texto no vacío y clave de idempotencia para evitar duplicados al reintentar.
- Los errores externos no devuelven claves ni cuerpos completos de Resend.
- El acceso a metadatos de adjuntos no habilita todavía su descarga; requiere verificar el flujo de URL firmada y el vínculo del adjunto al correo autorizado antes de habilitarla.
- La respuesta enviada es una acción real y no puede recuperarse. La interfaz muestra el buzón y destinatario antes del envío.

## Pruebas previas al merge

1. Ejecutar `npm run typecheck --workspace=api` y `npm run typecheck --workspace=admin-web` (o el flujo `Validate`).
2. Ejecutar las pruebas de API, especialmente `apps/api/src/admin/__tests__/mail-routes.test.ts`.
3. Probar que un usuario anónimo y uno que no sea superadmin reciben 401/403 y nunca se ejecuta una llamada a Resend.
4. Ingresar como superadmin; probar ambos buzones, alternar carpetas, abrir mensajes y validar que no se muestra HTML activo.
5. Enviar pruebas desde una cuenta externa (no a terceros) y comprobar recepción, lectura y respuesta.
6. Comprobar políticas de retención, permisos de acceso y políticas de privacidad vigentes antes del lanzamiento.

## Rutas

| Método | Ruta | Acción |
|---|---|---|
| GET | `/admin/mail/:mailbox/threads?folder=inbox\|sent&after=<uuid>` | Lista de hilos |
| GET | `/admin/mail/:mailbox/threads/:threadId/emails` | Lista de mensajes |
| GET | `/admin/mail/:mailbox/threads/:threadId/emails/:emailId` | Contenido de mensaje |
| PATCH | `/admin/mail/:mailbox/threads/:threadId/read` | Marcar leído |
| POST | `/admin/mail/:mailbox/threads/:threadId/emails/:emailId/reply` | Enviar respuesta manual |

La API usa la versión REST de Resend `https://api.resend.com/inboxes` desde el servidor. No utiliza parámetros de Webhook en esta fase.
