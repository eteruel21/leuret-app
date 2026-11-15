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
  companyRoles: ["owner", "admin", "estimator", "sales", "supervisor", "member"],
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
      sessionId: SESSION_ID,
      status: "active"
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
    expect(body.schemaVersion).toBe(2);
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
    expect(response.headers["content-disposition"]).toMatch(/leuret-datos-\d{4}-\d{2}-\d{2}\.json/);
    expect(body.jobRequests).toEqual({
      requests: [],
      addresses: [],
      photos: [],
      conversations: [],
      messages: []
    });
    expect(body.connections.clientConnectionRequests).toEqual([]);
    expect(Array.isArray(body.files)).toBe(true);
    expect(response.headers["cache-control"]).toBe("no-store");

    const allSql = accountMocks.executedSql.join("\n");
    expect(allSql).toContain("FROM app_auth.users AS account");
    expect(allSql).toContain("FROM public.activities AS activity");
    expect(allSql).toContain("invoice.issued_by");
    expect(allSql).not.toMatch(/\bissuer_id\b|\bactivity_logs\b|\bprofiles\.email\b/i);
    expect(allSql).not.toContain("session.refresh_token_hash");
    expect(allSql).not.toContain("invitation.token_hash");
    expect(allSql).not.toContain("token.expo_push_token");
    expect(allSql).not.toContain("phone_code");
    expect(allSql).toContain("private.export_own_connection_requests()");
    // Ajustes de calculadoras y guía de inicio (migración 047).
    expect(allSql).toContain("FROM public.user_app_settings AS setting");
    expect(body.appSettings).toEqual([]);
    await app.close();
  });

  test("GET /account/export lists personal files with signed links and hides storage paths", async () => {
    accountMocks.authenticated = true;
    accountMocks.queryHandler = async (sql) => {
      if (/FROM app_auth\.users AS account/i.test(sql)) {
        return { rows: [{ id: USER_ID, email: "persona@example.com", deleted_at: null }] };
      }
      if (/SELECT profile\.\*[\s\S]+FROM public\.profiles AS profile/i.test(sql)) {
        return {
          rows: [{
            id: USER_ID,
            avatar_url: "/storage/public/profile-media/x/avatar?v=1",
            doc_id_url: `profile-documents/${USER_ID}/identification`,
            doc_references_url: "https://example.com/no-interno.pdf"
          }]
        };
      }
      if (/FROM public\.job_request_photos AS photo/i.test(sql)) {
        return {
          rows: [{
            id: "44444444-4444-4444-8444-444444444444",
            request_id: "55555555-5555-4555-8555-555555555555",
            storage_path: "job-requests/555/foto.jpg",
            mime_type: "image/jpeg",
            file_size: 1200,
            created_at: "2026-11-01T10:00:00.000Z"
          }]
        };
      }
      return emptyQueryResult();
    };

    const app = await buildApp();
    const response = await app.inject({
      method: "GET",
      url: "/account/export",
      headers: { ...authenticatedHeaders(), host: "api.example.com" }
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    const kinds = body.files.map((file: { kind: string }) => file.kind);
    expect(kinds).toEqual(["profile_document", "profile_media", "job_request_photo"]);
    expect(body.files[0].downloadUrl).toMatch(
      new RegExp(`^http://api\\.example\\.com/storage/profile-documents/${USER_ID}/identification\\?token=`)
    );
    expect(body.files[2].downloadUrl).toMatch(
      /^http:\/\/api\.example\.com\/storage\/files\/44444444-4444-4444-8444-444444444444\?token=/
    );
    expect(body.jobRequests.photos[0]).not.toHaveProperty("storage_path");
    expect(JSON.stringify(body)).not.toContain("job-requests/555/foto.jpg");
    expect(body.format.filesExpireAt).toBeTruthy();
    await app.close();
  });

  test("GET /account/export responds 410 for a deleted account", async () => {
    accountMocks.authenticated = true;
    accountMocks.queryHandler = async (sql) => {
      if (/FROM app_auth\.users AS account/i.test(sql)) {
        return { rows: [{ id: USER_ID, email: null, deleted_at: "2026-11-15T00:00:00.000Z" }] };
      }
      return emptyQueryResult();
    };

    const app = await buildApp();
    const response = await app.inject({
      method: "GET",
      url: "/account/export",
      headers: authenticatedHeaders()
    });

    expect(response.statusCode).toBe(410);
    await app.close();
  });

  test("POST /account/export/link returns a short link that downloads the export without a session", async () => {
    accountMocks.authenticated = true;
    accountMocks.queryHandler = async (sql) => {
      if (/FROM app_auth\.users AS account/i.test(sql)) {
        return { rows: [{ id: USER_ID, email: "persona@example.com", deleted_at: null }] };
      }
      return emptyQueryResult();
    };

    const app = await buildApp();
    const linkResponse = await app.inject({
      method: "POST",
      url: "/account/export/link",
      headers: authenticatedHeaders()
    });

    expect(linkResponse.statusCode).toBe(200);
    const link = linkResponse.json();
    expect(link.path).toMatch(/^\/account\/export\/download\?token=/);

    accountMocks.authenticated = false;
    const download = await app.inject({ method: "GET", url: link.path });
    expect(download.statusCode).toBe(200);
    expect(download.headers["content-disposition"]).toContain("attachment");
    expect(download.json().account.id).toBe(USER_ID);
    expect(accountMocks.transactionUserIds).toEqual([USER_ID]);

    const forged = await app.inject({
      method: "GET",
      url: "/account/export/download?token=no-es-un-token"
    });
    expect(forged.statusCode).toBe(403);
    await app.close();
  });

  test("GET /account/deletion-preview explains what is deleted, retained and blocked", async () => {
    accountMocks.authenticated = true;
    accountMocks.queryHandler = async (sql) => {
      if (/private\.account_deletion_preview\(\)/.test(sql)) {
        return {
          rows: [{
            scope: {
              blockers: [{ companyId: "c1", companyName: "Equipo SA", activeMembers: 2 }],
              companiesToClose: [],
              membershipsToEnd: 1,
              toDelete: { jobRequests: 2, notifications: 4 },
              retained: [
                { category: "client_fiscal_documents", invoices: 3, creditNotes: 0, payments: 1, retainUntil: "2031-12-31" },
                { category: "team_contributions", projectPhotos: 0, budgets: 0, retainUntil: null }
              ],
              retentionUntil: "2031-12-31"
            }
          }]
        };
      }
      return emptyQueryResult();
    };

    const app = await buildApp();
    const response = await app.inject({
      method: "GET",
      url: "/account/deletion-preview",
      headers: authenticatedHeaders()
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.canDelete).toBe(false);
    expect(body.blockers[0].companyName).toBe("Equipo SA");
    expect(body.toDelete.jobRequests).toBe(2);
    // Las categorías vacías no se muestran.
    expect(body.retained).toHaveLength(1);
    expect(body.retained[0]).toMatchObject({
      category: "client_fiscal_documents",
      retainUntil: "2031-12-31",
      counts: { invoices: 3, payments: 1 }
    });
    expect(body.retained[0].legalBasis).toContain("cinco años");
    await app.close();
  });

  test("DELETE /account runs the database deletion, cleans files and reports what was retained", async () => {
    accountMocks.authenticated = true;
    storageCleanupMocks.process.mockResolvedValue({
      claimed: 3,
      completed: 2,
      failed: 1
    });

    accountMocks.queryHandler = async (sql) => {
      if (/private\.delete_own_account\(\)/.test(sql)) {
        return {
          rows: [{
            result: {
              deletedAt: "2026-11-15T05:00:00.000Z",
              deleted: { jobRequests: 1, notifications: 2, clientLinksRemoved: 1 },
              storageObjectsQueued: 3,
              retained: [
                { category: "client_fiscal_documents", invoices: 1, creditNotes: 0, payments: 0, retainUntil: "2030-12-31" },
                { category: "team_contributions", projectPhotos: 2, budgets: 0, retainUntil: null },
                { category: "security_records", auditEntries: 0, sessions: 0, retainUntil: null }
              ],
              retentionUntil: "2030-12-31"
            }
          }]
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
    expect(allSql).toContain("private.delete_own_account()");
    // La API ya no modifica tablas directamente: lo hace la función de la base.
    expect(allSql).not.toMatch(/UPDATE public\.profiles|DELETE FROM public\./);
    expect(storageCleanupMocks.process).toHaveBeenCalledWith({
      userId: USER_ID,
      limit: 3
    });

    const body = response.json();
    expect(body).toMatchObject({
      success: true,
      accountStatus: "deleted",
      authenticationDisabled: true,
      profilePersonalDataAnonymized: true,
      sessionsRevoked: true,
      retentionUntil: "2030-12-31",
      deleted: { jobRequests: 1, notifications: 2, clientLinksRemoved: 1 },
      storageCleanup: {
        status: "queued_for_retry",
        objectCount: 3,
        completedObjectCount: 2,
        pendingObjectCount: 1,
        failedObjectCount: 1,
        retryScheduled: true,
        sharedProjectPhotosPreserved: 2
      }
    });
    expect(body.retained.map((item: { category: string }) => item.category)).toEqual([
      "client_fiscal_documents",
      "team_contributions"
    ]);
    expect(body.storageCleanup).not.toHaveProperty("objects");

    const setCookie = String(response.headers["set-cookie"]);
    expect(setCookie).toContain("refreshToken=");
    expect(setCookie).toContain("Path=/");
    expect(setCookie).toContain("HttpOnly");
    expect(setCookie).toContain("SameSite=Lax");
    expect(setCookie).not.toContain("session_token");
    await app.close();
  });

  test("DELETE /account responds 409 with the companies that need an ownership transfer", async () => {
    accountMocks.authenticated = true;
    accountMocks.queryHandler = async (sql) => {
      if (/private\.delete_own_account\(\)/.test(sql)) {
        throw Object.assign(new Error("Transfiere la propiedad de tus empresas antes de eliminar la cuenta."), {
          code: "55000",
          hint: "account_deletion_blocked_by_company_ownership",
          detail: JSON.stringify([{ companyId: "c1", companyName: "Equipo SA", activeMembers: 2 }])
        });
      }
      return emptyQueryResult();
    };

    const app = await buildApp();
    const response = await app.inject({
      method: "DELETE",
      url: "/account",
      headers: authenticatedHeaders()
    });

    expect(response.statusCode).toBe(409);
    const body = response.json();
    expect(body.code).toBe("COMPANY_OWNERSHIP_TRANSFER_REQUIRED");
    expect(body.blockers).toEqual([{ companyId: "c1", companyName: "Equipo SA", activeMembers: 2 }]);
    expect(storageCleanupMocks.process).not.toHaveBeenCalled();
    expect(response.headers["set-cookie"]).toBeUndefined();
    await app.close();
  });
});
