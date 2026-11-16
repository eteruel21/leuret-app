# LEURET

Plataforma de LEURET TECH para contratistas, empresas de construcción, profesionales y clientes en Panamá. Gestiona clientes y equipos, catálogo y calculadoras, presupuestos, obras, agenda, facturación y cobros. Las cuentas pueden consultar los documentos legales vigentes, exportar sus datos y solicitar su eliminación.

## Componentes

| Workspace | Función | Producción |
| --- | --- | --- |
| [`apps/api`](apps/api) | API REST con Fastify y TypeScript | [api.leurettech.com](https://api.leurettech.com/health) en Cloudflare Workers |
| [`apps/admin-web`](apps/admin-web) | Panel administrativo con React y Vite | [admin.leurettech.com](https://admin.leurettech.com/) en Cloudflare Pages |
| [`apps/mobile`](apps/mobile) | Aplicación web, Android e iOS con Expo SDK 57, React Native y Expo Router | [app.leurettech.com](https://app.leurettech.com/) en Cloudflare Pages. Binarios nativos con EAS |
| [`database`](database) | Migraciones, semillas y herramientas para PostgreSQL 17 | Supabase PostgreSQL mediante Cloudflare Hyperdrive |

## Documentación

| Tema | Guías |
| --- | --- |
| Plan del proyecto | [Roadmap de LEURET](docs/ROADMAP.md) |
| Desarrollo | [Instalación local](docs/local-installation.md), [arquitectura](docs/architecture.md), [referencia de API](docs/api.md) |
| Base de datos | [Migraciones y semillas](docs/migrations-and-seeds.md), [cambios de esquema en producción](docs/database-change-process.md) |
| Publicación | [Despliegue en Cloudflare](docs/deployment.md), [configuración de producción](docs/production-environment-setup.md), [staging](docs/staging-deployment.md), [compilaciones nativas y actualizaciones](docs/native-testing-and-updates.md) |
| Operación | [Lista posterior al despliegue](docs/post-deployment-checklist.md), [monitoreo](docs/monitoring-and-alerts.md), [respaldos y recuperación](docs/backup-restore-verification.md), [rollback](docs/rollback-procedure.md) |
| Privacidad y cumplimiento | [Términos de Uso](docs/terms-of-service.md), [Política de Privacidad](docs/privacy-policy.md), [retención de documentos](docs/document-retention-policy.md) |
| Revisiones históricas | [Auditoría de seguridad](docs/security-audit-report.md), [prueba piloto](docs/pilot-testing-report.md) |

## Validación local

Con Node.js 22 y las variables descritas en la [guía local](docs/local-installation.md), ejecuta desde la raíz del repositorio.

~~~bash
npm ci
npm run validate
npm run test:unit -w apps/api
npm run test -w apps/mobile
~~~

Las pruebas de integración usan una base PostgreSQL descartable. Consulta los pasos y las variables en el workflow [Validate](.github/workflows/validate.yml).

Los cambios se integran por PR. La validación del commit en `main` da paso al [workflow de despliegue](.github/workflows/deploy.yml).

## Derechos

© LEURET TECH. Todos los derechos reservados.
