BEGIN;

SET ROLE contractor_owner;

-- Cola durable para la eliminación física de documentos personales.
-- La tabla vive en private y sólo puede manipularse mediante las funciones
-- SECURITY DEFINER declaradas más abajo.
CREATE TABLE IF NOT EXISTS private.account_deletion_storage_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL
    REFERENCES app_auth.users(id)
    ON DELETE CASCADE,
  object_key text NOT NULL,
  object_kind text NOT NULL
    CHECK (object_kind = 'profile_document'),
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'processing', 'failed', 'completed')),
  attempts integer NOT NULL DEFAULT 0
    CHECK (attempts >= 0),
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  last_error_code text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  CONSTRAINT account_deletion_storage_queue_user_object_unique
    UNIQUE (user_id, object_key),
  CONSTRAINT account_deletion_storage_queue_object_key_not_blank
    CHECK (length(trim(object_key)) > 0),
  CONSTRAINT account_deletion_storage_queue_error_code_length
    CHECK (last_error_code IS NULL OR length(last_error_code) <= 80)
);

CREATE INDEX IF NOT EXISTS
  idx_account_deletion_storage_queue_due
ON private.account_deletion_storage_queue (
  next_attempt_at,
  created_at
)
WHERE completed_at IS NULL;

CREATE INDEX IF NOT EXISTS
  idx_account_deletion_storage_queue_user
ON private.account_deletion_storage_queue (
  user_id,
  status
);

REVOKE ALL
ON private.account_deletion_storage_queue
FROM PUBLIC, contractor_api;

-- Sólo permite encolar las cuatro rutas deterministas que pertenecen al
-- usuario autenticado. Nunca acepta URLs, rutas arbitrarias ni fotos de
-- proyectos compartidas por una empresa.
CREATE OR REPLACE FUNCTION private.enqueue_account_deletion_storage_job(
  requested_user_id uuid,
  requested_object_key text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  queued_job_id uuid;
  allowed_object_keys text[];
BEGIN
  IF requested_user_id IS NULL
     OR requested_user_id <> app.current_user_id() THEN
    RAISE EXCEPTION 'El usuario de la cola no coincide con la sesión.';
  END IF;

  allowed_object_keys := ARRAY[
    'profile-documents/' || requested_user_id::text || '/identification',
    'profile-documents/' || requested_user_id::text || '/operation_notice',
    'profile-documents/' || requested_user_id::text || '/references',
    'profile-documents/' || requested_user_id::text || '/address_proof'
  ];

  IF requested_object_key IS NULL
     OR NOT (requested_object_key = ANY (allowed_object_keys)) THEN
    RAISE EXCEPTION 'La clave de almacenamiento no pertenece al usuario.';
  END IF;

  INSERT INTO private.account_deletion_storage_queue AS queue (
    user_id,
    object_key,
    object_kind
  )
  VALUES (
    requested_user_id,
    requested_object_key,
    'profile_document'
  )
  ON CONFLICT (user_id, object_key)
  DO UPDATE SET
    updated_at = now()
  RETURNING queue.id INTO queued_job_id;

  RETURN queued_job_id;
END;
$function$;

CREATE OR REPLACE FUNCTION private.claim_account_deletion_storage_jobs(
  requested_limit integer DEFAULT 25,
  requested_user_id uuid DEFAULT NULL
)
RETURNS TABLE (
  job_id uuid,
  user_id uuid,
  object_key text,
  attempt_count integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  RETURN QUERY
  WITH due_jobs AS (
    SELECT queue.id
    FROM private.account_deletion_storage_queue AS queue
    WHERE queue.completed_at IS NULL
      AND (
        (
          queue.status IN ('pending', 'failed')
          AND queue.next_attempt_at <= now()
        )
        OR (
          queue.status = 'processing'
          AND queue.updated_at <= now() - interval '10 minutes'
        )
      )
      AND (
        requested_user_id IS NULL
        OR queue.user_id = requested_user_id
      )
    ORDER BY queue.created_at ASC, queue.id ASC
    FOR UPDATE SKIP LOCKED
    LIMIT LEAST(
      GREATEST(COALESCE(requested_limit, 25), 1),
      100
    )
  )
  UPDATE private.account_deletion_storage_queue AS queue
  SET status = 'processing',
      attempts = queue.attempts + 1,
      next_attempt_at = now() + interval '10 minutes',
      updated_at = now()
  FROM due_jobs
  WHERE queue.id = due_jobs.id
  RETURNING
    queue.id,
    queue.user_id,
    queue.object_key,
    queue.attempts;
END;
$function$;

CREATE OR REPLACE FUNCTION private.complete_account_deletion_storage_job(
  requested_job_id uuid
)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $function$
  WITH completed_job AS (
    UPDATE private.account_deletion_storage_queue
    SET status = 'completed',
        last_error_code = NULL,
        completed_at = COALESCE(completed_at, now()),
        updated_at = now()
    WHERE id = requested_job_id
      AND completed_at IS NULL
    RETURNING id
  )
  SELECT EXISTS (SELECT 1 FROM completed_job);
$function$;

CREATE OR REPLACE FUNCTION private.fail_account_deletion_storage_job(
  requested_job_id uuid,
  requested_error_code text DEFAULT 'storage_delete_failed'
)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $function$
  WITH failed_job AS (
    UPDATE private.account_deletion_storage_queue
    SET status = 'failed',
        last_error_code = left(
          COALESCE(
            NULLIF(trim(requested_error_code), ''),
            'storage_delete_failed'
          ),
          80
        ),
        next_attempt_at = now() + make_interval(
          secs => LEAST(
            3600,
            30 * power(
              2::numeric,
              LEAST(GREATEST(attempts - 1, 0), 7)
            )::integer
          )
        ),
        updated_at = now()
    WHERE id = requested_job_id
      AND completed_at IS NULL
    RETURNING id
  )
  SELECT EXISTS (SELECT 1 FROM failed_job);
$function$;

REVOKE ALL
ON FUNCTION private.enqueue_account_deletion_storage_job(uuid, text)
FROM PUBLIC;

REVOKE ALL
ON FUNCTION private.claim_account_deletion_storage_jobs(integer, uuid)
FROM PUBLIC;

REVOKE ALL
ON FUNCTION private.complete_account_deletion_storage_job(uuid)
FROM PUBLIC;

REVOKE ALL
ON FUNCTION private.fail_account_deletion_storage_job(uuid, text)
FROM PUBLIC;

GRANT EXECUTE
ON FUNCTION private.enqueue_account_deletion_storage_job(uuid, text)
TO contractor_api, contractor_migrator;

GRANT EXECUTE
ON FUNCTION private.claim_account_deletion_storage_jobs(integer, uuid)
TO contractor_api, contractor_migrator;

GRANT EXECUTE
ON FUNCTION private.complete_account_deletion_storage_job(uuid)
TO contractor_api, contractor_migrator;

GRANT EXECUTE
ON FUNCTION private.fail_account_deletion_storage_job(uuid, text)
TO contractor_api, contractor_migrator;

RESET ROLE;

COMMIT;
