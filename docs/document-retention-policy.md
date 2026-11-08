# Política de Retención y Depuración de Documentos — LEURET

**Fecha de vigencia:** 14 de septiembre de 2026

Esta política define los criterios de conservación, anonimización y depuración segura de los datos tratados por **LEURET**, operado en la República de Panamá por **LEURET TECH**.

La retención se rige por el principio de conservar datos personales únicamente durante el tiempo necesario para la finalidad informada o durante el plazo que exija una obligación legal aplicable.

---

## 1. Criterios de retención

| Categoría | Regla de conservación | Acción al finalizar |
|---|---|---|
| **Perfil y cuenta** | Mientras la cuenta esté activa | Anonimización y deshabilitación al confirmar la eliminación |
| **Credenciales y sesiones** | Mientras sean necesarias para autenticación y seguridad | Revocación / invalidación |
| **Archivos personales y multimedia** | Mientras sean necesarios para prestar el servicio | Eliminación del almacenamiento al eliminar la cuenta, salvo obligación legal |
| **Facturación y registros contables/fiscales** | Durante el plazo comercial, contable o fiscal legalmente aplicable | Conservación restringida, separación o anonimización cuando sea posible |
| **Auditoría y seguridad** | Durante el periodo necesario para seguridad, prevención de fraude, cumplimiento o defensa de reclamaciones | Purgado o anonimización |
| **Respaldos** | Ciclo técnico limitado y documentado | Expiración automática y sustitución por respaldos posteriores |

---

## 2. Eliminación de cuenta

Cuando un usuario confirma **Eliminar mi cuenta** mediante `DELETE /account`:

1. Se revocan las sesiones y credenciales de autenticación, se desactiva el perfil y se eliminan los tokens de notificaciones del dispositivo.
2. Se elimina o anonimiza la información personal del perfil que no deba conservarse por una obligación legal.
3. Los documentos personales internos se registran, dentro de la misma transacción, en una cola durable de eliminación. El sistema intenta eliminarlos inmediatamente y Cloudflare reintenta automáticamente cualquier operación temporalmente fallida.
4. Los registros comerciales, contables, fiscales o de auditoría que deban conservarse permanecen únicamente por el plazo legal aplicable y con acceso restringido.
5. Las fotografías de proyectos se conservan como recursos compartidos de la empresa; no se eliminan únicamente porque se retire la cuenta de quien las cargó.
6. La aplicación informa si la limpieza fue completada o si permanece en la cola de reintentos.

No se presenta la limpieza de archivos como completada mientras existan objetos pendientes en la cola. La anonimización de la cuenta y la revocación de credenciales se informan por separado.

---

## 3. Exportación y portabilidad

Antes de eliminar su cuenta, el usuario puede solicitar una copia de sus datos mediante `GET /account/export`. La interfaz de LEURET ofrece esta función desde el perfil del usuario.

---

## 4. Seguridad y acceso

- El acceso a información retenida por obligación legal se limita al personal o procesos autorizados.
- La información retenida no puede reutilizarse para finalidades incompatibles con la razón de su conservación.
- Las incidencias de depuración deben quedar registradas sin exponer secretos, credenciales ni datos sensibles en logs.

---

## 5. Revisión

Esta política debe revisarse cuando cambie la legislación aplicable, el modelo de almacenamiento, la arquitectura de eliminación o los periodos legales de conservación.

**Contacto de privacidad:** privacidad@leurettech.com
