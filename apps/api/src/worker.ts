/// <reference path="../worker-configuration.d.ts" />

import { httpServerHandler } from "cloudflare:node";

import { buildApp } from "./app.js";
import { processAccountDeletionStorageQueue } from "./account/storage-cleanup.js";
import { processInvoicePaymentReminders } from "./invoices/payment-reminders.js";
import { configureMetrics, recordInfrastructureFailure, serviceLogger } from "./observability/events.js";
import {
  configureHyperdriveDatabase
} from "./db/pool.js";

import { configureR2Storage } from "./storage/provider.js";

type CloudflareNodeServer =
  Parameters<typeof httpServerHandler>[0];

type CloudflareHttpHandler =
  ReturnType<typeof httpServerHandler>;

type CloudflareHttpFetch =
  NonNullable<CloudflareHttpHandler["fetch"]>;

type CloudflareHttpRequest =
  Parameters<CloudflareHttpFetch>[0];
type WorkerEnv = Env & { LEURET_METRICS: AnalyticsEngineDataset };

let handlerPromise:
  Promise<CloudflareHttpHandler> | undefined;

function configureRuntimeBindings(env: WorkerEnv): void {
  configureHyperdriveDatabase(
    env.HYPERDRIVE.connectionString
  );

  if (!env.R2_STORAGE) {
    throw new Error(
      "El binding R2_STORAGE es obligatorio en producción."
    );
  }

  configureR2Storage(env.R2_STORAGE);
}

async function monitorScheduledTask<T extends { claimed: number; failed: number }>(
  operation: "account_storage_cleanup" | "invoice_payment_reminders",
  task: Promise<T>
): Promise<void> {
  try {
    const result = await task;
    if (result.claimed > 0) {
      serviceLogger.info({ event: "scheduled_task", operation, ...result }, "Tanda de trabajo procesada.");
    }
    if (result.failed > 0) {
      recordInfrastructureFailure("worker_cron", operation, "retry_pending", { failedCount: result.failed });
    }
  } catch {
    recordInfrastructureFailure("worker_cron", operation, "operation_failed");
    throw new Error(`Falló la tarea programada ${operation}.`);
  }
}

async function getHandler():
  Promise<CloudflareHttpHandler> {
  if (!handlerPromise) {
    handlerPromise = (async () => {
      const app = await buildApp();

      await app.ready();

      return httpServerHandler(
        app.server as unknown as CloudflareNodeServer
      );
    })().catch((error) => {
      handlerPromise = undefined;
      throw error;
    });
  }

  return handlerPromise;
}

export default {
  async fetch(
    request: Request,
    env: WorkerEnv,
    context: ExecutionContext
  ): Promise<Response> {
    configureMetrics(env.LEURET_METRICS);
    try {
      configureRuntimeBindings(env);
      const handler = await getHandler();
      if (!handler.fetch) {
        throw new Error("El adaptador HTTP de Cloudflare no expuso fetch.");
      }
      return await handler.fetch(request as unknown as CloudflareHttpRequest, env, context);
    } catch {
      recordInfrastructureFailure("worker", "fetch", "operation_failed");
      throw new Error("Falló la ejecución HTTP del Worker.");
    }
  },

  async scheduled(
    _controller: ScheduledController,
    env: WorkerEnv,
    context: ExecutionContext
  ): Promise<void> {
    configureMetrics(env.LEURET_METRICS);
    try {
      configureRuntimeBindings(env);
    } catch {
      recordInfrastructureFailure("worker", "scheduled", "operation_failed");
      throw new Error("Falló el inicio de las tareas programadas del Worker.");
    }

    context.waitUntil(
      monitorScheduledTask("account_storage_cleanup", processAccountDeletionStorageQueue({ limit: 50 }))
    );
    context.waitUntil(
      monitorScheduledTask("invoice_payment_reminders", processInvoicePaymentReminders({ limit: 25 }))
    );
  }
} satisfies ExportedHandler<WorkerEnv>;
