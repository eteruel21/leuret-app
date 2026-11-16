# Roadmap de LEURET

**Plan estratégico 1.1.** Aprobado el 5 de noviembre de 2026 y revisado el 16 de noviembre de 2026.

El mercado inicial es Panamá. La Dirección de LEURET TECH es responsable del plan.

---

## 1. Visión general

LEURET es una plataforma tecnológica desarrollada por LEURET TECH, orientada a contratistas, profesionales independientes, empresas de construcción y proveedores de servicios.

Su objetivo es integrar en un solo ecosistema digital herramientas para:

- Administración de empresas y clientes.
- Gestión comercial y presupuestos.
- Planificación y seguimiento de proyectos.
- Facturación y control financiero.
- Cálculos técnicos y estimación de materiales.
- Análisis de costos y rentabilidad.
- Automatización de procesos.
- Inteligencia artificial aplicada a operaciones empresariales.
- Integración con servicios externos.

LEURET será desarrollada como una solución SaaS escalable, modular y multiplataforma.

## 2. Decisiones estratégicas aprobadas

### D01 — Mercado inicial

La comercialización de LEURET comenzará en Panamá.

Se priorizarán las necesidades de empresas y profesionales panameños, considerando:

- Balboa y dólar estadounidense.
- ITBMS y configuraciones tributarias aplicables.
- Catálogos de materiales y servicios locales.
- Unidades de medida utilizadas en Panamá.
- Integraciones comerciales disponibles en el país.
- Requisitos legales y de protección de datos.

La arquitectura deberá facilitar futuras expansiones internacionales.

### D02 — Lanzamiento público

LEURET no será lanzada comercialmente al público hasta completar los requisitos P0 y P1.

El lanzamiento requerirá:

1. Validación de funcionalidades críticas.
2. Seguridad y aislamiento de datos entre empresas.
3. Integración real frontend–API.
4. Cumplimiento de privacidad y derechos de usuarios.
5. Infraestructura de producción estable.
6. Pruebas automatizadas y funcionales satisfactorias.
7. Verificación de respaldos y recuperación.
8. Aprobación final de la dirección de LEURET TECH.

Podrán realizarse pruebas piloto controladas antes del lanzamiento público.

### D03 — Primera ampliación funcional

La primera ampliación prioritaria será el módulo de **Análisis de Precios Unitarios (APU)**.

Su desarrollo comenzará después de cumplir las condiciones de estabilización establecidas en este roadmap.

### D04 — Política de producción

Toda modificación deberá desarrollarse, evaluarse y probarse antes de integrarse a producción.

No se modificarán los entornos productivos sin autorización.

---

## 3. Arquitectura y entornos

| Componente | URL o distribución | Alcance |
| --- | --- | --- |
| Aplicación web de LEURET | [app.leurettech.com](https://app.leurettech.com/) | Registro, empresas, clientes, catálogo, calculadoras, presupuestos, agenda, proyectos y facturación |
| LEURET Admin | [admin.leurettech.com](https://admin.leurettech.com/) | Usuarios, empresas, catálogo, soporte y cumplimiento |
| LEURET API | [api.leurettech.com](https://api.leurettech.com/health) | Autenticación, operaciones, PostgreSQL e integraciones |
| Aplicación nativa | Expo/EAS | Android e iOS con código compartido con la aplicación web |
| Sitio corporativo | [leurettech.com](https://leurettech.com/) | Presencia institucional y comercial de LEURET TECH |

Consulta la [arquitectura](architecture.md), el [contrato HTTP](api.md) y el [flujo de despliegue](deployment.md).

---

## 4. Hitos de desarrollo

| Hito | Objetivo | Estado al revisar el repositorio | Evidencia para cerrar |
| --- | --- | --- | --- |
| M1 | Autenticación, seguridad y API | Implementación registrada | Comprobar acceso, recuperación, revocación y aislamiento entre empresas con los roles previstos |
| M2 | Integración de módulos web | Implementación registrada | Ejecutar flujos completos de presupuestos, obras, agenda, clientes y pagos con datos de prueba persistentes |
| M3 | Administración y cumplimiento legal | Implementación registrada | Verificar aprobación, constancias versionadas, exportación, eliminación y tratamiento de datos retenidos |
| M4 | Infraestructura e integraciones | Workflows y runbooks registrados | Verificar el despliegue del SHA, las alertas, las integraciones y una restauración aislada con copia operativa |
| M5 | Aplicación móvil | Perfiles EAS y comprobación de builds registrados | Registrar instalación, sesión, sincronización y actualización en dispositivos físicos por plataforma |
| M6 | Lanzamiento comercial en Panamá | Condicionado a P0/P1 | Adjuntar evidencia de aceptación y aprobación de LEURET TECH |
| M7 | Ampliación funcional, comenzando por APU | Planificado | Definir y aprobar la especificación cuando se cumplan las condiciones de estabilización |

La revisión toma como base [`bb8241f`](https://github.com/eteruel21/leuret-app/commit/bb8241f440fe8fc2179a625f49a35a7a1365c0c2). El [PR de autorización y sesiones](https://github.com/eteruel21/leuret-app/pull/292), el [PR de aceptación legal](https://github.com/eteruel21/leuret-app/pull/295), la [auditoría de módulos](https://github.com/eteruel21/leuret-app/pull/302) y la [recuperación de sesión](https://github.com/eteruel21/leuret-app/pull/303) registran avances de M1 a M3. Para M4, los PR de [respaldos](https://github.com/eteruel21/leuret-app/pull/297) y [monitoreo](https://github.com/eteruel21/leuret-app/pull/300) registran la implementación. El [PR de preparación de compilaciones nativas](https://github.com/eteruel21/leuret-app/pull/304) registra los avances de M5.

Para actualizar un estado, vincula el PR o issue, el commit, el resultado de la prueba y el entorno evaluado. Si el criterio depende de producción, incluye el despliegue o la ejecución operativa correspondiente.

---

## 5. P0 — Requisitos críticos

### P0-01 — Integración frontend–API
Garantizar que todos los módulos críticos utilicen datos reales y persistentes.

### P0-02 — Términos de Uso y Política de Privacidad
Verificar disponibilidad, aceptación y registro del consentimiento cuando corresponda.

### P0-03 — Exportación de datos
Permitir que los usuarios autorizados exporten su información de forma segura.

### P0-04 — Eliminación de cuentas
Implementar eliminación y anonimización conforme a las políticas de retención y obligaciones legales aplicables.

### P0-05 — Autenticación y autorización
Validar roles, permisos, sesiones y recuperación de acceso.

### P0-06 — Seguridad multiempresa
Garantizar que ninguna empresa pueda acceder a información de otra sin autorización.

### P0-07 — Integraciones esenciales
Verificar los servicios indispensables para operar en producción.

### P0-08 — Estabilidad operativa
Resolver errores que impidan ejecutar procesos críticos.

---

## 6. P1 — Preparación comercial

| Frente | Evidencia de aceptación |
| --- | --- |
| RLS y aislamiento | Pruebas con usuarios de distintas empresas, membresías revocadas y roles limitados |
| CAPTCHA, correo y Expo Push | Flujos de autenticación, entrega de correo y recepción en dispositivo con el entorno correspondiente |
| Documentos privados | Carga y lectura autorizadas. Verificación de enlaces firmados y limpieza conforme a retención |
| Respaldos y restauración | Copia cifrada íntegra de PostgreSQL y R2 y simulacro aislado con evidencia funcional |
| Monitoreo y alertas | Registro de incidentes de prueba y recepción de una alerta por el canal operativo |
| CI/CD y pruebas end-to-end | Validación del commit y ejecución de los flujos críticos en los clientes que se van a publicar |
| Rendimiento, accesibilidad y experiencia | Mediciones de los flujos críticos y prueba de navegación, carga, errores y recuperación de sesión |
| Variables y secretos | Configuración revisada por entorno y verificación de variables públicas en las compilaciones |

Todos los elementos P0/P1 deberán contar con criterios de aceptación y evidencia de cumplimiento antes del lanzamiento público.

---

## 7. Primera ampliación — Análisis de Precios Unitarios (APU)

### Objetivo

Desarrollar un módulo especializado que permita calcular y gestionar costos unitarios de actividades de construcción.

### Funciones previstas

**Materiales**
- Catálogos de materiales.
- Unidades y cantidades.
- Precios unitarios.
- Desperdicios y factores de consumo.
- Precios por proveedor.

**Mano de obra**
- Categorías laborales.
- Tarifas por hora o jornada.
- Rendimientos.
- Cuadrillas de trabajo.
- Costos asociados.

**Equipos y herramientas**
- Costos por hora o jornada.
- Alquileres.
- Consumo operativo.
- Rendimientos de equipos.

**Análisis económico**
- Costos directos.
- Costos indirectos.
- Administración.
- Imprevistos.
- Utilidad.
- Impuestos configurables.
- Precio final por unidad.

**Integraciones internas**
- Presupuestos.
- Catálogos.
- Proyectos.
- Clientes.
- Documentos PDF y Excel.

### Requisitos técnicos

- Arquitectura modular.
- Persistencia mediante API y base de datos.
- Separación de información por empresa.
- Historial de modificaciones de precios.
- Versionado de análisis.
- Precisión decimal adecuada para operaciones monetarias.
- Pruebas automáticas de cálculos.
- Capacidad futura de utilizar catálogos internacionales.

**Estado:** Aprobado estratégicamente. Pendiente de especificación detallada e implementación.

---

## 8. Evolución funcional

### Gestión empresarial
- CRM.
- Suscripciones.
- Control financiero.
- Cuentas por cobrar.
- Facturación recurrente.
- Aprobación digital de cotizaciones.

### Construcción y proyectos
- Inventario de materiales.
- Cronogramas de obra.
- Gestión de trabajadores.
- Control de costos.
- Análisis de rentabilidad.
- Reportes fotográficos.
- Seguimiento físico y financiero.

### Herramientas técnicas
- Nuevas calculadoras.
- Catálogos regionales de precios.
- Estimación de materiales.
- Documentación técnica.
- Generación avanzada de reportes.

### Inteligencia artificial
- Asistente técnico LEURET.
- Presupuestos asistidos.
- Análisis de documentos.
- Recomendaciones de materiales.
- Automatización administrativa.
- Proyecciones de costos.

### Integraciones
- Pasarelas de pago.
- Facturación electrónica.
- WhatsApp Business.
- Calendarios.
- Mapas y geolocalización.
- Proveedores.
- Servicios de almacenamiento.
- Analítica empresarial.

Estas funciones constituyen oportunidades de evolución y no compromisos de lanzamiento.

---

## 9. Expansión internacional

La expansión se realizará después de validar la operación comercial en Panamá.

Se deberán evaluar:

1. Demanda comercial del país objetivo.
2. Normativa y protección de datos.
3. Impuestos y facturación electrónica.
4. Monedas y métodos de pago.
5. Catálogos y precios regionales.
6. Unidades de medida.
7. Idiomas y localización.
8. Infraestructura y costos operativos.

La arquitectura buscará permitir configuraciones regionales sin duplicar innecesariamente el producto.

---

## 10. Control de calidad y publicación

Se establece el siguiente flujo:

**Planificación → Desarrollo → Revisión de código → Pruebas → Validación → Despliegue → Monitoreo.**

Cada cambio deberá disponer, según su impacto, de:

- Referencia a issue o requerimiento.
- Rama de desarrollo.
- Pull Request.
- Validaciones automáticas.
- Pruebas funcionales.
- Revisión de seguridad.
- Evidencia de despliegue.
- Procedimiento de reversión cuando corresponda.

Un Pull Request fusionado no constituye por sí mismo evidencia de funcionamiento en producción.

---

## 11. Auditoría y seguimiento continuo

### Informe diario

Verificar:

- Nuevos commits.
- Pull Requests.
- Issues.
- CI/CD.
- Bloqueos P0/P1.
- Estado de entornos.
- Integraciones.
- Prioridades inmediatas.

### Auditoría semanal

Evaluar:

- Arquitectura.
- Seguridad.
- Integraciones.
- Regresiones.
- Experiencia de usuario.
- Rendimiento.
- Nuevas funcionalidades.
- Evolución del roadmap.
- Oportunidades de monetización.

### Evaluación mensual

Revisar:

- Escalabilidad.
- Costos operativos.
- Deuda técnica.
- Disponibilidad.
- Riesgos comerciales.
- Crecimiento del producto.

---

## 12. Criterios de evidencia

Las auditorías clasificarán los hallazgos como:

- **CONFIRMADO:** evidencia actual verificable.
- **INFERIDO:** análisis técnico todavía sin validación completa.
- **NO VERIFICADO:** ausencia de evidencia o acceso.
- **BLOQUEADO:** impedimento concreto para avanzar.

Los hitos se marcarán como completados solamente cuando sus criterios de aceptación se hayan satisfecho.

---

## 13. Objetivos estratégicos

**Corto plazo**

Completar P0/P1, validar estabilidad y preparar el lanzamiento en Panamá.

**Mediano plazo**

Comercializar LEURET y ampliar sus herramientas con el módulo APU.

**Largo plazo**

Consolidar LEURET como un ecosistema tecnológico SaaS escalable, con funciones empresariales avanzadas, automatización e inteligencia artificial, preparado para operar internacionalmente.

---

## 14. Control de decisiones

| Código | Decisión | Estado |
|---|---|---|
| D01 | Lanzamiento inicial en Panamá | Aprobada |
| D02 | Publicación tras completar P0/P1 | Aprobada |
| D03 | APU como primera ampliación | Aprobada |
| D04 | Cambios productivos sujetos a autorización | Vigente |

**Responsable estratégico:** Dirección de LEURET TECH.

**Repositorio técnico actual:** [eteruel21/leuret-app](https://github.com/eteruel21/leuret-app).

---

**LEURET TECH**  
*Desarrollo de software, soluciones empresariales y tecnología aplicada a la construcción.*
