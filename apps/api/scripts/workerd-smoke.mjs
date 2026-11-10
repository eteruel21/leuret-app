// Arranca el Worker real de la API en workerd (el mismo runtime de
// Cloudflare) con `wrangler dev` y comprueba que responda. La prueba de
// apps/api/scripts/worker-runtime-smoke.mjs corre en Node y no detecta
// incompatibilidades del runtime de Workers, como la del 2026-11-09
// (error 1101 por `pino.symbols`).

import { spawn } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const apiDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = path.resolve(apiDir, "..", "..");
const port = Number(process.env.WORKERD_SMOKE_PORT ?? 8799);
const baseUrl = `http://127.0.0.1:${port}`;
const startupTimeoutMs = 120_000;

const workDir = await mkdtemp(path.join(tmpdir(), "workerd-smoke-"));
const varsFile = path.join(workDir, ".dev.vars");

// Secretos de prueba: solo existen para que la validación de entorno pase.
await writeFile(
  varsFile,
  [
    "JWT_SECRET=workerd_smoke_secret_that_is_long_enough_for_validation_123",
    "TURNSTILE_SECRET_KEY=1x0000000000000000000000000000000AA",
    "RESEND_API_KEY=re_workerd_smoke_test",
    'EMAIL_FROM="Leuret <noreply@example.test>"',
    "TURNSTILE_ALLOWED_HOSTNAMES=localhost",
  ].join("\n") + "\n"
);

const wranglerBin = path.join(repoRoot, "node_modules", ".bin", process.platform === "win32" ? "wrangler.cmd" : "wrangler");

const child = spawn(
  wranglerBin,
  [
    "dev",
    "--config",
    path.join(apiDir, "wrangler.worker.jsonc"),
    "--env-file",
    varsFile,
    "--port",
    String(port),
    "--ip",
    "127.0.0.1",
    "--local",
    "--show-interactive-dev-session=false",
    "--log-level",
    "warn",
  ],
  {
    cwd: apiDir,
    env: {
      ...process.env,
      CI: "true",
      WRANGLER_SEND_METRICS: "false",
      // Hyperdrive local: el /health no consulta la base, pero el binding debe existir.
      CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE:
        process.env.WORKERD_SMOKE_DATABASE_URL ?? "postgres://postgres:postgres@127.0.0.1:5432/postgres",
    },
    stdio: ["ignore", "pipe", "pipe"],
  }
);

let output = "";
child.stdout.on("data", (chunk) => (output += chunk));
child.stderr.on("data", (chunk) => (output += chunk));

async function stop() {
  if (child.exitCode === null) {
    child.kill("SIGTERM");
    await new Promise((resolve) => {
      const timer = setTimeout(() => {
        child.kill("SIGKILL");
        resolve();
      }, 5000);
      child.once("exit", () => {
        clearTimeout(timer);
        resolve();
      });
    });
  }
  await rm(workDir, { recursive: true, force: true });
}

async function waitForServer() {
  const deadline = Date.now() + startupTimeoutMs;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`wrangler dev terminó antes de tiempo (código ${child.exitCode}).`);
    }
    try {
      const response = await fetch(`${baseUrl}/health`);
      return response;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }
  throw new Error("El Worker no respondió a tiempo.");
}

function fail(message) {
  console.error(`✗ ${message}`);
  console.error("--- salida de wrangler ---");
  console.error(output.slice(-6000));
  process.exitCode = 1;
}

try {
  const health = await waitForServer();
  const healthBody = await health.text();

  if (health.status !== 200) {
    fail(`/health respondió ${health.status} en workerd: ${healthBody.slice(0, 500)}`);
  } else {
    const parsed = JSON.parse(healthBody);
    if (parsed.status !== "ok" || parsed.environment !== "production") {
      fail(`/health respondió un cuerpo inesperado: ${healthBody.slice(0, 500)}`);
    }
  }

  if (!process.exitCode) {
    const protectedRoute = await fetch(`${baseUrl}/projects/00000000-0000-4000-8000-000000000000`);
    const protectedBody = await protectedRoute.text();
    if (protectedRoute.status !== 401) {
      fail(`Una ruta protegida respondió ${protectedRoute.status} en lugar de 401: ${protectedBody.slice(0, 500)}`);
    }
  }

  if (!process.exitCode) {
    console.log("✓ La API arranca y responde dentro de workerd (runtime de Cloudflare).");
  }
} catch (error) {
  fail(error instanceof Error ? error.message : String(error));
} finally {
  await stop();
}
