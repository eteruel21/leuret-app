import { afterEach, expect, test, vi } from "vitest";

import { buildApp } from "../../app.js";
import { pool } from "../../db/pool.js";
import { configureMetrics, recordIntegrationFailure, serviceLogger } from "../events.js";
import { createAppLogger } from "../logger.js";

afterEach(() => {
  configureMetrics(undefined);
  vi.restoreAllMocks();
});

function collectEvents() {
  const entries: Record<string, unknown>[] = [];
  vi.spyOn(serviceLogger, "child").mockImplementation((bindings) =>
    createAppLogger({ bindings, write: (_level, entry) => entries.push(entry) })
  );
  const writeDataPoint = vi.fn();
  configureMetrics({ writeDataPoint });
  return { entries, writeDataPoint };
}

test("correlaciona fallos capturados y tiempos HTTP con identificadores propios y rutas normalizadas", async () => {
  const { entries, writeDataPoint } = collectEvents();
  const app = await buildApp();
  app.post("/monitoring-fixture/:id", async (request) => {
    await Promise.resolve();
    recordIntegrationFailure("resend", "send_email", "http_error", { upstreamStatus: 503 });
    if ((request.body as { fail: boolean }).fail) throw new TypeError("Información personal de prueba");
    return { ok: true };
  });

  try {
    const [failed, ok, unmatched] = await Promise.all([
      app.inject({
        method: "POST",
        url: "/monitoring-fixture/private-1?token=private-query",
        headers: { "x-request-id": "untrusted-client-id" },
        payload: { fail: true }
      }),
      app.inject({ method: "POST", url: "/monitoring-fixture/private-2", payload: { fail: false } }),
      app.inject({ method: "GET", url: "/unmatched-private-path?token=private-query" })
    ]);

    expect([failed.statusCode, ok.statusCode, unmatched.statusCode]).toEqual([500, 200, 404]);
    const failedId = failed.headers["x-request-id"];
    const okId = ok.headers["x-request-id"];
    expect(failedId).toMatch(/^[0-9a-f-]{36}$/);
    expect(okId).not.toBe(failedId);
    expect(entries).toEqual(expect.arrayContaining([
      expect.objectContaining({ event: "integration_failure", reqId: failedId, component: "resend", upstreamStatus: 503 }),
      expect.objectContaining({ event: "integration_failure", reqId: okId, component: "resend" }),
      expect.objectContaining({ event: "api_error", reqId: failedId, errorType: "TypeError" }),
      expect.objectContaining({
        event: "http_request", reqId: failedId, route: "/monitoring-fixture/:id", statusCode: 500, durationMs: expect.any(Number)
      }),
      expect.objectContaining({ event: "http_request", route: "unmatched", statusCode: 404 })
    ]));
    expect(writeDataPoint).toHaveBeenCalledWith({
      indexes: ["http_request:api"],
      blobs: ["http_request", "api", "/monitoring-fixture/:id"],
      doubles: [expect.any(Number), 1]
    });
    expect(JSON.stringify(entries)).not.toMatch(/private-|unmatched-private-path|untrusted-client-id|Información personal/);
  } finally {
    await app.close();
  }
});

test("la comprobación de base de datos devuelve únicamente el estado y registra un fallo real", async () => {
  const { entries, writeDataPoint } = collectEvents();
  const query = vi.spyOn(pool, "query")
    .mockResolvedValueOnce({ command: "SELECT", rowCount: 1, oid: 0, fields: [], rows: [{ secret: "private name" }] })
    .mockRejectedValueOnce(new Error("private connection information"));
  const app = await buildApp();
  try {
    const available = await app.inject("/health/database");
    const unavailable = await app.inject("/health/database");
    expect(query).toHaveBeenCalledWith("SELECT NOW()");
    expect(available.statusCode).toBe(200);
    expect(available.json()).toEqual({ status: "ok" });
    expect(unavailable.statusCode).toBe(503);
    expect(unavailable.json()).toEqual({ status: "error" });
    expect(entries).toContainEqual(expect.objectContaining({
      event: "infrastructure_failure", component: "postgresql", reqId: unavailable.headers["x-request-id"]
    }));
    expect(writeDataPoint).toHaveBeenCalledWith(expect.objectContaining({
      blobs: ["infrastructure_failure", "postgresql", "health_check"]
    }));
    expect(JSON.stringify(entries)).not.toContain("private connection information");
  } finally {
    await app.close();
  }
});
