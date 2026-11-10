import { beforeEach, describe, expect, test, vi } from "vitest";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const SESSION_ID = "22222222-2222-4222-8222-222222222222";

const accountMocks = vi.hoisted(() => ({
  authenticated: false,
  executedSql: [] as string[],
  transactionUserIds: [] as string[],
  queryHandler: null as null | ((sql: string, parameters?: unknown[]) => Promise<{
    rows: unknown[];
    rowCount?: number;
  }>)
}));

const storageCleanupMocks = vi.hoisted(() => ({
  process: vi.fn()
}));

vi.mock("../auth/authenticate.js", () => ({
  authenticateRequest: async (request: any, reply: any) => {
    if (
      !accountMocks.authenticated ||
      request.headers.authorization !== "Bearer account-test-token"
    ) {
      await reply.status(401).send({
        message: "Se requiere autenticación."
      });
      return;
    }

    request.authenticatedUser = {
      id: USER_ID,
      sessionId: SESSION_ID
    };
  },
  requireActiveUser: async () => undefined,
  requireCompanyRole: () => async () => undefined
}));

vi.mock("../db/with-user-transaction.js", () => ({
  withUserTransaction: vi.fn(async (userId: string, operation: (client: any) => Promise<unknown>) => {
    accountMocks.transactionUserIds.push(userId);

    const client = {
      query: async (sql: string, parameters?: unknown[]) => {
        accountMocks.executedSql.push(sql);
        if (!accountMocks.queryHandler) {
          throw new Error("El test no configuró una respuesta SQL.");
        }
        return accountMocks.queryHandler(sql, parameters);
      }
    };

    return operation(client);
  }),
  queryAsUser: vi.fn()
}));

vi.mock("../account/storage-cleanup.js", () => ({
  processAccountDeletionStorageQueue: storageCleanupMocks.process
}));

import { buildApp } from "../app.js";

function authenticatedHeaders() {
  return {
    authorization: "Bearer account-test-token"
  };
}

function emptyQueryResult() {
  return {
    rows: [] as unknown[],
    rowCount: 0
  };
}

describe("Legal and Account Data End-to-End Tests (T-141)", () => {
  beforeEach(() => {
    accountMocks.authenticated = false;
    accountMocks.executedSql.length = 0;
    accountMocks.transactionUserIds.length = 0;
    accountMocks.queryHandler = async () => emptyQueryResult();
    storageCleanupMocks.process.mockReset();
    storageCleanupMocks.process.mockResolvedValue({
      claimed: 0,
      completed: 0,
      failed: 0
    });
  });

  test("GET /health should return 200 and ok status", async () => {
    const app = await buildApp();
    const response = await app.inject({
      method: "GET",
      url: "/health"
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.status).toBe("ok");
    expect(body.service).toBe("contractor-api");
    await app.close();
  });

  test("GET /legal/terms should return terms of service content", async () => {
    const app = await buildApp();
    const response = await app.inject({
      method: "GET",
      url: "/legal/terms"
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.title).toBe("Términos y Condiciones de Uso");
    expect(body.updatedAt).toBe("2026-11-10");
    expect(typeof body.content).toBe("string");
    expect(body.content).toContain("LEURET TECH");
    expect(body.content).toContain("Leuret App");
    expect(body.content).toContain("Decreto Ejecutivo 285 de 28 de mayo de 2021");
    expect(body.content).not.toContain("Documentación en actualización.");
    await app.close();
  });

  test("GET /legal/privacy should return privacy policy content", async () => {
    const app = await buildApp();
    const response = await app.inject({
      method: "GET",
      url: "/legal/privacy"
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.title).toBe("Política de Privacidad");
    expect(body.updatedAt).toBe("2026-11-10");
    expect(typeof body.content).toBe("string");
    expect(body.content).toContain("LEURET TECH");
    expect(body.content).toContain("Leuret App");
    expect(body.content).not.toContain("Documentación en actualización.");
    await app.close();
  });

  test("GET /account/export without auth should return 401", async () => {
    const app = await buildApp();
    const response = await app.inject({
      method: "GET",
      url: "/account/export"
    });

    expect(response.statusCode).toBe(401);
    expect(accountMocks.transactionUserIds).toEqual([]);
    await app.close();
  });

  test("DELETE /account without auth should return 401", async () => {
    const app = await buildApp();
    const response = await app.inject({
      method: "DELETE",
      url: "/account"
    });

    expect(response.statusCode).toBe(401);
    expect(accountMocks.transactionUserIds).toEqual([]);
    await app.close();
  });

  test("GET /account/export uses only real schema objects inside the authenticated RLS transaction", async () => {
    accountMocks.authenticated = true;
    accountMocks.queryHandler = async (sql) => {
      if (/\bissuer_id\b|\bactivity_logs\b|\bprofiles\.email\b/i.test(sql)) {
        throw new Error(`La consulta usa un objeto inexistente: ${sql}`);
      }

      if (/SELECT\s+account\.id,[\s\S]+FROM app_auth\.users AS account/i.test(sql)) {
        return {
          rows: [{ id: USER_ID, email: "persona@example.com" }]
        };
      }

      if (/SELECT profile\.\*[\s\S]+FROM public\.profiles AS profile/i.test(sql)) {
        return {
          rows: [{ id: USER_ID, full_name: "Persona Ejemplo" }]
        };
      }

      if (/FROM public\.projects AS project/i.test(sql)) {
        return {
          rows: [{ id: "project-1", created_by: USER_ID }]
        };
      }

      if (/FROM public\.activities AS activity/i.test(sql)) {
        return {
          rows: [{ id: "activity-1", assigned_user_id: USER_ID }]
        };
      }

      return emptyQueryResult();
    };

    const app = await buildApp();
    const response = await app.inject({
      method: "GET",
      url: "/account/export",
      headers: authenticatedHeaders()
    });

    expect(response.statusCode).toBe(200);
    expect(accountMocks.transactionUserIds).toEqual([USER_ID]);

    const body = response.json();
    expect(body.schemaVersion).toBe(1);
    expect(body.account).toEqual({
      id: USER_ID,
      email: "persona@example.com"
    });
    expect(body.profile.full_name).toBe("Persona Ejemplo");
    expect(body.commercial.projects).toEqual([
      { id: "project-1", created_by: USER_ID }
    ]);
    expect(body.operations.activities).toEqual([
      { id: "activity-1", assigned_user_id: USER_ID }
    ]);
    expect(response.headers["content-disposition"]).toContain(USER_ID);
    expect(response.headers["cache-control"]).toBe("no-store");

    const allSql = accountMocks.executedSql.join("\n");
    expect(allSql).toContain("FROM app_auth.users AS account");
    expect(allSql).toContain("FROM public.activities AS activity");
    expect(allSql).toContain("invoice.issued_by");
    expect(allSql).not.toMatch(/\bissuer_id\b|\bactivity_logs\b|\bprofiles\.email\b/i);
    expect(allSql).not.toContain("session.refresh_token_hash");
    expect(allSql).not.toContain("invitation.token_hash");
    await app.close();
  });

  test("DELETE /account anonymizes PII, enqueues personal documents and preserves shared project photos", async () => {
    accountMocks.authenticated = true;
    storageCleanupMocks.process.mockResolvedValue({
      claimed: 1,
      completed: 0,
      failed: 1
    });

    accountMocks.queryHandler = async (sql) => {
      if (/SELECT[\s\S]+profile\.doc_id_url[\s\S]+FROM public\.profiles AS profile/i.test(sql)) {
        return {
          rows: [{
            id: USER_ID,
            doc_id_url:
              `profile-documents/${USER_ID}/identification`,
            doc_operation_notice_url: null,
            doc_references_url: null,
            doc_address_proof_url: null
          }]
        };
      }

      if (/count\(\*\)::integer AS shared_photo_count/i.test(sql)) {
        return {
          rows: [{ shared_photo_count: 2 }]
        };
      }

      if (/enqueue_account_deletion_storage_job/i.test(sql)) {
        return {
          rows: [{
            enqueue_account_deletion_storage_job:
              "33333333-3333-4333-8333-333333333333"
          }]
        };
      }

      if (/UPDATE app_auth\.users/i.test(sql)) {
        return {
          rows: [{ id: USER_ID }],
          rowCount: 1
        };
      }

      return emptyQueryResult();
    };

    const app = await buildApp();
    const response = await app.inject({
      method: "DELETE",
      url: "/account",
      headers: authenticatedHeaders(),
      cookies: {
        refreshToken: "old-refresh-token"
      }
    });

    expect(response.statusCode).toBe(200);
    expect(accountMocks.transactionUserIds).toEqual([USER_ID]);

    const allSql = accountMocks.executedSql.join("\n");
    expect(allSql).toMatch(/UPDATE public\.profiles[\s\S]+full_name = NULL/);
    expect(allSql).toMatch(/DELETE FROM public\.user_push_tokens/);
    expect(allSql).toMatch(/active = false/);
    expect(allSql).toMatch(/registration_ip = NULL/);
    expect(allSql).toMatch(/doc_address_proof_url = NULL/);
    expect(allSql).toMatch(/UPDATE app_auth\.identities[\s\S]+identity_data = '\{\}'::jsonb/);
    expect(allSql).toMatch(/UPDATE app_auth\.tokens[\s\S]+used_at = COALESCE\(used_at, now\(\)\)/);
    expect(allSql).toMatch(/UPDATE app_auth\.sessions[\s\S]+revoked_at = COALESCE\(revoked_at, now\(\)\)/);
    expect(allSql).toMatch(/UPDATE app_auth\.users[\s\S]+email = NULL[\s\S]+deleted_at = COALESCE\(deleted_at, now\(\)\)/);
    expect(allSql).toContain("private.enqueue_account_deletion_storage_job");
    expect(allSql).not.toContain("photo.storage_path");
    expect(allSql).not.toContain("public.activity_logs");
    expect(storageCleanupMocks.process).toHaveBeenCalledWith({
      userId: USER_ID,
      limit: 1
    });

    const body = response.json();
    expect(body).toMatchObject({
      success: true,
      accountStatus: "deleted",
      authenticationDisabled: true,
      profilePersonalDataAnonymized: true,
      sessionsRevoked: true,
      storageCleanup: {
        status: "queued_for_retry",
        objectCount: 1,
        completedObjectCount: 0,
        pendingObjectCount: 1,
        failedObjectCount: 1,
        retryScheduled: true,
        sharedProjectPhotosPreserved: 2
      }
    });
    expect(body.storageCleanup).not.toHaveProperty("objects");

    const setCookie = String(response.headers["set-cookie"]);
    expect(setCookie).toContain("refreshToken=");
    expect(setCookie).toContain("Path=/");
    expect(setCookie).toContain("HttpOnly");
    expect(setCookie).toContain("SameSite=Lax");
    expect(setCookie).not.toContain("session_token");
    await app.close();
  });
});
