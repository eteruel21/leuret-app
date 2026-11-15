# Respaldos y recuperación de Leuret App

**Fecha:** 15 de noviembre de 2026.

**Estado:** automatización preparada. Pendientes la configuración de producción y el simulacro con una copia operativa.

**Verificación inicial:** se recuperaron 63 tablas y 51 registros de migración de una base creada con las migraciones del repositorio. La prueba sintética también reprodujo dos objetos con sus metadatos y rechazó una copia alterada y una carga incompleta.

## Cobertura y objetivos

El proyecto **Leuret app** en Supabase Free usa PostgreSQL 17. La copia toma los esquemas `app`, `app_auth`, `app_migrations`, `private` y `public`, que contienen los datos de la aplicación y su propia autenticación. Supabase Auth y Supabase Storage tenían cero usuarios y objetos, respectivamente, en la revisión. Si empiezan a contener datos, la tarea falla y se amplía el procedimiento antes de considerar el respaldo completo. El plan Free requiere una copia lógica independiente para sostener el objetivo diario.

Los archivos privados se respaldan desde `contractor-private-storage` en Cloudflare R2. Cada paquete conserva las claves de los objetos, el tamaño, SHA-256 y los encabezados HTTP y metadatos compatibles. El dump y el inventario de tablas se toman en un mismo snapshot PostgreSQL. El flujo compara el inventario R2 antes y después y falla si detecta cambios concurrentes. La base y R2 son sistemas independientes. En un incidente se comprueba la correspondencia entre referencias y archivos antes de reabrir el servicio.

| Objetivo | Valor operativo |
| --- | --- |
| Ventana de respaldo | Todos los días a las 2:17 a. m. de Panamá (`07:17 UTC`). |
| RPO objetivo | Hasta 24 horas para PostgreSQL y R2. Registrar la pérdida real desde la última copia recuperable hasta el incidente. |
| RTO objetivo | Hasta 4 horas. Medir desde la declaración del incidente hasta que la aplicación pasa las comprobaciones funcionales. |
| Retención prevista | 7 copias diarias, 4 semanales y 12 mensuales en condiciones normales. Las ventanas se cuentan por edad y requieren ejecuciones exitosas en los días correspondientes. |

## Configuración inicial

1. En **Cloudflare → R2**, crear un bucket privado destinado a los respaldos, por ejemplo `leuret-dr-backups`. Mantener apagados los accesos públicos y guardar los paquetes fuera del bucket operativo. Configurar estas reglas de bloqueo y caducidad por prefijo en el bucket de respaldos.

   | Prefijo | Copia | Bloqueo mínimo | Caducidad |
   | --- | --- | ---: | ---: |
   | `leuret/daily/` | Días ordinarios | 7 días | 7 días |
   | `leuret/weekly/` | Domingo | 28 días | 28 días |
   | `leuret/monthly/` | Primer día del mes | 365 días | 365 días |

   La copia semanal o mensual también cubre el día de su ejecución. El primer día del mes tiene prioridad cuando cae en domingo. El bucket debe tener capacidad para estas copias completas. El runner necesita espacio temporal para el paquete y su versión cifrada. La cuenta de recuperación debe poder acceder al destino aunque el servicio de Leuret esté caído.

2. Crear dos credenciales S3 limitadas a sus respectivos buckets. En `contractor-private-storage`, usar **Object Read only**. En el bucket de respaldo, usar **Object Read & Write** para escribir y verificar las copias. Habilitar los bloqueos de retención antes de entregar la credencial del destino al workflow. Para recuperar, usar una credencial independiente de solo lectura del bucket de respaldo.
3. Generar la clave de cifrado desde una estación de recuperación autorizada mediante `age-keygen -o /ruta/segura/leuret-age.key`. Guardar la identidad privada y una segunda copia en custodia. Obtener el destinatario público con `age-keygen -y /ruta/segura/leuret-age.key`. GitHub recibe únicamente el destinatario público.
4. En **GitHub → Settings → Environments**, crear `backups` y limitar su uso a `main`. Configurar las variables y secretos siguientes. La cuenta de PostgreSQL debe poder leer todas las filas de los esquemas de aplicación, incluidas las protegidas por RLS, consultar el inventario y obtener un snapshot. La rutina abre la sesión de inventario como solo lectura y usa TLS `verify-full`. En un runner IPv4, usar la URL del **Session Pooler** en el puerto `5432`, sin opciones en la URL, y el certificado CA del Dashboard de Supabase.

   | Tipo | Nombre | Valor |
   | --- | --- | --- |
   | Secreto | `LEURET_BACKUP_DATABASE_URL` | Conexión PostgreSQL del proyecto Leuret. |
   | Secreto | `LEURET_BACKUP_DATABASE_CA_PEM` | Contenido PEM del certificado CA. |
   | Variable | `LEURET_SOURCE_R2_ENDPOINT` | Endpoint S3 HTTPS del bucket de archivos. |
   | Secretos | `LEURET_SOURCE_R2_KEY_ID`, `LEURET_SOURCE_R2_SECRET` | Credencial de solo lectura del bucket de archivos. |
   | Variable | `LEURET_BACKUP_R2_ENDPOINT` | Endpoint S3 HTTPS del destino. |
   | Variable | `LEURET_BACKUP_R2_BUCKET` | Nombre del bucket de respaldos. |
   | Secretos | `LEURET_BACKUP_R2_KEY_ID`, `LEURET_BACKUP_R2_SECRET` | Credencial del bucket de respaldos. |
   | Variable | `LEURET_BACKUP_AGE_RECIPIENT` | Destinatario público `age1…`. |

5. Después de publicar el workflow en `main`, ejecutar **Actions → Respaldos de Leuret → Run workflow**. El job debe terminar exitosamente y publicar en R2 tanto `*.zip.age` como su `*.zip.age.sha256`. El segundo archivo solo se escribe después de descargar y verificar la copia cifrada completa. Un objeto cifrado sin su `.sha256` se considera incompleto.
6. Restaurar esa primera copia siguiendo el simulacro. Después de verificarla, crear la **variable de repositorio** `LEURET_BACKUP_ENABLED=true` en **Settings → Secrets and variables → Actions → Variables**. Mantener el entorno apto para ejecuciones programadas sin aprobaciones interactivas. Revisar el resultado de la primera ejecución programada y la caducidad de ambos objetos.

## Operación habitual

- Revisar la última copia completa en **Actions** y R2. Una ejecución omitida por el programador puede no generar una alerta de fallo. Si la última copia verificada supera 24 horas, registrar el incidente y lanzar la tarea manualmente. Configurar las notificaciones de fallos para el usuario asociado al horario de GitHub.
- Si falla por cambios de objetos o bloqueos de PostgreSQL, reintentar fuera de migraciones o cargas masivas. Si el error es de autenticación, certificado, permisos, espacio o capacidad, corregir la causa y comprobar una nueva copia completa. Registrar la ruta del par verificado, la hora UTC, el tamaño y el identificador de GitHub Actions.
- Ejecutar el simulacro cada mes y antes de cambios importantes de infraestructura. Si se rota la clave de cifrado, mantener las identidades anteriores en custodia hasta la caducidad de todas las copias correspondientes.
- El procedimiento local anterior sigue disponible con `npm run db:backup:local -- --dry-run` y `npm run db:backup:local`. Requiere `database/.env.supabase`, una base local dedicada y un volumen cifrado. Ese procedimiento recrea la base local de destino. El operador debe cifrar el dump, verificar su SHA-256 y copiarlo fuera del equipo. Los archivos de R2 requieren su propia copia.

## Simulacro con una copia operativa

1. Seleccionar el último par completo anterior al fallo o al momento del simulacro. Descargarlo a un volumen cifrado con el perfil AWS CLI de lectura `leuret-backup-lectura`. Usar el mismo directorio y nombre base para ambos archivos.

   ```bash
   ARCHIVE_KEY='leuret/daily/REEMPLAZAR.zip.age'
   ARCHIVE_FILE="${ARCHIVE_KEY##*/}"
   aws --profile leuret-backup-lectura --endpoint-url "$LEURET_BACKUP_R2_ENDPOINT" s3 cp \
     "s3://$LEURET_BACKUP_R2_BUCKET/$ARCHIVE_KEY" "$ARCHIVE_FILE"
   aws --profile leuret-backup-lectura --endpoint-url "$LEURET_BACKUP_R2_ENDPOINT" s3 cp \
     "s3://$LEURET_BACKUP_R2_BUCKET/$ARCHIVE_KEY.sha256" "$ARCHIVE_FILE.sha256"
   ```

2. En una máquina Linux aislada, como usuario sin privilegios administrativos, disponer de Python 3 con `boto3` y `psycopg2`, `age` y los binarios de servidor y cliente PostgreSQL 17. Ejecutar con la salida en un **directorio nuevo** del volumen cifrado. Este paso puede correr sin red y crea un clúster temporal con socket Unix privado.

   ```bash
   python3 database/scripts/production_backup.py restore "$ARCHIVE_FILE" \
     --identity /ruta/segura/leuret-age.key --output /volumen-cifrado/leuret-restaurado
   ```

   El comando comprueba el SHA-256 exterior, descifra, valida el tamaño y SHA-256 de cada entrada, restaura PostgreSQL y compara tablas, filas, indicadores de RLS e historial de migraciones con el inventario. Deja el dump y los objetos verificados en el directorio indicado para la fase funcional.

3. En un bucket privado y vacío de recuperación, con prefijo `leuret-restore-`, cargar los objetos y verificar la descarga de cada uno. Entregar al script `LEURET_RESTORE_R2_ENDPOINT`, `LEURET_RESTORE_R2_KEY_ID` y `LEURET_RESTORE_R2_SECRET` mediante el entorno de recuperación. Si hay un fallo parcial, revisar el resultado y reintentar en un nuevo bucket vacío.

   ```bash
   python3 database/scripts/production_backup.py restore-files /volumen-cifrado/leuret-restaurado \
     --bucket leuret-restore-simulacro
   ```

4. Para las pruebas funcionales, preparar una base dedicada con el dump verificado, las extensiones necesarias y los roles, propietarios y permisos de aplicación definidos en las migraciones y en `database/scripts/prepare-supabase.mjs`. Configurar una API de recuperación con secretos, Hyperdrive y R2 separados. Desactivar crons de limpieza, notificaciones, correos y otras integraciones durante el ensayo. Verificar inicio de sesión, acceso con permisos de contratista, separación entre dos empresas, presupuestos, facturas y lectura de archivos. La verificación automática en el clúster desechable omite propietarios y ACL del origen mediante `--no-owner` y `--no-privileges`. Validar esos permisos funcionales antes de cualquier reapertura.
5. Registrar fecha del snapshot, ejecución de GitHub, operador, resultado, recuentos, muestras comprobadas, pérdida estimada y tiempos. El tiempo que imprime el script mide la comprobación técnica de la copia. Para el RTO registrar también descarga, infraestructura, recuperación de R2 y pruebas funcionales. Eliminar cuando termine el ensayo la copia descifrada, las bases desechables y las credenciales de recuperación temporales.

## Respuesta ante un fallo

1. Registrar la hora UTC del primer error, alcance e identificadores de los despliegues. Contener escrituras y tareas que puedan agravar la pérdida. Mantener la base y el bucket actuales disponibles para preservar evidencia y reconciliar cambios posteriores a la copia.
2. Determinar si el daño es de aplicación, PostgreSQL o R2. Para código y despliegues, seguir el [procedimiento de rollback](./rollback-procedure.md). Ante una pérdida de archivos, recuperar primero los objetos necesarios en un bucket aislado y comprobar sus referencias en PostgreSQL. Para una pérdida de base de datos, recuperar el último par verificado en un entorno nuevo y cotejar referencias, datos y permisos.
3. Reconciliar operaciones posteriores al snapshot. Verificar solicitudes de eliminación, archivos ya retirados y sesiones que deban revocarse antes de restablecer accesos o reactivar la cola y las notificaciones.
4. Antes de cambiar producción, obtener autorización operativa y acordar una ventana de mantenimiento. Preparar una configuración de reversión con la ruta previa de Hyperdrive, el binding R2 y despliegues anteriores. Tras aprobar las pruebas, reconfigurar las conexiones en la ventana acordada y comprobar `/health`, `/health/database`, autenticación y acceso a objetos. Guardar la evidencia de recuperación y reactivar escrituras e integraciones de forma controlada.

## Referencias

- [Supabase Database Backups](https://supabase.com/docs/guides/platform/backups)
- [PostgreSQL 17 pg_restore](https://www.postgresql.org/docs/17/app-pgrestore.html)
- [Cloudflare R2 API tokens](https://developers.cloudflare.com/r2/api/tokens/)
- [Cloudflare R2 Bucket Locks](https://developers.cloudflare.com/r2/buckets/bucket-locks/)
- [Cloudflare R2 Object Lifecycles](https://developers.cloudflare.com/r2/buckets/object-lifecycles/)
- [GitHub Actions Troubleshooting](https://docs.github.com/en/actions/how-tos/troubleshoot-workflows)
