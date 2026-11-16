import { AsyncLocalStorage } from "node:async_hooks";
import type { FastifyBaseLogger } from "fastify";

import { env } from "../config/env.js";
import { createAppLogger, defaultLogLevel, type AppLogger } from "./logger.js";

export const serviceLogger = createAppLogger({
  level: defaultLogLevel(env.NODE_ENV, env.LOG_LEVEL),
  bindings: { environment: env.NODE_ENV }
});

const requestLogger = new AsyncLocalStorage<AppLogger>();

export function withRequestLogger(logger: AppLogger, next: () => void): void {
  requestLogger.run(logger, next);
}

type MetricsDataset = {
  writeDataPoint(point: { indexes: string[]; blobs: string[]; doubles: number[] }): void;
};

let dataset: MetricsDataset | undefined;

export function configureMetrics(binding: MetricsDataset | undefined): void {
  dataset = binding;
}

function writeMetric(event: string, component: string, operation: string, durationMs: number, failed: number): void {
  try {
    dataset?.writeDataPoint({
      indexes: [`${event}:${component}`],
      blobs: [event, component, operation],
      doubles: [durationMs, failed]
    });
  } catch {
    serviceLogger.warn({ event: "metrics_write_failure" }, "No se pudo registrar una métrica.");
  }
}

type HttpRequestEvent = {
  method: string;
  route: string;
  statusCode: number;
  durationMs: number;
};

export function recordHttpRequest(logger: FastifyBaseLogger, data: HttpRequestEvent): void {
  const event = "http_request";
  const severity = data.statusCode >= 500 ? "error" : data.durationMs >= 3000 ? "warn" : "info";
  logger[severity]({ event, ...data }, "Solicitud HTTP completada.");
  writeMetric(event, "api", data.route, data.durationMs, Number(data.statusCode >= 500));
}

type IntegrationComponent = "resend" | "turnstile" | "expo_push" | "r2";
type InfrastructureComponent = "postgresql" | "worker" | "worker_cron";
type FailureReason =
  | "not_configured"
  | "request_failed"
  | "http_error"
  | "invalid_response"
  | "provider_error"
  | "operation_failed"
  | "retry_pending";

type FailureDetails = {
  upstreamStatus?: number;
  failedCount?: number;
  durationMs?: number;
};

function recordFailure(
  event: "integration_failure" | "infrastructure_failure",
  component: IntegrationComponent | InfrastructureComponent,
  operation: string,
  reason: FailureReason,
  details: FailureDetails
): void {
  const logger = requestLogger.getStore() ?? serviceLogger;
  logger.error({ event, component, operation, reason, ...details }, "Falló una operación del servicio.");
  writeMetric(event, component, operation, details.durationMs ?? 0, 1);
}

export function recordIntegrationFailure(
  component: IntegrationComponent,
  operation: string,
  reason: FailureReason,
  details: FailureDetails = {}
): void {
  recordFailure("integration_failure", component, operation, reason, details);
}

export function recordInfrastructureFailure(
  component: InfrastructureComponent,
  operation: string,
  reason: FailureReason,
  details: FailureDetails = {}
): void {
  recordFailure("infrastructure_failure", component, operation, reason, details);
}
