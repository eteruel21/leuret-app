/// <reference path="../worker-configuration.d.ts" />

import { httpServerHandler } from "cloudflare:node";

import { buildApp } from "./app.js";
import { processAccountDeletionStorageQueue } from "./account/storage-cleanup.js";
import { processInvoicePaymentReminders } from "./invoices/payment-reminders.js";
import { safeErrorDetails } from "./security/redaction.js";
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

let handlerPromise:
  Promise<CloudflareHttpHandler> | undefined;

function configureRuntimeBindings(env: Env): void {
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
    env: Env,
    context: ExecutionContext
  ): Promise<Response> {
    configureRuntimeBindings(env);

    const handler = await getHandler();

    if (!handler.fetch) {
      throw new Error(
        "El adaptador HTTP de Cloudflare no expuso fetch."
      );
    }

    return handler.fetch(
      request as unknown as CloudflareHttpRequest,
      env,
      context
    );
  },

  async scheduled(
    _controller: ScheduledController,
    env: Env,
    context: ExecutionContext
  ): Promise<void> {
    configureRuntimeBindings(env);

    context.waitUntil(
      processAccountDeletionStorageQueue({
        limit: 50
      }).then((result) => {
        if (result.failed > 0) {
          console.warn(
            "La limpieza programada de cuentas conserva objetos para reintento.",
            {
              claimed: result.claimed,
              completed: result.completed,
              failed: result.failed
            }
          );
        }
      })
    );

    context.waitUntil(
      processInvoicePaymentReminders({ limit: 25 })
        .then((result) => {
          if (result.claimed > 0) {
            console.log(JSON.stringify({ level: "info", msg: "Recordatorios de cobro procesados.", ...result }));
          }
        })
        .catch((error: unknown) => {
          console.error("Fallaron los recordatorios de cobro programados.", safeErrorDetails(error));
        })
    );
  }
} satisfies ExportedHandler<Env>;
