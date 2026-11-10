import { redactSensitiveText, redactSensitiveValue } from "../security/redaction.js";

/**
 * Logger compatible con Fastify que funciona igual en Node y en Cloudflare
 * Workers: escribe una línea JSON por evento usando console.*, que Workers
 * captura en sus registros. Todo pasa por la redacción de secretos antes de
 * salir (tokens, contraseñas, cookies, URLs de base de datos).
 */

export const LOG_LEVELS = ["trace", "debug", "info", "warn", "error", "fatal", "silent"] as const;
export type LogLevel = (typeof LOG_LEVELS)[number];

const LEVEL_VALUE: Record<LogLevel, number> = {
  trace: 10,
  debug: 20,
  info: 30,
  warn: 40,
  error: 50,
  fatal: 60,
  silent: Number.POSITIVE_INFINITY
};

export type LogWriter = (level: Exclude<LogLevel, "silent">, line: string) => void;

const consoleWriter: LogWriter = (level, line) => {
  if (level === "error" || level === "fatal") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
};

type LogFn = (objOrMsg?: unknown, msg?: string, ...args: unknown[]) => void;

export type AppLogger = {
  level: string;
  trace: LogFn;
  debug: LogFn;
  info: LogFn;
  warn: LogFn;
  error: LogFn;
  fatal: LogFn;
  silent: LogFn;
  child: (bindings: Record<string, unknown>) => AppLogger;
};

function normalizeLevel(level: string | undefined): LogLevel {
  return (LOG_LEVELS as readonly string[]).includes(level ?? "") ? (level as LogLevel) : "info";
}

/** Fastify pasa `req`/`res` completos al crear loggers hijos; solo guardamos lo útil. */
function compactBindings(bindings: Record<string, unknown>): Record<string, unknown> {
  const { req, res, ...rest } = bindings as { req?: any; res?: any } & Record<string, unknown>;
  const compact: Record<string, unknown> = { ...rest };
  if (req && typeof req === "object") {
    compact.method = req.method;
    compact.url = typeof req.url === "string" ? req.url.split("?")[0] : undefined;
  }
  if (res && typeof res === "object" && typeof res.statusCode === "number") {
    compact.statusCode = res.statusCode;
  }
  return compact;
}

export function createAppLogger(options: {
  level?: string;
  bindings?: Record<string, unknown>;
  write?: LogWriter;
  now?: () => Date;
} = {}): AppLogger {
  const level = normalizeLevel(options.level);
  const threshold = LEVEL_VALUE[level];
  const write = options.write ?? consoleWriter;
  const now = options.now ?? (() => new Date());
  const bindings = options.bindings ?? {};

  const emit = (eventLevel: Exclude<LogLevel, "silent">): LogFn => (objOrMsg, msg) => {
    if (LEVEL_VALUE[eventLevel] < threshold) return;

    let payload: Record<string, unknown> = {};
    let message = msg;

    if (typeof objOrMsg === "string") {
      message = objOrMsg;
    } else if (objOrMsg instanceof Error) {
      payload = { error: objOrMsg };
    } else if (objOrMsg && typeof objOrMsg === "object") {
      payload = objOrMsg as Record<string, unknown>;
    }

    const entry = redactSensitiveValue({
      level: eventLevel,
      time: now().toISOString(),
      ...bindings,
      ...payload,
      msg: message ? redactSensitiveText(message) : undefined
    });

    try {
      write(eventLevel, JSON.stringify(entry));
    } catch {
      // Nunca dejar que un fallo al registrar tumbe una petición.
    }
  };

  return {
    level,
    trace: emit("trace"),
    debug: emit("debug"),
    info: emit("info"),
    warn: emit("warn"),
    error: emit("error"),
    fatal: emit("fatal"),
    silent: () => undefined,
    child: (childBindings) =>
      createAppLogger({
        level,
        write,
        now,
        bindings: { ...bindings, ...compactBindings(childBindings ?? {}) }
      })
  };
}

export function defaultLogLevel(nodeEnv: string, configured?: string): LogLevel {
  if (configured) return normalizeLevel(configured);
  return nodeEnv === "test" ? "silent" : "info";
}
