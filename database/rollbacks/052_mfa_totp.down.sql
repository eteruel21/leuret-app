-- REVERSIÓN de 052_mfa_totp.sql
--
-- No es una migración: migrate.mjs no lee esta carpeta. Si hiciera falta
-- revertir la 052, copia este archivo como una migración nueva y aplícala con
-- el proceso normal (docs/database-change-process.md). Nunca edites la 052.
--
-- Borra los secretos TOTP y los códigos de recuperación: quien tenga MFA
-- activo deberá volver a activarlo.

BEGIN;

SET ROLE contractor_owner;

DROP FUNCTION IF EXISTS app_auth.log_mfa_event(uuid, text, jsonb);
DROP TABLE IF EXISTS app_auth.mfa_recovery_codes;
DROP TABLE IF EXISTS app_auth.user_mfa;
ALTER TABLE app_auth.sessions DROP COLUMN IF EXISTS mfa_verified_at;

RESET ROLE;

COMMIT;
