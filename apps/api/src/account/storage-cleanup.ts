import type { QueryResultRow } from "pg";

import { pool } from "../db/pool.js";
import { deleteStorageFile } from "../storage/provider.js";

type ClaimedStorageJob = QueryResultRow & {
  job_id: string;
  user_id: string;
  object_key: string;
  attempt_count: number;
};

export type AccountDeletionStorageCleanupResult = {
  claimed: number;
  completed: number;
  failed: number;
};

type ProcessStorageQueueOptions = {
  limit?: number;
  userId?: string;
};

function normalizedLimit(value: number | undefined): number {
  if (!Number.isFinite(value)) {
    return 25;
  }

  return Math.min(
    Math.max(Math.trunc(value ?? 25), 1),
    100
  );
}

async function markJobCompleted(jobId: string): Promise<void> {
  await pool.query(
    `SELECT private.complete_account_deletion_storage_job($1::uuid)`,
    [jobId]
  );
}

async function markJobFailed(jobId: string): Promise<void> {
  await pool.query(
    `SELECT private.fail_account_deletion_storage_job(
       $1::uuid,
       'storage_delete_failed'
     )`,
    [jobId]
  );
}

/**
 * Procesa una tanda durable de objetos personales pendientes de eliminación.
 * Las claves se reclaman atómicamente en PostgreSQL y la eliminación física
 * es idempotente, por lo que un Worker puede reintentar una tarea cuyo lease
 * haya expirado sin reintroducir datos ni exponer rutas en la respuesta.
 */
export async function processAccountDeletionStorageQueue(
  options: ProcessStorageQueueOptions = {}
): Promise<AccountDeletionStorageCleanupResult> {
  const limit = normalizedLimit(options.limit);
  const claimedJobs = await pool.query<ClaimedStorageJob>(
    `SELECT
       job_id,
       user_id,
       object_key,
       attempt_count
     FROM private.claim_account_deletion_storage_jobs(
       $1::integer,
       $2::uuid
     )`,
    [limit, options.userId ?? null]
  );

  let completed = 0;
  let failed = 0;

  await Promise.all(
    claimedJobs.rows.map(async (job) => {
      try {
        await deleteStorageFile(job.object_key);
        await markJobCompleted(job.job_id);
        completed += 1;
      } catch {
        failed += 1;

        try {
          await markJobFailed(job.job_id);
        } catch {
          // El lease vence y permite recuperar el trabajo aunque el registro
          // del fallo también encuentre una interrupción temporal de la BD.
        }
      }
    })
  );

  return {
    claimed: claimedJobs.rows.length,
    completed,
    failed
  };
}

export const storageCleanupInternals = {
  normalizedLimit
};
