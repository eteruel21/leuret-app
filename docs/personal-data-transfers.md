# Proveedores y transferencias de datos personales de Leuret App

**Revisión técnica del 15 de noviembre de 2026**

El inventario describe los proveedores identificados en la configuración de Leuret App y los datos que intervienen en cada servicio. La ubicación indicada para el alojamiento principal o el envío de correos corresponde a la configuración comprobada del servicio.

| Proveedor y servicio | Datos y finalidad | Ubicación comprobada | Evidencia contractual o técnica pendiente |
|---|---|---|---|
| Supabase PostgreSQL | Cuentas y sesiones, registros comerciales y constancias legales. Alojamiento y consultas de la aplicación. | Región principal us-east-1, Virginia del Norte, Estados Unidos. | Titular de la cuenta, anexo de tratamiento vigente y alcance de las ubicaciones y subcontratistas aplicables al proyecto. [Regiones](https://supabase.com/docs/guides/platform/regions) · [Anexo de tratamiento](https://supabase.com/legal/customer-resources/data-processing-addendum) |
| Cloudflare Pages, Workers, Hyperdrive y R2 | Tráfico web, peticiones a la API, conexión a PostgreSQL y archivos adjuntos, fotos y documentos que se almacenan en R2. | Verificar la jurisdicción del bucket R2 y los controles regionales contratados para el resto de los servicios. | Configuración de jurisdicción y anexo vigente que cubra los servicios utilizados. [Ubicación de R2](https://developers.cloudflare.com/r2/reference/data-location/) · [Anexo de tratamiento](https://www.cloudflare.com/cloudflare-customer-dpa/) |
| Cloudflare Turnstile | Señales del navegador, dirección IP y verificación del token para proteger el acceso y el registro frente a abusos. | Verificar los destinos aplicables al servicio. | Alcance del tratamiento y encaje contractual de Turnstile. [Aviso de Privacidad de Turnstile](https://www.cloudflare.com/turnstile-privacy-policy/) |
| Resend | Destinatarios, contenido de correos de verificación, recuperación e invitaciones, y mensajes o adjuntos de los buzones de privacidad y asuntos legales. | Envío del dominio de LEURET en us-east-1. Resend declara que almacena los datos de correo en Estados Unidos. | Cuenta y términos aplicables, anexo de tratamiento y cobertura de envío, recepción y almacenamiento. [Ubicación de almacenamiento](https://resend.com/security/gdpr) · [Anexo de tratamiento](https://resend.com/legal/dpa) |
| Expo Push Service, Apple APNs y Google FCM | Identificador de entrega del dispositivo, texto del aviso y datos para abrirlo. Entrega de avisos cuando la función está habilitada. | Verificar las ubicaciones de los servicios de entrega correspondientes a cada plataforma. | Condiciones aplicables a la entrega, destinatarios y tratamiento posterior de los avisos. [Servicio de avisos de Expo](https://docs.expo.dev/push-notifications/faq/) |

La configuración técnica se puede contrastar con el [flujo de despliegue](../.github/workflows/deploy.yml), la [configuración del Worker](../apps/api/wrangler.worker.jsonc), el [servicio de correo](../apps/api/src/services/email.ts), los [buzones administrativos](./admin-mail-inboxes.md) y el [servicio de avisos](../apps/api/src/notifications/push-service.ts).

## Documentación para completar la revisión

1. Identificar al titular de la cuenta de cada proveedor y conservar la versión de las condiciones y anexos que le son aplicables. Si el proveedor actúa por mandato, comprobar el alcance del encargo, las obligaciones de seguridad, la subcontratación y la devolución o supresión de datos.
2. Registrar por cada flujo el destinatario, los países, el tratamiento y la condición aplicable. Cuando se invoquen garantías contractuales, documentar el alcance del tratamiento, las obligaciones del proveedor y los mecanismos para ejercer los derechos del titular.
3. Incorporar a la Política de Privacidad la condición aplicable a cada transferencia internacional. La constancia de lectura acredita la confirmación del aviso. Cuando la condición sea el consentimiento, se requiere una manifestación específica para el flujo.

[Ley 81 de 2019, artículo 33](https://antai.gob.pa/wp-content/uploads/2019/09/Ley-81-de-2019-Proteccion-de-Datos-Personales.pdf) · [Decreto Ejecutivo 285 de 2021, artículos 14 y 47–53](https://www.gacetaoficial.gob.pa/storage/gacetas/2021/05/29296_A/85281.pdf) · [Guía de transferencias de la ANTAI](https://www.antai.gob.pa/wp-content/uploads/2024/01/Guia-practica-sobre-transferencias-de-datos-personales-a-terceros-rv.pdf)
