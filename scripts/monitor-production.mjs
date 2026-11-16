import { appendFile } from "node:fs/promises";
import { setTimeout as delay } from "node:timers/promises";
import { pathToFileURL } from "node:url";

const productionProbes = [
  { name: "API", url: "https://api.leurettech.com/health", type: "json", service: "contractor-api" },
  { name: "PostgreSQL vía Hyperdrive", url: "https://api.leurettech.com/health/database", type: "json" },
  { name: "Leuret App web", url: "https://app.leurettech.com/", type: "html", title: /^Leuret$/i },
  { name: "Leuret Admin", url: "https://admin.leurettech.com/", type: "html", title: /^Leuret.*Panel Super Admin$/i }
];

async function hasExpectedContent(target, response) {
  const contentType = response.headers.get("content-type")?.split(";")[0].trim().toLowerCase();
  if (target.type === "json" && contentType === "application/json") {
    const body = await response.json();
    return body?.status === "ok" &&
      (!target.service || (body.service === target.service && body.environment === "production"));
  }
  if (target.type === "html" && contentType === "text/html") {
    const html = await response.text();
    const title = html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1].trim() ?? "";
    return target.title.test(title);
  }
  await response.body?.cancel();
  return false;
}

async function probe(target, fetchResponse, timeoutMs, slowMs) {
  const start = performance.now();
  const signal = AbortSignal.timeout(timeoutMs);
  let httpStatus = null;
  let result;
  try {
    const response = await fetchResponse(target.url, {
      signal,
      redirect: "manual",
      headers: { "Cache-Control": "no-cache" }
    });
    httpStatus = response.status;
    if (httpStatus !== 200) {
      await response.body?.cancel();
      result = "http_error";
    } else if (!await hasExpectedContent(target, response)) {
      result = "invalid_response";
    } else {
      result = performance.now() - start >= slowMs ? "slow" : "ok";
    }
  } catch (error) {
    result = signal.aborted ? "timeout" : error instanceof SyntaxError ? "invalid_response" : "connection_error";
  }
  return { httpStatus, result, durationMs: Math.round(performance.now() - start) };
}

export async function checkProduction({
  targets = productionProbes,
  fetchResponse = fetch,
  timeoutMs = 12_000,
  slowMs = 5_000,
  retryDelayMs = 10_000
} = {}) {
  return Promise.all(targets.map(async (target) => {
    const first = await probe(target, fetchResponse, timeoutMs, slowMs);
    if (first.result === "ok") {
      return { name: target.name, critical: false, attempts: [first] };
    }
    await delay(retryDelayMs);
    const second = await probe(target, fetchResponse, timeoutMs, slowMs);
    return { name: target.name, critical: second.result !== "ok", attempts: [first, second] };
  }));
}

async function main() {
  const simulateFailure = process.argv.includes("--simulate-failure");
  const results = await checkProduction(simulateFailure ? {
    targets: [{ name: "Prueba de alerta", url: "https://test.invalid/health", type: "json" }],
    fetchResponse: async () => new Response(null, { status: 503 }),
    retryDelayMs: 0
  } : undefined);

  const rows = ["| Componente | Intento | Estado | Latencia | Resultado |", "|---|---:|---:|---:|---|"];
  for (const check of results) {
    check.attempts.forEach(({ httpStatus, durationMs, result }, index) => {
      rows.push(`| ${check.name} | ${index + 1} | ${httpStatus ?? "—"} | ${durationMs} ms | ${result} |`);
    });
    if (check.critical) {
      console.error(`::error title=Leuret · incidencia de disponibilidad::${check.name} falló en ambos intentos`);
      process.exitCode = 1;
    }
  }
  const report = rows.join("\n");
  console.log(report);
  if (process.env.GITHUB_STEP_SUMMARY) {
    await appendFile(process.env.GITHUB_STEP_SUMMARY, `## Disponibilidad de Leuret\n\n${report}\n`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
