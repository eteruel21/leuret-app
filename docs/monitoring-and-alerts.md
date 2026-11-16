# Monitoreo y alertas de Leuret App

## Disponibilidad desde GitHub Actions

El workflow **Monitoreo de disponibilidad de Leuret** se programa cada cinco minutos desde `main`. Ejecuta las comprobaciones en paralelo desde un runner ajeno a Cloudflare.

| Componente | URL | Respuesta esperada |
|---|---|---|
| API | https://api.leurettech.com/health | HTTP 200 y estado `ok` de la API de producción |
| PostgreSQL vía Hyperdrive | https://api.leurettech.com/health/database | HTTP 200 y estado `ok`. HTTP 503 si falla la consulta |
| Aplicación web | https://app.leurettech.com/ | HTTP 200, HTML y título de Leuret |
| Administración | https://admin.leurettech.com/ | HTTP 200, HTML y título del panel de administración |

Un resultado inválido o una latencia de al menos 5 s se confirma con otro intento 10 s después. Cada intento tiene un límite de 12 s. Si ambos fallan, GitHub Actions marca la ejecución como fallida y muestra los componentes afectados y los tiempos. Habilita los avisos de ejecuciones fallidas en la cuenta responsable del workflow. La entrega de la programación depende de la cola de GitHub Actions. [Notificaciones de GitHub Actions](https://docs.github.com/en/actions/concepts/workflows-and-actions/notifications-for-workflow-runs)

GitHub puede desactivar la programación tras 60 días de inactividad en un repositorio público. Comprueba regularmente que aparecen ejecuciones en Actions.

## Registros y métricas en Cloudflare

En **Workers & Pages → leuret-api-worker → Observability** filtra los registros por `event`, `route`, `component`, `operation` o `reqId`. La API devuelve el mismo identificador en la cabecera `X-Request-ID`.

| Evento | Campos de diagnóstico |
|---|---|
| `http_request` | Método, plantilla de ruta, estado HTTP y duración en ms |
| `api_error` | Método, plantilla de ruta, estado HTTP y tipo de excepción |
| `integration_failure` | Proveedor, operación, causa y, si aplica, estado del proveedor o cantidad afectada |
| `infrastructure_failure` | Comprobación de PostgreSQL, ejecución del Worker o tarea programada |

Los registros nuevos usan plantillas de ruta y causas controladas. Las respuestas 429 se pueden consultar por ruta de autenticación filtrando `statusCode`. El endpoint de disponibilidad de PostgreSQL ejecuta `SELECT NOW()` para evitar la caché de Hyperdrive y devuelve únicamente el estado. Turnstile registra errores del servicio y de configuración. Expo Push registra fallos de envío y tickets de error del proveedor. Sus tickets indican aceptación por Expo. Los recibos informan del resultado ante el proveedor de Android o iOS.

El binding `LEURET_METRICS` agrega datos operativos a `events.analyticsEngine.leuret_api_metrics`. En este conjunto `blob1` es el evento, `blob2` el componente y `blob3` la operación o ruta. En eventos HTTP `double1` contiene la latencia en ms y `double2` vale 1 para una respuesta 5xx y 0 para cualquier otro estado.

## Alertas críticas en Cloudflare

Después del despliegue, comprueba que el conjunto de datos aparece en **Observability → Alerts → Monitors**. Crea monitores de tipo **Threshold** con las consultas de abajo y el destino de guardia acordado. Sustituye `<ACCOUNT_TAG>` por el ID de la cuenta. Selecciona rango **Manual**, conserva la ventana de cada consulta y deja la repetición de avisos en una hora.

| Incidencia | Umbral inicial | Ventana |
|---|---:|---:|
| Errores de API | ≥ 5 % de respuestas 5xx, con ≥ 3 errores y ≥ 20 solicitudes | 5 min |
| Latencia de API | p95 ≥ 3.000 ms, con ≥ 20 solicitudes | 10 min |
| Resend, Turnstile, Expo Push o R2 | ≥ 3 eventos por proveedor | 10 min |
| Fallo en la ejecución del Worker | ≥ 1 evento | 5 min |
| Trabajos programados fallidos o pendientes de reintento | ≥ 2 eventos | 15 min |

### Tasa de errores 5xx

```sql
SELECT AVG(double2) * 100 AS value
FROM events.analyticsEngine.leuret_api_metrics
WHERE accountTag = '<ACCOUNT_TAG>'
  AND timestamp >= NOW() - INTERVAL '5' MINUTE
  AND blob1 = 'http_request'
  AND blob3 NOT IN ('/health', '/health/database', 'unmatched', '*')
HAVING COUNT(*) >= 20 AND SUM(double2) >= 3
```

### Latencia p95 de la API

```sql
SELECT quantileWeighted(0.95, double1, sampleInterval) AS value
FROM events.analyticsEngine.leuret_api_metrics
WHERE accountTag = '<ACCOUNT_TAG>'
  AND timestamp >= NOW() - INTERVAL '10' MINUTE
  AND blob1 = 'http_request'
  AND blob3 NOT IN ('/health', '/health/database', 'unmatched', '*')
HAVING COUNT(*) >= 20
```

### Fallos de integraciones

Crea un monitor por proveedor. Cambia `resend` por `turnstile`, `expo_push` o `r2` para las otras integraciones.

```sql
SELECT COUNT(*) AS value
FROM events.analyticsEngine.leuret_api_metrics
WHERE accountTag = '<ACCOUNT_TAG>'
  AND timestamp >= NOW() - INTERVAL '10' MINUTE
  AND blob1 = 'integration_failure'
  AND blob2 = 'resend'
```

### Fallos del Worker y tareas programadas

Usa esta consulta para el Worker. Para las tareas programadas, cambia `worker` por `worker_cron` y usa la ventana de 15 minutos.

```sql
SELECT COUNT(*) AS value
FROM events.analyticsEngine.leuret_api_metrics
WHERE accountTag = '<ACCOUNT_TAG>'
  AND timestamp >= NOW() - INTERVAL '5' MINUTE
  AND blob1 = 'infrastructure_failure'
  AND blob2 = 'worker'
```

[Documentación de monitores de Cloudflare](https://developers.cloudflare.com/notifications/monitors/)

## Verificación y respuesta

1. Ejecuta el workflow manualmente y confirma que los cuatro componentes aparecen en verde. Repite con **Simular una caída** y confirma que el responsable recibe la notificación del fallo simulado.
2. Envía una solicitud normal a la API y busca su `X-Request-ID` en Workers Logs. Valida las consultas de alerta con **Query preview**.
3. Para verificar la entrega desde Cloudflare, crea temporalmente un monitor que cuente `http_request` para `/health` con umbral ≥ 1. Ejecuta una comprobación de salud, confirma el aviso y elimina ese monitor temporal.
4. Ante una alerta de disponibilidad, abre el resumen del workflow, confirma desde otra conexión y revisa el despliegue de Pages o el Worker afectado. Si solo falla PostgreSQL, revisa Hyperdrive y el estado del proyecto en Supabase.
5. Ante aumentos de 5xx, latencia o fallos de integración, abre Workers Logs, filtra por servicio y ventana, rastrea un `reqId` y comprueba el último despliegue y el estado del proveedor.
