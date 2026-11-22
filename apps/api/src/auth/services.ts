import bcrypt from "bcryptjs";
import type { FastifyRequest } from "fastify";
import { env } from "../config/env.js";
import { recordIntegrationFailure } from "../observability/events.js";

const TURNSTILE_VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";
const TURNSTILE_ALWAYS_PASS_TEST_SECRET = "1x0000000000000000000000000000000AA";
const TURNSTILE_DUMMY_TOKEN = "XXXX.DUMMY.TOKEN.XXXX";
const TURNSTILE_SERVICE_ERRORS = new Set(["internal-error", "missing-input-secret", "invalid-input-secret"]);

type TurnstileResponse = {
  success: boolean;
  hostname?: string;
  action?: string;
  "error-codes"?: string[];
};

function allowedTurnstileHostnames(): string[] {
  return (env.TURNSTILE_ALLOWED_HOSTNAMES ?? "")
    .split(",")
    .map((hostname) => hostname.trim().toLowerCase())
    .filter(Boolean);
}

export async function verifyCaptcha(token: string, ip: string, expectedAction: string): Promise<boolean> {
  const secret = env.TURNSTILE_SECRET_KEY;
  const allowedHostnames = allowedTurnstileHostnames();

  if (!secret || allowedHostnames.length === 0) {
    recordIntegrationFailure("turnstile", "verify_captcha", "not_configured");
    return false;
  }

  if (!token || token === "mock-captcha-token") {
    return false;
  }

  try {
    const body = new URLSearchParams();
    body.set("secret", secret);
    body.set("response", token);
    body.set("remoteip", ip);

    const response = await fetch(TURNSTILE_VERIFY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString()
    });

    if (!response.ok) {
      recordIntegrationFailure("turnstile", "verify_captcha", "http_error", { upstreamStatus: response.status });
      return false;
    }

    const data = (await response.json()) as TurnstileResponse;

    if (typeof data?.success !== "boolean") {
      recordIntegrationFailure("turnstile", "verify_captcha", "invalid_response");
      return false;
    }

    if (!data.success) {
      if (Array.isArray(data["error-codes"]) && data["error-codes"].some((code) => TURNSTILE_SERVICE_ERRORS.has(code))) {
        recordIntegrationFailure("turnstile", "verify_captcha", "provider_error");
      }
      return false;
    }

    if (
      env.NODE_ENV === "development" &&
      secret === TURNSTILE_ALWAYS_PASS_TEST_SECRET &&
      token === TURNSTILE_DUMMY_TOKEN
    ) {
      return true;
    }

    const hostname = data.hostname?.trim().toLowerCase();
    if (!hostname || !allowedHostnames.includes(hostname)) {
      return false;
    }

    if (data.action !== expectedAction) {
      return false;
    }

    return true;
  } catch (error) {
    const reason = error instanceof SyntaxError ? "invalid_response" : "request_failed";
    recordIntegrationFailure("turnstile", "verify_captcha", reason);
    return false;
  }
}

export function requestUserAgent(request: FastifyRequest): string | null {
  const userAgent = request.headers["user-agent"];
  return typeof userAgent === "string" ? userAgent : null;
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}

export async function comparePassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

let dummyPasswordHash: Promise<string> | undefined;

/**
 * Gasta el mismo tiempo que una comparación real cuando el correo no existe
 * (o la cuenta no tiene contraseña), para que el tiempo de respuesta del login
 * no revele qué correos tienen cuenta. Siempre devuelve false.
 */
export async function comparePasswordAgainstDummy(password: string): Promise<false> {
  dummyPasswordHash ??= bcrypt.hash(`dummy-${Math.random().toString(36)}`, 12);
  await bcrypt.compare(password, await dummyPasswordHash);
  return false;
}
