# Lista de comprobación posterior al despliegue de LEURET

Registra el entorno, el SHA publicado, la hora UTC y los IDs del Worker y de cada proyecto Pages. Usa cuentas de prueba autorizadas para los flujos con sesión.

## Disponibilidad y configuración

| Comprobación | Resultado esperado |
| --- | --- |
| `GET https://api.leurettech.com/health` | HTTP 200, `status: "ok"` y `environment: "production"` |
| `GET https://api.leurettech.com/health/database` | HTTP 200 y `status: "ok"` |
| `GET /legal/terms` y `GET /legal/privacy` en la API | HTTP 200, documento vigente en JSON y campo `version` |
| [Administración](https://admin.leurettech.com/) | Carga el panel y muestra su formulario de acceso |
| [Aplicación web](https://app.leurettech.com/) | Carga la aplicación y apunta a la API del entorno correcto |
| Job de publicación | Validación del mismo SHA, controles de historial y esquema y verificación HTTP final en verde |

~~~bash
curl --fail --show-error --silent https://api.leurettech.com/health
curl --fail --show-error --silent https://api.leurettech.com/health/database
~~~

## Flujos con sesión

- [ ] Iniciar sesión con Turnstile en las dos interfaces. Recargar y cerrar sesión en cada una.
- [ ] Abrir los módulos afectados y comprobar que los datos del usuario y de la empresa sean los esperados.
- [ ] Cuando el cambio afecte archivos, comprobar la lectura de un documento privado de prueba mediante su enlace firmado.
- [ ] Cuando el cambio afecte correo o push, comprobar la entrega a la cuenta o dispositivo de prueba.
- [ ] Revisar logs y métricas del Worker durante la comprobación. Registrar `X-Request-ID` para las peticiones que fallen.

Si falla un componente, conserva el resultado y consulta el [procedimiento de rollback](rollback-procedure.md). Para fallos de historial o esquema, sigue el [proceso de cambios de base de datos](database-change-process.md).
