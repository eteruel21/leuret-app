# Política de Retención y Depuración de Datos — Leuret App

**Fecha de vigencia:** 15 de noviembre de 2026

Esta política establece los criterios de conservación, restricción, anonimización y eliminación de datos tratados por **Leuret App**, operada por **LEURET TECH** en la República de Panamá.

Los datos se conservarán únicamente durante el tiempo necesario para la finalidad informada, la prestación del Servicio, la seguridad, el cumplimiento de obligaciones legales o la formulación, ejercicio o defensa de reclamaciones.

## 1. Criterios de conservación

| Categoría | Conservación | Acción posterior |
|---|---|---|
| Cuenta y perfil | Mientras la cuenta esté activa | Anonimización, desactivación o eliminación |
| Constancias de Términos y lectura de Privacidad | Durante la vigencia de la cuenta | Eliminación junto con la cuenta |
| Credenciales y sesiones | Mientras sean necesarias para autenticación y seguridad | Revocación e invalidación |
| Documentos personales | Mientras sean necesarios para la finalidad informada | Eliminación segura mediante cola con reintentos |
| Datos comerciales y de proyectos | Mientras exista la relación y durante el plazo justificable posterior | Restricción, anonimización o eliminación |
| Facturación y registros fiscales/contables | Mínimo 5 años contados desde el 31 de diciembre del año del último documento (ITBMS: Código Fiscal, art. 1057-V, parágrafo 18; registros contables y documentación de respaldo: Ley 52 de 2016, modificada por la Ley 254 de 2021) | Eliminación o anonimización cuando cese la obligación |
| Auditoría, fraude y seguridad | Durante el periodo necesario para investigar incidentes y proteger el Servicio | Purgado o anonimización |
| Solicitudes ARCO | Durante el tiempo necesario para acreditar recepción, respuesta y cumplimiento | Eliminación o anonimización del expediente |
| Respaldos | Conforme al ciclo técnico documentado | Sustitución y expiración automática |

Los plazos concretos pueden variar según la naturaleza del registro y una obligación legal aplicable. LEURET TECH documentará el fundamento cuando conserve información después de cerrar una cuenta.

## 2. Eliminación de cuenta

Antes de confirmar, la app muestra la vista previa de `GET /account/deletion-preview`: qué se elimina, qué se conserva, por qué y hasta cuándo.

Cuando el usuario confirma **Eliminar mi cuenta** (`DELETE /account`), la función `private.delete_own_account()` (migración 045) hace todo en una sola transacción:

| Acción | Datos |
|---|---|
| **Se elimina** | Constancias legales; peticiones de trabajo publicadas (con dirección exacta, fotos y conversaciones); notificaciones; tokens push; precios personales y región de precios; aportes de precio pendientes; solicitudes de vinculación pendientes; invitaciones pendientes a su correo |
| **Se eliminan los archivos** (cola durable con reintentos) | Documentos personales (`profile-documents/`), foto de perfil y logo del perfil (`profile-media/`), fotos de peticiones y de mensajes; y, si la empresa se cierra, su logo y sus fotos de obra |
| **Se anonimiza** | Perfil (nombre, teléfono, ubicación, cédula, RUC, IP de registro, datos profesionales), correo, contraseña, identidades, tokens y sesiones (sin IP ni dispositivo) |
| **Se termina** | Membresías en empresas que siguen operando y vínculo de portal de cliente (`clients.user_id`) |
| **Se cierra** | Empresas donde el usuario es el único miembro activo (empresa inactiva) |
| **Se bloquea** | Si el usuario es el único propietario de una empresa con otros miembros activos, debe transferir la propiedad antes (respuesta 409) |

Se conserva, restringido y sin uso para otros fines:

| Categoría | Plazo | Fundamento |
|---|---|---|
| Facturas, notas de crédito y pagos recibidos como cliente | 5 años desde el 31-dic del año de la última factura | Obligación fiscal y contable |
| Facturas de las empresas que se cierran, con los presupuestos, obras y clientes que las respaldan | Igual | Obligación fiscal y contable |
| Registros de empresas cerradas sin facturas | Mientras pueda haber una reclamación | Defensa de reclamaciones |
| Ficha de cliente en otras empresas | La define cada empresa | La empresa es responsable de su registro comercial |
| Fotos de obra, presupuestos y tareas hechos como miembro de un equipo que sigue activo | Mientras la empresa los necesite | Recursos de la empresa con finalidad vigente; la autoría queda anónima |
| Bitácora de auditoría y sesiones anonimizadas | Mientras sea necesario para seguridad | Seguridad y prevención de fraude |

Cada eliminación deja una constancia sin datos personales en `private.account_deletion_records` (conteos, categorías conservadas y `retention_until`). El superadministrador revisa una vez al año las constancias con `retention_until` vencido y elimina o anonimiza los registros correspondientes.

## 3. Exportación y portabilidad

El usuario puede descargar una copia JSON de sus datos (`GET /account/export`; en el teléfono, `POST /account/export/link` abre una descarga de 10 minutos en el navegador). El archivo incluye cuenta, perfil, sesiones, constancias legales, empresas, datos comerciales, peticiones de trabajo y conversaciones, solicitudes de vinculación y de factura, aportes de precio y un índice `files` con enlaces firmados de 24 horas a sus documentos y fotos. No incluye contraseñas, tokens, códigos de confirmación ni rutas internas del almacenamiento.

También puede presentar una solicitud formal de acceso o portabilidad a **privacidad@leurettech.com**.

## 4. Solicitudes de derechos

Los expedientes de acceso, rectificación, cancelación, oposición y portabilidad deben registrar como mínimo:

- fecha y canal de recepción;
- identidad verificada por medios proporcionales;
- derecho solicitado;
- responsable interno;
- actuaciones realizadas;
- fecha y contenido de respuesta;
- fundamento de cualquier limitación.

Los expedientes no deben incluir contraseñas, tokens, copias innecesarias de documentos ni datos ajenos a la solicitud.

## 5. Seguridad

El acceso a información retenida queda limitado a personal o procesos autorizados. Las incidencias de eliminación deben registrarse sin exponer claves de almacenamiento, credenciales ni datos personales en logs.

## 6. Revisión

Esta política se revisará cuando cambie la legislación, los proveedores, la arquitectura de almacenamiento, el proceso de eliminación o los plazos aplicables.

Las fuentes de Términos y Privacidad son `docs/terms-of-service.md` y `docs/privacy-policy.md`. Al editar una fuente se actualiza su fecha y se ejecuta `npm run legal:generate`. La huella SHA-256 permite identificar en el historial del repositorio el texto de cada versión publicada.

**Contacto de privacidad:** privacidad@leurettech.com
