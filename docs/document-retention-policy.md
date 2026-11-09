# Política de Retención y Depuración de Datos — Leuret App

**Fecha de vigencia:** 9 de noviembre de 2026

Esta política establece los criterios de conservación, restricción, anonimización y eliminación de datos tratados por **Leuret App**, operada por **LEURET TECH** en la República de Panamá.

Los datos se conservarán únicamente durante el tiempo necesario para la finalidad informada, la prestación del Servicio, la seguridad, el cumplimiento de obligaciones legales o la formulación, ejercicio o defensa de reclamaciones.

## 1. Criterios de conservación

| Categoría | Conservación | Acción posterior |
|---|---|---|
| Cuenta y perfil | Mientras la cuenta esté activa | Anonimización, desactivación o eliminación |
| Credenciales y sesiones | Mientras sean necesarias para autenticación y seguridad | Revocación e invalidación |
| Documentos personales | Mientras sean necesarios para la finalidad informada | Eliminación segura mediante cola con reintentos |
| Datos comerciales y de proyectos | Mientras exista la relación y durante el plazo justificable posterior | Restricción, anonimización o eliminación |
| Facturación y registros fiscales/contables | Durante el plazo exigido por la normativa aplicable | Eliminación o anonimización cuando cese la obligación |
| Auditoría, fraude y seguridad | Durante el periodo necesario para investigar incidentes y proteger el Servicio | Purgado o anonimización |
| Solicitudes ARCO | Durante el tiempo necesario para acreditar recepción, respuesta y cumplimiento | Eliminación o anonimización del expediente |
| Respaldos | Conforme al ciclo técnico documentado | Sustitución y expiración automática |

Los plazos concretos pueden variar según la naturaleza del registro y una obligación legal aplicable. LEURET TECH documentará el fundamento cuando conserve información después de cerrar una cuenta.

## 2. Eliminación de cuenta

Cuando un usuario confirma **Eliminar mi cuenta** mediante `DELETE /account`:

1. se revocan sesiones y credenciales;
2. se desactiva el perfil y se anonimiza información personal;
3. se eliminan tokens de notificaciones;
4. los documentos personales se registran en una cola durable de eliminación;
5. el sistema intenta la eliminación inmediata y reintenta fallos temporales;
6. la aplicación distingue entre anonimización completada y limpieza externa pendiente.

Los registros que deban conservarse por obligación legal o defensa de reclamaciones quedan restringidos y no pueden reutilizarse para fines incompatibles.

Las fotografías compartidas en proyectos empresariales se conservan como recursos comunes cuando exista una finalidad vigente. Una solicitud específica será evaluada caso por caso.

## 3. Exportación y portabilidad

Antes de eliminar la cuenta, el usuario puede obtener una copia JSON mediante `GET /account/export`. También puede presentar una solicitud formal de acceso o portabilidad a **privacidad@leurettech.com**.

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

**Contacto de privacidad:** privacidad@leurettech.com
