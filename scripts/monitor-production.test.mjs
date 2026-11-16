import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { checkProduction } from "./monitor-production.mjs";

const target = { name: "API", url: "https://fixture.invalid/health", type: "json", service: "contractor-api" };
const good = () => Response.json({ status: "ok", service: "contractor-api", environment: "production" });

test("dos fallos disparan la alerta y una recuperación en el segundo intento evita el aviso", async () => {
  const [failed] = await checkProduction({
    targets: [target],
    fetchResponse: async () => new Response(null, { status: 503 }),
    retryDelayMs: 0
  });
  assert.equal(failed.critical, true);
  assert.deepEqual(failed.attempts.map((attempt) => attempt.httpStatus), [503, 503]);

  let calls = 0;
  const [recovered] = await checkProduction({
    targets: [target],
    fetchResponse: async () => ++calls === 1 ? new Response(null, { status: 503 }) : good(),
    retryDelayMs: 0
  });
  assert.equal(recovered.critical, false);
  assert.deepEqual(recovered.attempts.map((attempt) => attempt.result), ["http_error", "ok"]);
});

test("HTTP 200 con contenido incorrecto o una redirección no se considera disponible", async () => {
  const fixtures = [
    [() => Response.json({ status: "error" }), "invalid_response"],
    [() => new Response("<html>error</html>", { headers: { "Content-Type": "text/html" } }), "invalid_response"],
    [() => Response.redirect("https://fixture.invalid/error"), "http_error"]
  ];
  for (const [response, expected] of fixtures) {
    const [failed] = await checkProduction({
      targets: [target],
      fetchResponse: async (_url, request) => {
        assert.equal(request.redirect, "manual");
        return response();
      },
      retryDelayMs: 0
    });
    assert.equal(failed.critical, true);
    assert.equal(failed.attempts[1].result, expected);
  }
});

test("la latencia sostenida también dispara la alerta", async () => {
  const [slow] = await checkProduction({
    targets: [target],
    fetchResponse: async () => good(),
    slowMs: 0,
    retryDelayMs: 0
  });
  assert.equal(slow.critical, true);
  assert.deepEqual(slow.attempts.map((attempt) => attempt.result), ["slow", "slow"]);
});

test("la simulación termina con el código de fallo que recibe GitHub Actions", () => {
  const script = fileURLToPath(new URL("./monitor-production.mjs", import.meta.url));
  const { status, stdout, stderr } = spawnSync(process.execPath, [script, "--simulate-failure"], {
    encoding: "utf8",
    env: { ...process.env, GITHUB_STEP_SUMMARY: "" }
  });
  assert.equal(status, 1);
  assert.match(stderr, /::error.*Prueba de alerta/);
  assert.match(stdout, /503.*http_error/);
});
