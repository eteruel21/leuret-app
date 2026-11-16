import { registerAdminRoutes } from "./admin/routes.js";
import { registerAdminMailRoutes } from "./admin/mail-routes.js";
import { registerInvoiceRoutes } from "./invoices/routes.js";
import { registerOperationRoutes } from "./operations/routes.js";
import { registerBudgetRoutes } from "./budgets/routes.js";
import { registerCalculationRoutes } from "./calculations/routes.js";
import { registerProjectRoutes } from "./projects/routes.js";
import { registerClientRoutes } from "./clients/routes.js";
import { registerCompanyRoutes } from "./companies/routes.js";
import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";
import Fastify, { LogController, type FastifyBaseLogger } from "fastify";
import fastifyCookie from "@fastify/cookie";

import { registerAuthRoutes } from "./auth/routes.js";
import { corsOrigins, env } from "./config/env.js";
import { registerCatalogRoutes } from "./catalog/routes.js";
import { pool } from "./db/pool.js";
import { registerProfileRoutes } from "./profile/routes.js";
import { registerProfileDocumentRoutes } from "./profile/document-routes.js";
import { registerActivityRoutes } from "./activities/routes.js";
import { registerDashboardRoutes } from "./dashboard/routes.js";
import { registerSalesRoutes } from "./sales/routes.js";
import { registerProjectTaskRoutes } from "./projects/tasks/routes.js";
import { registerProjectProgressRoutes } from "./projects/progress/routes.js";
import { registerStorageRoutes } from "./storage/routes.js";
import { registerNotificationRoutes } from "./notifications/routes.js";
import { registerAccountLegalRoutes } from "./account/routes.js";
import { registerClientPortalRoutes } from "./client-portal/routes.js";
import { registerClientConnectionRoutes } from "./client-connections/routes.js";
import { registerJobRequestRoutes } from "./job-requests/routes.js";
import { registerUserSettingsRoutes } from "./settings/routes.js";
import {
  recordHttpRequest,
  recordInfrastructureFailure,
  serviceLogger,
  withRequestLogger
} from "./observability/events.js";
import { getClientIp } from "./security/client-ip.js";

const loggedErrorTypes = new Set([
  "DatabaseError", "Error", "RangeError", "ReferenceError", "SyntaxError", "TypeError"
]);

export async function buildApp() {
  // No usamos `loggerInstance`: en Cloudflare Workers Fastify intenta leer
  // `pino.symbols`, que no existe en el paquete del Worker, y la API no
  // arranca (error 1101). Fastify queda con logger: false y cada petición
  // recibe nuestro logger propio en el primer hook.
  const app = Fastify({
    logger: false,
    logController: new LogController({ disableRequestLogging: true }),
    requestIdHeader: false,
    genReqId: () => crypto.randomUUID()
  });

  app.addHook("onRequest", (request, reply, done) => {
    const log = serviceLogger.child({ reqId: request.id });
    request.log = log as unknown as FastifyBaseLogger;
    reply.header("X-Request-ID", request.id);
    withRequestLogger(log, done);
  });

  app.decorateRequest("authenticatedUser", null);

  app.setErrorHandler((error, request, reply) => {
    const errorStatusCode =
      typeof error === "object" &&
      error !== null &&
      "statusCode" in error
        ? error.statusCode
        : undefined;
    const statusCode =
      typeof errorStatusCode === "number" &&
      errorStatusCode >= 400 &&
      errorStatusCode < 500
        ? errorStatusCode
        : 500;
    const errorType = error instanceof Error && loggedErrorTypes.has(error.name) ? error.name : "Error";
    const context = {
      event: "api_error",
      method: request.method,
      route: request.routeOptions.url ?? "unmatched",
      statusCode,
      errorType
    };
    if (statusCode >= 500) {
      request.log.error(context, "Error no controlado en la API.");
    } else {
      request.log.warn(context, "Solicitud rechazada por la API.");
    }
    return reply.status(statusCode).send({
      message:
        statusCode < 500
          ? "La solicitud no pudo ser procesada."
          : "Ocurrió un error interno."
    });
  });

  app.register(cors, {
    origin: corsOrigins,
    credentials: true,
    exposedHeaders: ["X-Request-ID"],
    methods: [
      "GET",
      "HEAD",
      "POST",
      "PUT",
      "PATCH",
      "DELETE",
      "OPTIONS"
    ]
  });

  app.register(fastifyCookie, {
    secret: env.JWT_SECRET,
    hook: "onRequest"
  });

  app.addHook("onResponse", async (request, reply) => {
    recordHttpRequest(request.log, {
      method: request.method,
      route: request.routeOptions.url ?? "unmatched",
      statusCode: reply.statusCode,
      durationMs: Math.round(reply.elapsedTime)
    });
  });

  app.addHook("onRequest", async (request, reply) => {
    reply.header("Cache-Control", "no-store");
    reply.header("Content-Security-Policy", "default-src 'none'; frame-ancestors 'none'; sandbox;");
    reply.header("Strict-Transport-Security", "max-age=31536000; includeSubDomains; preload");
    reply.header("X-Content-Type-Options", "nosniff");
    reply.header("Referrer-Policy", "no-referrer");
    reply.header("Permissions-Policy", "geolocation=(), camera=(), microphone=()");
    reply.header("X-Frame-Options", "DENY");
    reply.header("X-XSS-Protection", "0");
  });

  app.register(rateLimit, {
    global: false,
    keyGenerator: (request) => getClientIp(request),
    errorResponseBuilder: () => ({
      statusCode: 429,
      error: "Too Many Requests",
      message: "Demasiados intentos. Inténtalo nuevamente más tarde."
    })
  });

  app.register(registerAuthRoutes);
  app.register(registerCatalogRoutes);
  app.register(registerProfileRoutes);
  app.register(registerProfileDocumentRoutes);
  app.register(registerCompanyRoutes);
  app.register(registerClientRoutes);
  app.register(registerProjectRoutes);
  app.register(registerBudgetRoutes);
  app.register(registerCalculationRoutes);
  app.register(registerOperationRoutes);
  app.register(registerInvoiceRoutes);
  app.register(registerAdminRoutes);
  app.register(registerAdminMailRoutes);
  app.register(registerActivityRoutes);
  app.register(registerProjectTaskRoutes);
  app.register(registerProjectProgressRoutes);
  app.register(registerStorageRoutes);
  app.register(registerNotificationRoutes);
  app.register(registerAccountLegalRoutes);
  app.register(registerDashboardRoutes);
  app.register(registerSalesRoutes);
  app.register(registerClientPortalRoutes);
  app.register(registerClientConnectionRoutes);
  app.register(registerJobRequestRoutes);
  app.register(registerUserSettingsRoutes);

  app.get("/health", async () => {
    return {
      status: "ok",
      service: "contractor-api",
      environment: env.NODE_ENV
    };
  });

  app.get("/health/database", async (_request, reply) => {
    const start = performance.now();
    try {
      // NOW() evita una lectura cacheada por Hyperdrive.
      const result = await pool.query("SELECT NOW()");
      if (result.rowCount !== 1) {
        throw new Error("La comprobación de PostgreSQL no devolvió una fila.");
      }
      return { status: "ok" };
    } catch {
      recordInfrastructureFailure("postgresql", "health_check", "operation_failed", {
        durationMs: Math.round(performance.now() - start)
      });
      return reply.status(503).send({ status: "error" });
    }
  });

  return app;
}
