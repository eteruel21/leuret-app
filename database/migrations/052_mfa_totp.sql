BEGIN;

SET ROLE contractor_owner;
SET LOCAL lock_timeout = '5s';

-- MFA (TOTP) para cuentas con acceso privilegiado. El segundo factor se
-- registra en la sesión: `requireSuperAdmin` exige `mfa_verified_at` cuando
-- ADMIN_MFA_REQUIRED está activo. No cambia el formato del JWT.

ALTER TABLE app_auth.sessions
  ADD COLUMN IF NOT EXISTS mfa_verified_at timestamptz;

COMMENT ON COLUMN app_auth.sessions.mfa_verified_at IS
  'Momento en que la sesión superó el segundo factor. NULL = sin MFA verificado.';

CREATE TABLE IF NOT EXISTS app_auth.user_mfa (
  user_id uuid PRIMARY KEY REFERENCES app_auth.users(id) ON DELETE CASCADE,
  secret_ciphertext text NOT NULL,
  secret_iv text NOT NULL,
  key_version smallint NOT NULL DEFAULT 1,
  confirmed_at timestamptz,
  last_used_step bigint,
  failed_attempts integer NOT NULL DEFAULT 0 CHECK (failed_attempts >= 0),
  locked_until timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE app_auth.user_mfa IS
  'Secreto TOTP cifrado (AES-256-GCM) por usuario. confirmed_at NULL = activación sin terminar.';

CREATE TABLE IF NOT EXISTS app_auth.mfa_recovery_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES app_auth.users(id) ON DELETE CASCADE,
  code_hash text NOT NULL UNIQUE,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS mfa_recovery_codes_user_idx
  ON app_auth.mfa_recovery_codes (user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON app_auth.user_mfa TO contractor_api;
GRANT SELECT, INSERT, UPDATE, DELETE ON app_auth.mfa_recovery_codes TO contractor_api;

-- Auditoría de eventos MFA en la bitácora global (acciones de plataforma:
-- company_id NULL). SECURITY DEFINER porque la bitácora solo tiene políticas
-- de inserción para empresas y para el superadministrador.
CREATE OR REPLACE FUNCTION app_auth.log_mfa_event(
  p_user_id uuid,
  p_action text,
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  INSERT INTO public.admin_audit_logs (company_id, user_id, action, target_type, target_id, metadata)
  SELECT NULL, p_user_id, p_action, 'user', p_user_id, COALESCE(p_metadata, '{}'::jsonb)
  WHERE p_action IN (
    'MFA_ENROLLED', 'MFA_VERIFIED', 'MFA_FAILED', 'MFA_LOCKED',
    'MFA_RECOVERY_CODE_USED', 'MFA_RESET', 'MFA_DISABLED'
  );
$$;

REVOKE ALL ON FUNCTION app_auth.log_mfa_event(uuid, text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_auth.log_mfa_event(uuid, text, jsonb) TO contractor_api;

RESET ROLE;

COMMIT;
