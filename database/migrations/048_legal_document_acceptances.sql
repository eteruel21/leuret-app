BEGIN;

SET ROLE contractor_owner;

CREATE TABLE app_auth.legal_acceptances (
  user_id uuid NOT NULL REFERENCES app_auth.users(id) ON DELETE CASCADE,
  document_type text NOT NULL CHECK (document_type IN ('terms', 'privacy')),
  document_version text NOT NULL CHECK (document_version ~ '^[0-9a-f]{64}$'),
  document_updated_at date NOT NULL,
  confirmed_at timestamptz NOT NULL DEFAULT now(),
  source text NOT NULL CHECK (source IN ('registration', 'account')),
  PRIMARY KEY (user_id, document_type, document_version)
);

COMMENT ON TABLE app_auth.legal_acceptances IS
  'Aceptación de términos o constancia de lectura de privacidad por versión. No registra consentimiento para fines opcionales.';

REVOKE ALL ON app_auth.legal_acceptances FROM PUBLIC;
GRANT SELECT, INSERT (user_id, document_type, document_version, document_updated_at, source)
  ON app_auth.legal_acceptances TO contractor_api;

ALTER TABLE app_auth.legal_acceptances ENABLE ROW LEVEL SECURITY;

CREATE POLICY legal_acceptances_read_own
  ON app_auth.legal_acceptances FOR SELECT TO contractor_api
  USING (user_id = (SELECT app.current_user_id()));

CREATE POLICY legal_acceptances_insert_own
  ON app_auth.legal_acceptances FOR INSERT TO contractor_api
  WITH CHECK (
    user_id = (SELECT app.current_user_id())
    AND EXISTS (
      SELECT 1 FROM app_auth.users AS account
      WHERE account.id = legal_acceptances.user_id AND account.deleted_at IS NULL
    )
  );

-- The account-deletion function runs as contractor_owner in the same transaction.
CREATE FUNCTION app_auth.clear_deleted_account_acceptances()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $function$
BEGIN
  DELETE FROM app_auth.legal_acceptances WHERE user_id = NEW.id;
  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION app_auth.clear_deleted_account_acceptances() FROM PUBLIC;

CREATE TRIGGER clear_deleted_account_acceptances
  AFTER UPDATE OF deleted_at ON app_auth.users
  FOR EACH ROW WHEN (OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL)
  EXECUTE FUNCTION app_auth.clear_deleted_account_acceptances();

RESET ROLE;

COMMIT;
