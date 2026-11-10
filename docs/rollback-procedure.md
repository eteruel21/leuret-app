# LEURET APP — Procedimiento de rollback de producción

**Última revisión:** 9 de noviembre de 2026  
**Sistemas:** Cloudflare Workers (`leuret-api-worker`), Pages (`leuret-admin-web` y `leuret-pro-web`), PostgreSQL en Supabase, Cloudflare R2.

> **Regla central:** volver a una versión anterior de Workers o Pages **no restaura el contenido de PostgreSQL ni los objetos de R2**. Esta guía describe acciones sujetas a autorización operacional; no se ha ejecutado ningún rollback.

## 1. Evaluación y contención

Activar el protocolo ante errores HTTP 5xx persistentes, interrupción de la API, fallo de conexión a PostgreSQL, bloqueo general de autenticación o problemas graves en aplicaciones web después de un cambio.

Antes de revertir:

1. Registrar incidente, fecha/hora UTC, commit de GitHub, versión de Worker, IDs de despliegues Pages, síntomas e impacto.
2. Revisar GitHub Actions, **Workers & Pages > Deployments** y logs de Workers. Identificar si falla API, Admin, usuarios, base de datos o R2.
3. Pausar nuevos despliegues de manera coordinada: el workflow `.github/workflows/deploy.yml` se ejecuta con cada push a `main` y **puede reemplazar un rollback realizado en Cloudflare**.
4. Validar compatibilidad entre la versión previa de código y el esquema PostgreSQL actual. Conservar evidencia sin publicar secretos, tokens, contraseñas ni datos privados.

## 2. API: rollback de Cloudflare Workers

**Worker:** `leuret-api-worker`  
**Dominio:** `https://api.leurettech.com`

1. En Cloudflare, abrir **Workers & Pages > leuret-api-worker > Deployments**.
2. Identificar una versión **ya publicada** y previamente estable, verificando su compatibilidad con Hyperdrive, R2 y el esquema de la base.
3. Abrir el menú `...` de dicha versión, seleccionar **Rollback** y confirmar la operación autorizada.
4. Comprobar `GET /health`, `GET /health/database`, autenticación, logs y funcionamiento de las tareas programadas.
5. Registrar versión activada y preparar la corrección correspondiente en `main`, para evitar que el próximo despliegue reinstale código defectuoso.

**Límite:** Cloudflare no revierte los recursos asociados ni los datos almacenados con el código. Un esquema modificado, un bucket o binding inexistente puede impedir un rollback seguro. Ver [documentación de Workers](https://developers.cloudflare.com/workers/versions-and-deployments/rollbacks/).

## 3. Interfaces web: rollback de Cloudflare Pages

**Proyectos:** `leuret-admin-web` y `leuret-pro-web`.

1. Entrar en **Workers & Pages** y seleccionar el proyecto afectado.
2. Abrir **Deployments > All deployments**.
3. Identificar un despliegue de **producción** exitoso anterior. Los despliegues de vista previa no sirven como destino de rollback.
4. Menú `...` → **Rollback to this deployment** → confirmar.
5. Revisar `https://admin.leurettech.com` o `https://app.leurettech.com`, inicio de sesión y compatibilidad con la API desplegada.

Registrar identificador del despliegue y comprobar el sitio; no asumir un tiempo fijo de propagación. Ver [documentación de Pages](https://developers.cloudflare.com/pages/configuration/rollbacks/).

## 4. PostgreSQL en Supabase: recuperación controlada

Una migración SQL **no se revierte automáticamente** al volver a una versión previa de Worker o Pages. El historial de esquema se mantiene en `app_migrations.schema_migrations`.

**Solo lectura/verificación** con el entorno autorizado:

~~~bash
npm run db:check:supabase
~~~

**Prohibido como respuesta automática:** `pg_restore --clean` en producción, eliminación de tablas, `npm run db:migrate:supabase` o reparación de checksums sin análisis y autorización.

Si se sospecha daño de datos:

1. Contener nuevas escrituras de manera coordinada y conservar los registros.
2. Confirmar disponibilidad e integridad del respaldo según [Backups y recuperación](./backup-restore-verification.md).
3. Restaurar **primero en una base aislada**, verificar migraciones, integridad de tablas, cuentas, facturas, proyectos y aislamiento por empresa.
4. Estimar la pérdida de datos (RPO), tiempo de recuperación (RTO) y sincronización con los objetos de R2.
5. Cualquier restauración productiva requiere **autorización independiente**, respaldo previo actualizado, ventana de mantenimiento y plan de reversión de la propia restauración.

La última revisión del documento de backups indica que el primer respaldo operativo cifrado y el simulacro con un dump real de producción estaban pendientes. **No asumir que existe respaldo productivo recuperable o recuperación punto en el tiempo sin verificación actual.**

## 5. Cloudflare R2 y limpieza de cuentas

- El binding `R2_STORAGE` apunta al bucket operativo privado `contractor-private-storage`; el nombre heredado no implica que se deba renombrar.
- Revertir código no recupera objetos borrados en R2. Restaurarlos exige un respaldo independiente y verificado.
- **Migración 029:** conservar `private.account_deletion_storage_queue`. No eliminar la tabla ni sus funciones mientras haya trabajos de limpieza pendientes.
- Al restablecer el Worker, revisar cron `*/5 * * * *`, errores y reintentos de la cola. No ejecutar manualmente claves de almacenamiento ni registrarlas en logs.

## 6. Verificación posterior y cierre

Usar solicitudes HTTP **GET**:

~~~bash
curl --fail --show-error --silent https://api.leurettech.com/health
curl --fail --show-error --silent https://api.leurettech.com/health/database
~~~

Confirmar disponibilidad del panel y aplicación web, login mediante cuenta de prueba autorizada, compatibilidad API/DB, estado de R2 y logs del Worker. Si aplica, comprobar que no haya deriva de migraciones ni trabajos de limpieza detenidos.

Registrar versiones anteriores y actuales, causa raíz, acciones tomadas, responsables, resultado y plan para evitar una nueva publicación defectuosa. Comunicar el cierre del incidente al equipo responsable.

## 7. Referencias

- [Guía de despliegue](./deployment.md).
- [Backups y recuperación](./backup-restore-verification.md).
- [Cloudflare: Workers Rollbacks](https://developers.cloudflare.com/workers/versions-and-deployments/rollbacks/).
- [Cloudflare: Pages Rollbacks](https://developers.cloudflare.com/pages/configuration/rollbacks/).
