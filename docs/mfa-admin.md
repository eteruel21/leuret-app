# Verificación en dos pasos (MFA) del superadministrador

Migración `052_mfa_totp.sql`. Diseño completo en el proyecto de Claude («Diseño: MFA (TOTP) para el superadministrador»).

## Cómo funciona
- TOTP (RFC 6238, 6 dígitos, 30 s) con Google Authenticator, Microsoft Authenticator, 1Password o Authy.
- La sesión guarda `app_auth.sessions.mfa_verified_at`. Con `ADMIN_MFA_REQUIRED=true`, `requireSuperAdmin` solo deja pasar a sesiones verificadas; una sesión sin verificar solo sirve para activar MFA.
- Con MFA activo, `POST /auth/login` no crea sesión: devuelve `{ mfaRequired: true, mfaToken }` (5 min). `POST /auth/mfa/verify` lo canjea por la sesión.
- Secretos TOTP cifrados con AES-256-GCM (`MFA_ENCRYPTION_KEY`). Códigos de recuperación guardados como HMAC-SHA256.
- 5 fallos seguidos bloquean el segundo factor 15 minutos. Cada evento queda en `admin_audit_logs` (`MFA_ENROLLED`, `MFA_VERIFIED`, `MFA_FAILED`, `MFA_LOCKED`, `MFA_RECOVERY_CODE_USED`).

## Endpoints
| Ruta | Quién | Qué hace |
|---|---|---|
| `GET /auth/mfa/status` | Sesión activa | `configured`, `enabled`, `required`, `sessionVerified` |
| `POST /auth/mfa/enroll` | Superadmin | Genera el secreto sin confirmar; devuelve `secret` y `otpauthUri` |
| `POST /auth/mfa/confirm` `{ code }` | Superadmin | Confirma, devuelve 10 `recoveryCodes` (una sola vez) y verifica la sesión |
| `POST /auth/mfa/verify` `{ mfaToken, code \| recoveryCode, clientType? }` | Público (con desafío) | Crea la sesión verificada |

## Puesta en marcha (en este orden, para no quedarse fuera)
1. Generar la clave: `openssl rand -base64 32`. Guardarla en un gestor de contraseñas **y** en Cloudflare: `npx wrangler secret put MFA_ENCRYPTION_KEY --config apps/api/wrangler.worker.jsonc`. Si se pierde, los secretos TOTP quedan ilegibles.
2. Aplicar la migración 052 (flujo «Aplicar migraciones a producción»: `status`, luego `apply`) **antes** del merge.
3. Desplegar. Mientras `ADMIN_MFA_REQUIRED` no sea `true`, nada cambia para el panel.
4. Activar tu MFA (pantalla del panel; hasta entonces, con las rutas `/auth/mfa/*`). Guardar los 10 códigos de recuperación en un gestor de contraseñas.
5. Comprobar que puedes cerrar sesión y volver a entrar con el código.
6. Poner `ADMIN_MFA_REQUIRED` en `"true"` (variable `vars` del Worker) y desplegar.

## Si se pierde el teléfono
1. Usar un código de recuperación en el segundo paso del login.
2. Sin códigos, reiniciar el MFA de la cuenta (SQL Editor de Supabase o `psql` como `contractor_owner`). Cambiar el correo por el de la cuenta:

```sql
BEGIN;
WITH target AS (SELECT id FROM app_auth.users WHERE lower(email) = lower('correo@ejemplo.com'))
DELETE FROM app_auth.mfa_recovery_codes WHERE user_id IN (SELECT id FROM target);
DELETE FROM app_auth.user_mfa WHERE user_id = (SELECT id FROM app_auth.users WHERE lower(email) = lower('correo@ejemplo.com'));
UPDATE app_auth.sessions SET revoked_at = now()
WHERE user_id = (SELECT id FROM app_auth.users WHERE lower(email) = lower('correo@ejemplo.com')) AND revoked_at IS NULL;
SELECT app_auth.log_mfa_event((SELECT id FROM app_auth.users WHERE lower(email) = lower('correo@ejemplo.com')), 'MFA_RESET', '{"via":"runbook"}'::jsonb);
COMMIT;
```

Después, iniciar sesión y volver a activar MFA.

## Reversión
`database/rollbacks/052_mfa_totp.down.sql` (borra los secretos y códigos). Para solo dejar de exigir MFA basta `ADMIN_MFA_REQUIRED=false`.

## Pendiente
- Pantallas del panel (activación con QR, código al iniciar sesión, códigos de recuperación): PR 2.
- Un superadmin que inicia sesión desde el móvil recibe `mfaRequired` pero la app no tiene pantalla: debe usar el panel web.
- Fase 2: MFA opcional para propietarios y administradores de empresa. Fase 3: llaves de seguridad (WebAuthn).
