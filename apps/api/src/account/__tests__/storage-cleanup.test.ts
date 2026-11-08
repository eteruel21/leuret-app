import { beforeEach, describe, expect, test, vi } from "vitest";

const cleanupMocks = vi.hoisted(() => ({
  query: vi.fn(),
  deleteStorageFile: vi.fn()
}));

vi.mock("../../db/pool.js", () => ({
  pool: {
    query: cleanupMocks.query
  }
}));

vi.mock("../../storage/provider.js", () => ({
  deleteStorageFile: cleanupMocks.deleteStorageFile
}));

import {
  processAccountDeletionStorageQueue,
  storageCleanupInternals
} from "../storage-cleanup.js";

const USER_ID = "11111111-1111-4111-8111-111111111111";

describe("cola durable de limpieza de cuentas", () => {
  beforeEach(() => {
    cleanupMocks.query.mockReset();
    cleanupMocks.deleteStorageFile.mockReset();
  });

  test("elimina documentos, completa éxitos y conserva fallos para reintento", async () => {
    cleanupMocks.query.mockImplementation(
      async (sql: string) => {
        if (sql.includes("claim_account_deletion_storage_jobs")) {
          return {
            rows: [
              {
                job_id: "22222222-2222-4222-8222-222222222222",
                user_id: USER_ID,
                object_key:
                  `profile-documents/${USER_ID}/identification`,
                attempt_count: 1
              },
              {
                job_id: "33333333-3333-4333-8333-333333333333",
                user_id: USER_ID,
                object_key:
                  `profile-documents/${USER_ID}/address_proof`,
                attempt_count: 2
              }
            ]
          };
        }

        return { rows: [{ result: true }] };
      }
    );

    cleanupMocks.deleteStorageFile.mockImplementation(
      async (objectKey: string) => {
        if (objectKey.endsWith("/address_proof")) {
          throw new Error("Interrupción temporal de R2");
        }
      }
    );

    const result = await processAccountDeletionStorageQueue({
      userId: USER_ID,
      limit: 2
    });

    expect(result).toEqual({
      claimed: 2,
      completed: 1,
      failed: 1
    });

    expect(cleanupMocks.query).toHaveBeenCalledWith(
      expect.stringContaining("claim_account_deletion_storage_jobs"),
      [2, USER_ID]
    );
    expect(cleanupMocks.query).toHaveBeenCalledWith(
      expect.stringContaining("complete_account_deletion_storage_job"),
      ["22222222-2222-4222-8222-222222222222"]
    );
    expect(cleanupMocks.query).toHaveBeenCalledWith(
      expect.stringContaining("fail_account_deletion_storage_job"),
      ["33333333-3333-4333-8333-333333333333"]
    );
  });

  test("limita cada tanda entre 1 y 100 trabajos", () => {
    expect(storageCleanupInternals.normalizedLimit(0)).toBe(1);
    expect(storageCleanupInternals.normalizedLimit(500)).toBe(100);
    expect(storageCleanupInternals.normalizedLimit(undefined)).toBe(25);
  });
});
