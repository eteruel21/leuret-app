# Protección de la Rama Main y Flujo de Trabajo CI/CD

Este documento describe el flujo de integración de **Leuret App** y la configuración necesaria para exigir validación en GitHub.

---

## 1. Política de Protección de Rama (`main`)

Para garantizar que el código enviado a producción sea siempre estable y seguro:

1. **Restricción de Push Directo**:
   - No se permite realizar `git push` directo a la rama `main` desde el entorno local.
   - El script `scripts/protect-main.sh` y el hook git `pre-push` previenen automáticamente el envío de commits directamente a `main`.

2. **Requisito de Pull Request**:
   - Todo cambio o nueva funcionalidad debe crearse en una rama secundaria (`feat/*`, `fix/*`, `chore/*`).
   - Se debe abrir un **Pull Request (PR)** hacia la rama `main`.

3. **Verificación de CI (GitHub Actions)**:
   - `Validate` se ejecuta en PR hacia `main`, entradas a la cola de fusión y pushes a `main`.
   - `Validate Codebase & Build` comprueba el YAML de Actions, instala con `npm ci` y verifica tipos, documentos legales y builds. En PR y cola de fusión compara los avisos altos y críticos de las dependencias de producción contra la rama base.
   - Una base efímera PostgreSQL 17 permite probar migraciones, restauración, RLS y el ciclo de facturación. Las pruebas HTTP de integración usan el rol `contractor_api`.
   - Playwright abre la compilación de Pro Web en Chrome y comprueba el inicio de sesión, la recarga y el cierre de sesión contra la API y PostgreSQL locales.
   - El despliegue a Cloudflare depende de que `Validate Codebase & Build` pase en el mismo commit de `main`.

---

## 2. Configuración en GitHub (Branch Protection Rules)

Cuando el check aparezca en un PR reciente, abre **Settings → Branches** y edita la regla de `main`.

1. Activa **Require a pull request before merging**.
2. Activa **Require status checks to pass before merging** y selecciona **Validate Codebase & Build** de **GitHub Actions**.
3. Activa **Require branches to be up to date before merging** y **Do not allow bypassing the above settings**. Guarda la regla.
4. Comprueba en el PR que GitHub muestra el check como obligatorio.

---

## 3. Instalación de Hooks Locales

Para instalar manualmente el protector local pre-push:

```bash
npm run install-hooks
```

---

## 4. Despliegues Seguros

Para preparar un despliegue sin realizar pushes involuntarios a `main`:

```bash
npm run deploy:safe
```
