import { registerAdminRoutes } from "./admin/routes.js";
import { registerInvoiceRoutes } from "./invoices/routes.js";
import { registerOperationRoutes } from "./operations/routes.js";
import { registerBudgetRoutes } from "./budgets/routes.js";
import { registerCalculationRoutes } from "./calculations/routes.js";
import { registerProjectRoutes } from "./projects/routes.js";
import { registerClientRoutes } from "./clients/routes.js";
import { registerCompanyRoutes } from "./companies/routes.js";
import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";
import Fastify, { type FastifyBaseLogger } from "fastify";
import fastifyCookie from "@fastify/cookie";

import { registerAuthRoutes } from "./auth/routes.js";
import { corsOrigins, env } from "./config/env.js";
import { registerCatalogRoutes } from "./catalog/routes.js";
import { pool } from "./db/pool.js";
import { registerProfileRoutes } from "./profile/routes.js";
import { registerProfileDocumentRoutes } from "./profile/document-routes.js";
import { registerActivityRoutes } from "./activities/routes.js";
import { registerDashboardRoutes } from "./dashboard/routes.js";
import { registerProjectTaskRoutes } from "./projects/tasks/routes.js";
import { registerProjectProgressRoutes } from "./projects/progress/routes.js";
import { registerStorageRoutes } from "./storage/routes.js";
import { registerNotificationRoutes } from "./notifications/routes.js";
import { registerAccountLegalRoutes } from "./account/routes.js";
import { registerClientPortalRoutes } from "./client-portal/routes.js";
import { safeErrorDetails } from "./security/redaction.js";
import { createAppLogger, defaultLogLevel } from "./observability/logger.js";
import { getClientIp } from "./security/client-ip.js";

export async function buildApp() {
  // No usamos `loggerInstance`: en Cloudflare Workers Fastify intenta leer
  // `pino.symbols`, que no existe en el paquete del Worker, y la API no
  // arranca (error 1101). Fastify queda con logger: false y cada petición
  // recibe nuestro logger propio en el primer hook.
  const appLogger = createAppLogger({
    level: defaultLogLevel(env.NODE_ENV, env.LOG_LEVEL)
  });

  const app = Fastify({
    logger: false,
    genReqId: (request) => {
      const ray = request.headers["cf-ray"];
      return typeof ray === "string" && ray ? ray : crypto.randomUUID();
    }
  });

  app.addHook("onRequest", async (request) => {
    request.log = appLogger.child({ reqId: request.id }) as unknown as FastifyBaseLogger;
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
    const context = {
      ...safeErrorDetails(error),
      method: request.method,
      route: request.routeOptions?.url ?? request.url.split("?")[0],
      statusCode,
      userId: request.authenticatedUser?.id ?? null
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

  // Peticiones lentas: ayudan a detectar consultas pesadas en producción.
  app.addHook("onResponse", async (request, reply) => {
    if (reply.elapsedTime > 3000) {
      request.log.warn(
        {
          method: request.method,
          route: request.routeOptions?.url ?? request.url.split("?")[0],
          statusCode: reply.statusCode,
          durationMs: Math.round(reply.elapsedTime)
        },
        "Petición lenta."
      );
    }
  });

  app.addHook("onRequest", async (request, reply) => {
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
  app.register(registerActivityRoutes);
  app.register(registerProjectTaskRoutes);
  app.register(registerProjectProgressRoutes);
  app.register(registerStorageRoutes);
  app.register(registerNotificationRoutes);
  app.register(registerAccountLegalRoutes);
  app.register(registerDashboardRoutes);
  app.register(registerClientPortalRoutes);

  app.get("/health", async () => {
    return {
      status: "ok",
      service: "contractor-api",
      environment: env.NODE_ENV
    };
  });

  app.get("/health/database", async (_request, reply) => {
    try {
      const result = await pool.query<{
        database_name: string;
        database_user: string;
        server_time: Date;
      }>(`
        SELECT
          current_database() AS database_name,
          current_user AS database_user,
          now() AS server_time
      `);

      const row = result.rows[0];
      if (!row) {
        throw new Error("No se pudo obtener información de la base de datos.");
      }

      return {
        status: "ok",
        database: row
      };
    } catch (error) {
      app.log.error(safeErrorDetails(error), "Falló la comprobación de PostgreSQL.");
      return reply.status(503).send({
        status: "error",
        message: "No se pudo conectar con PostgreSQL."
      });
    }
  });

  return app;
}
