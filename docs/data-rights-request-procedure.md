# Procedimiento Interno para Solicitudes de Derechos sobre Datos — Leuret App

**Vigencia:** 9 de noviembre de 2026  
**Responsable operativo:** LEURET TECH  
**Canal:** privacidad@leurettech.com

## 1. Alcance

Este procedimiento cubre solicitudes de acceso, rectificación, cancelación, oposición y portabilidad relacionadas con Leuret App.

## 2. Recepción y registro

Toda solicitud debe recibir un identificador interno y registrar fecha, canal, correo asociado, derecho invocado y descripción. Se confirmará la recepción sin revelar información de la cuenta.

## 3. Verificación

La identidad se verificará mediante la sesión autenticada, el correo asociado u otro método proporcional. No se solicitarán contraseñas, códigos de acceso ni documentos completos salvo necesidad excepcional y mediante canal seguro.

Cuando actúe un representante, se verificará su autorización.

## 4. Clasificación y plazos

- Acceso: hasta 10 días hábiles.
- Rectificación: hasta 5 días hábiles.
- Cancelación: hasta 10 días hábiles.
- Portabilidad: hasta 10 días hábiles.
- Oposición: efecto inmediato, salvo excepción legal documentada.

El cómputo comienza cuando la solicitud y la verificación necesaria son suficientes para tramitarla.

## 5. Ejecución

### Acceso o portabilidad
Se puede utilizar la exportación autenticada `GET /account/export` y complementar la respuesta cuando la solicitud abarque información no incluida automáticamente.

### Rectificación
Se corregirán datos inexactos y, cuando corresponda, se informará a los destinatarios relevantes. Los cambios deben quedar auditados sin registrar valores sensibles innecesarios.

### Cancelación
Se determinará qué información puede eliminarse, anonimizarse o debe conservarse de forma restringida. La eliminación de cuenta utiliza `DELETE /account` y la cola durable de documentos personales.

### Oposición
Se detendrá el tratamiento cuestionado cuando proceda. Si existe un motivo legítimo imperioso o necesidad de defensa de reclamaciones, deberá documentarse y explicarse.

## 6. Respuesta

La respuesta será clara, gratuita y enviada por un canal razonablemente seguro. Debe indicar las acciones realizadas, datos entregados, limitaciones aplicadas y vías de contacto o reclamación.

Se responderá incluso cuando LEURET TECH no mantenga datos de la persona solicitante.

## 7. Limitaciones

Una solicitud puede limitarse cuando una norma exija conservar información, afecte derechos de terceros, comprometa secretos o seguridad, sea manifiestamente improcedente o exista otra excepción legal. Toda limitación debe ser específica, proporcional y documentada.

## 8. Cierre y evidencia

El expediente se cerrará con fecha, responsable, acciones completadas y evidencia mínima de entrega. La evidencia se conservará únicamente durante el tiempo necesario para demostrar cumplimiento o atender reclamaciones.

## 9. Incidentes y escalamiento

Cualquier indicio de acceso indebido, pérdida de datos, identidad dudosa o conflicto entre titulares se escalará antes de entregar o modificar información.

## 10. Autoridad competente

La persona titular puede presentar consultas o denuncias ante la Autoridad Nacional de Transparencia y Acceso a la Información (ANTAI), Dirección de Protección de Datos Personales.
