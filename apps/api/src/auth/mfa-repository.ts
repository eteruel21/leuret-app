import type { PoolClient } from "pg";

import { pool } from "../db/pool.js";

const MFA_MAX_FAILED_ATTEMPTS = 5;
const MFA_LOCK_MINUTES = 15;

export type MfaRecord = {
  user_id: string;
  secret_ciphertext: string;
  secret_iv: string;
  confirmed_at: Date | null;
  last_used_step: string | null;
  locked_until: Date | null;
};

export async function getMfaRecord(
  client: PoolClient,
  userId: string,
  forUpdate = false
): Promise<MfaRecord | null> {
  const result = await client.query<MfaRecord>(
    `
      SELECT user_id, secret_ciphertext, secret_iv, confirmed_at, last_used_step, locked_until
      FROM app_auth.user_mfa
      WHERE user_id = $1
      ${forUpdate ? "FOR UPDATE" : ""}
    `,
    [userId]
  );
  return result.rows[0] ?? null;
}

export function isMfaLocked(record: Pick<MfaRecord, "locked_until">): boolean {
  return Boolean(record.locked_until && record.locked_until.getTime() > Date.now());
}

/** Guarda (o reemplaza) un secreto sin confirmar. No toca uno ya confirmado. */
export async function upsertPendingMfa(
  client: PoolClient,
  userId: string,
  ciphertext: string,
  iv: string,
  keyVersion: number
): Promise<boolean> {
  const result = await client.query(
    `
      INSERT INTO app_auth.user_mfa (user_id, secret_ciphertext, secret_iv, key_version)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (user_id) DO UPDATE
        SET secret_ciphertext = EXCLUDED.secret_ciphertext,
            secret_iv = EXCLUDED.secret_iv,
            key_version = EXCLUDED.key_version,
            failed_attempts = 0,
            locked_until = NULL,
            updated_at = now()
        WHERE app_auth.user_mfa.confirmed_at IS NULL
      RETURNING user_id
    `,
    [userId, ciphertext, iv, keyVersion]
  );
  return (result.rowCount ?? 0) > 0;
}

/** Marca el paso usado de forma atómica: un mismo código no sirve dos veces. */
export async function consumeTotpStep(
  client: PoolClient,
  userId: string,
  step: number,
  confirm: boolean
): Promise<boolean> {
  const result = await client.query(
    `
      UPDATE app_auth.user_mfa
      SET last_used_step = $2,
          failed_attempts = 0,
          locked_until = NULL,
          confirmed_at = CASE WHEN $3::boolean THEN now() ELSE confirmed_at END,
          updated_at = now()
      WHERE user_id = $1
        AND (last_used_step IS NULL OR last_used_step < $2)
        AND (($3::boolean AND confirmed_at IS NULL) OR (NOT $3::boolean AND confirmed_at IS NOT NULL))
      RETURNING user_id
    `,
    [userId, step, confirm]
  );
  return (result.rowCount ?? 0) > 0;
}

/** Suma un fallo y bloquea 15 min al llegar a 5. Devuelve si quedó bloqueado. */
export async function registerMfaFailure(client: PoolClient, userId: string): Promise<boolean> {
  const result = await client.query<{ locked: boolean }>(
    `
      UPDATE app_auth.user_mfa
      SET failed_attempts = CASE WHEN failed_attempts + 1 >= $2 THEN 0 ELSE failed_attempts + 1 END,
          locked_until = CASE
            WHEN failed_attempts + 1 >= $2 THEN now() + make_interval(mins => $3::int)
            ELSE locked_until
          END,
          updated_at = now()
      WHERE user_id = $1
      RETURNING (locked_until IS NOT NULL AND locked_until > now()) AS locked
    `,
    [userId, MFA_MAX_FAILED_ATTEMPTS, MFA_LOCK_MINUTES]
  );
  return Boolean(result.rows[0]?.locked);
}

export async function resetMfaFailures(client: PoolClient, userId: string): Promise<void> {
  await client.query(
    `UPDATE app_auth.user_mfa SET failed_attempts = 0, locked_until = NULL, updated_at = now() WHERE user_id = $1`,
    [userId]
  );
}

export async function replaceRecoveryCodes(
  client: PoolClient,
  userId: string,
  codeHashes: string[]
): Promise<void> {
  await client.query(`DELETE FROM app_auth.mfa_recovery_codes WHERE user_id = $1`, [userId]);
  await client.query(
    `
      INSERT INTO app_auth.mfa_recovery_codes (user_id, code_hash)
      SELECT $1, hash FROM unnest($2::text[]) AS hash
    `,
    [userId, codeHashes]
  );
}

/** Usa un código de recuperación (una sola vez). Devuelve cuántos quedan o null. */
export async function consumeRecoveryCode(
  client: PoolClient,
  userId: string,
  codeHash: string
): Promise<number | null> {
  const used = await client.query(
    `
      UPDATE app_auth.mfa_recovery_codes
      SET used_at = now()
      WHERE user_id = $1 AND code_hash = $2 AND used_at IS NULL
      RETURNING id
    `,
    [userId, codeHash]
  );
  if ((used.rowCount ?? 0) === 0) return null;

  const remaining = await client.query<{ remaining: string }>(
    `SELECT count(*)::text AS remaining FROM app_auth.mfa_recovery_codes WHERE user_id = $1 AND used_at IS NULL`,
    [userId]
  );
  return Number(remaining.rows[0]?.remaining ?? 0);
}

export async function markSessionMfaVerified(
  client: PoolClient,
  sessionId: string,
  userId: string
): Promise<void> {
  await client.query(
    `
      UPDATE app_auth.sessions
      SET mfa_verified_at = now()
      WHERE id = $1 AND user_id = $2 AND revoked_at IS NULL
    `,
    [sessionId, userId]
  );
}

export async function isSessionMfaVerified(client: PoolClient, sessionId: string): Promise<boolean> {
  const result = await client.query<{ verified: boolean }>(
    `
      SELECT (mfa_verified_at IS NOT NULL) AS verified
      FROM app_auth.sessions
      WHERE id = $1 AND user_id = app.current_user_id() AND revoked_at IS NULL
    `,
    [sessionId]
  );
  return Boolean(result.rows[0]?.verified);
}

/** Busca el desafío sin consumirlo: un error de tecleo no obliga a repetir la contraseña. */
export async function findMfaChallenge(tokenHash: string): Promise<{ user_id: string } | null> {
  const result = await pool.query<{ user_id: string }>(
    `
      SELECT user_id
      FROM app_auth.tokens
      WHERE token_hash = $1
        AND token_type = 'mfa_challenge'
        AND used_at IS NULL
        AND expires_at > now()
    `,
    [tokenHash]
  );
  return result.rows[0] ?? null;
}

export async function consumeMfaChallenge(client: PoolClient, tokenHash: string): Promise<boolean> {
  const result = await client.query(
    `
      UPDATE app_auth.tokens
      SET used_at = now()
      WHERE token_hash = $1
        AND token_type = 'mfa_challenge'
        AND used_at IS NULL
        AND expires_at > now()
      RETURNING id
    `,
    [tokenHash]
  );
  return (result.rowCount ?? 0) > 0;
}

export async function logMfaEvent(
  client: PoolClient,
  userId: string,
  action: string,
  metadata: Record<string, unknown> = {}
): Promise<void> {
  await client.query(`SELECT app_auth.log_mfa_event($1, $2, $3::jsonb)`, [
    userId,
    action,
    JSON.stringify(metadata)
  ]);
}
