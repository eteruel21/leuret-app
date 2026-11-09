# Backups y recuperación — Leuret App

**Última revisión:** 9 de noviembre de 2026

**Alcance:** PostgreSQL en Supabase y archivos privados en Cloudflare R2

**Estado:** procedimiento definido; recuperación aislada automatizada en CI; respaldo operativo de producción pendiente

## Situación actual

- La base de producción usa Supabase Free. Este plan no incluye backups diarios administrados ni recuperación punto en el tiempo (PITR).
- El respaldo lógico debe generarse con `pg_dump` y conservarse fuera de Supabase.
- Los archivos privados se guardan en el bucket R2 `contractor-private-storage`. Un dump de PostgreSQL solo conserva sus referencias; no copia los objetos.
- Supabase Storage no contiene objetos actualmente. Esto no elimina la necesidad de respaldar R2.
- El flujo de CI ejecuta un ciclo real `pg_dump` → `pg_restore` sobre PostgreSQL 17 aislado. No usa secretos ni datos de producción.

No se debe afirmar que un respaldo de producción fue probado hasta restaurar un dump real en un entorno aislado y completar las verificaciones de este documento.

## Objetivos provisionales

| Objetivo | Valor | Observación |
|---|---:|---|
| RPO de base de datos | 24 horas | Requiere un dump diario exitoso. |
| RPO de archivos R2 | 24 horas | Requiere una copia diaria independiente. |
| RTO | 4 horas | Se medirá durante el primer simulacro con un respaldo real. |
| Retención | 7 diarios, 4 semanales y 12 mensuales | Los archivos deben estar cifrados y fuera del proyecto de producción. |

## 1. Respaldo de PostgreSQL

### Requisitos

1. PostgreSQL client de la misma versión mayor que producción o una versión posterior compatible.
2. `database/.env.supabase` creado desde `database/.env.supabase.example`.
3. Certificado CA de Supabase disponible localmente.
4. Una base PostgreSQL local y desechable cuyo nombre contenga `backup`, `restore` o `mirror`.
5. Volumen cifrado con espacio suficiente y una segunda ubicación fuera del equipo que ejecuta el dump.

### Crear y verificar una copia local

Primero se inspecciona el destino sin modificarlo:

```bash
npm run db:backup:local -- --dry-run
```

Después se genera el dump, se recrea exclusivamente la base local permitida, se restaura y se verifican los objetos principales:

```bash
npm run db:backup:local
```

El script `database/scripts/backup-supabase-to-local.mjs` impide usar un host remoto como destino y rechaza nombres de base que no indiquen claramente su propósito. Nunca se debe apuntar `LOCAL_BACKUP_DATABASE_URL` a producción.

Al terminar:

1. Calcular y guardar SHA-256 del archivo `.dump`.
2. Cifrar el archivo antes de copiarlo fuera del equipo.
3. Registrar fecha UTC, tamaño, hash, versión de PostgreSQL y resultado de restauración.
4. Copiarlo a una ubicación independiente y aplicar la retención definida.
5. No subir dumps, credenciales ni certificados al repositorio o a artefactos públicos de CI.

## 2. Respaldo de archivos de Cloudflare R2

La base contiene rutas de objetos, no los archivos. El bucket de producción debe copiarse diariamente a un destino de respaldo separado mediante una credencial limitada al bucket.

Opciones compatibles con R2:

- `rclone copy` hacia otro bucket o proveedor. Se prefiere `copy` sobre `sync` para que una eliminación accidental en producción no borre automáticamente la copia.
- AWS CLI con el endpoint S3 de R2.

Controles mínimos:

1. Destino separado del bucket `contractor-private-storage`.
2. Credencial exclusiva, con el mínimo permiso necesario.
3. Retención o bucket lock en el **bucket de respaldo**, no en el bucket operativo sin revisar antes el flujo de actualizaciones y eliminaciones de la app.
4. Inventario con clave, tamaño, ETag y fecha de copia.
5. Verificación mensual descargando una muestra y comparando tamaño/hash.

## 3. Prueba automatizada de recuperación

El workflow `.github/workflows/validate.yml` prepara `test_leuret` en PostgreSQL 17 y ejecuta:

```bash
database/scripts/verify-backup-restore.sh
```

La prueba:

1. Rechaza hosts remotos y nombres que no sean de prueba.
2. Genera un dump personalizado con blobs.
3. Crea una base temporal separada.
4. Restaura con `--no-owner`, `--no-privileges` y `--exit-on-error`.
5. Compara el número de tablas de aplicación y el historial de migraciones.
6. Calcula SHA-256 del dump.
7. Elimina la base temporal y el archivo al finalizar.

Esta prueba valida el mecanismo de recuperación del repositorio. No sustituye el simulacro con una copia real de producción.

## 4. Simulacro con un dump real

Frecuencia recomendada: mensual y antes de cambios de infraestructura relevantes.

1. Seleccionar el respaldo y comprobar su SHA-256.
2. Preparar PostgreSQL aislado, sin rutas de red hacia producción.
3. Restaurar con roles equivalentes y `--no-owner` cuando corresponda.
4. Confirmar tablas de `public`, `app_auth`, `private` y `app_migrations`.
5. Comparar conteos por tabla y checksums de `app_migrations.schema_migrations`.
6. Validar inicio de sesión, aislamiento por empresa, presupuestos, facturas y lectura de archivos restaurados.
7. Medir tiempo total y registrar RPO/RTO reales.
8. Destruir de forma segura el entorno temporal y sus credenciales.

Una restauración sobre producción exige una autorización independiente, ventana de mantenimiento, respaldo previo y plan de reversión.

## 5. Estado de cumplimiento

- [x] Inventario de base de datos y almacenamiento revisado.
- [x] Riesgo del plan Supabase Free documentado.
- [x] Archivos R2 separados del respaldo de base de datos.
- [x] Ciclo real de dump/restauración aislada agregado a CI.
- [ ] Primer dump cifrado de producción conservado fuera de Supabase.
- [ ] Primera restauración de un dump real de producción documentada.
- [ ] Copia automática de R2 configurada y recuperación de muestra comprobada.
- [ ] RPO y RTO reales medidos y aprobados.

## Referencias

- [Supabase: Database Backups](https://supabase.com/docs/guides/platform/backups)
- [Cloudflare R2: Durability](https://developers.cloudflare.com/r2/reference/durability/)
- [Cloudflare R2: Bucket locks](https://developers.cloudflare.com/r2/buckets/bucket-locks/)
- [Cloudflare R2: CLI tools](https://developers.cloudflare.com/r2/get-started/cli/)
