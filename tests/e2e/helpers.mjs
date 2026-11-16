import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

import { expect } from "@playwright/test";

import { mockBrowserTurnstile, turnstileToken } from "./fixtures.mjs";

export const apiUrl = "http://127.0.0.1:3001";
export const adminUrl = "http://127.0.0.1:3000";
export const auditDir = join(process.cwd(), "e2e-audit");

/** Inicia sesión directamente en la API (para preparar datos como lo haría la app). */
export async function apiLogin(request, { email, password }) {
  const response = await request.post(`${apiUrl}/auth/login`, {
    data: { email, password, captchaToken: turnstileToken, clientType: "native" }
  });
  expect(response.status(), `login ${email}: ${await response.text()}`).toBe(200);
  const { accessToken } = await response.json();
  return accessToken;
}

/** Cliente HTTP con la sesión de una cuenta. `expected` puede ser un número o una lista. */
export function apiAs(request, token) {
  const call = async (method, path, data, expected) => {
    const response = await request.fetch(`${apiUrl}${path}`, {
      method,
      headers: { authorization: `Bearer ${token}` },
      ...(data === undefined ? {} : { data })
    });
    const text = await response.text();
    if (expected !== undefined) {
      const allowed = Array.isArray(expected) ? expected : [expected];
      expect(allowed, `${method} ${path} → ${response.status()}: ${text}`).toContain(response.status());
    }
    let body = null;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      body = text;
    }
    return { status: response.status(), body };
  };
  return {
    token,
    get: (path, expected = 200) => call("GET", path, undefined, expected),
    post: (path, data = {}, expected) => call("POST", path, data, expected),
    patch: (path, data = {}, expected) => call("PATCH", path, data, expected),
    put: (path, data = {}, expected) => call("PUT", path, data, expected),
    delete: (path, expected) => call("DELETE", path, undefined, expected)
  };
}

/**
 * Registra todo lo que sale mal en una página: errores de JavaScript, errores
 * de consola y respuestas de la API con 4xx/5xx.
 */
export function watchPage(page) {
  const issues = [];
  page.on("pageerror", (error) => issues.push({ type: "pageerror", message: error.message, url: page.url() }));
  page.on("console", (message) => {
    if (message.type() !== "error") return;
    const text = message.text();
    // Las respuestas fallidas ya se registran abajo con su ruta.
    if (/Failed to load resource/.test(text)) return;
    issues.push({ type: "console", message: text.slice(0, 500), url: page.url() });
  });
  page.on("response", (response) => {
    const url = new URL(response.url());
    if (url.origin !== apiUrl || response.status() < 400) return;
    issues.push({
      type: "http",
      status: response.status(),
      method: response.request().method(),
      path: url.pathname,
      screen: new URL(page.url()).pathname
    });
  });
  return issues;
}

export async function signInApp(page, { email, password }) {
  await mockBrowserTurnstile(page);
  await page.goto("/login");
  await page.getByPlaceholder("correo@empresa.com").fill(email);
  await page.getByPlaceholder("Tu contraseña").fill(password);
  const [loginResponse] = await Promise.all([
    page.waitForResponse((response) =>
      response.request().method() === "POST" && new URL(response.url()).pathname === "/auth/login"
    ),
    page.getByRole("button", { name: "Iniciar sesión", exact: true }).click()
  ]);
  expect(loginResponse.status()).toBe(200);
  await expect(page.getByPlaceholder("Tu contraseña")).toHaveCount(0);
}

/** Entra al espacio de una empresa desde /espacios (o confirma que ya está activo). */
export async function enterCompany(page, companyName) {
  await page.goto("/espacios");
  const enter = page.getByRole("button", { name: new RegExp(`^(Entrar a|Continuar en) ${escapeRegExp(companyName)}$`) });
  await enter.click();
  await expect(page.getByRole("button", { name: new RegExp(`Espacio activo: ${escapeRegExp(companyName)}`) })).toBeVisible();
}

export async function signInAdmin(page, { email, password }) {
  await mockBrowserTurnstile(page);
  await page.goto(`${adminUrl}/#/dashboard`);
  await page.getByLabel("Correo electrónico").fill(email);
  await page.getByLabel("Contraseña").fill(password);
  await page.getByRole("button", { name: "Iniciar sesión", exact: true }).click();
  await expect(page.getByLabel("Contraseña")).toHaveCount(0);
}

/** Espera a que la pantalla termine de cargar (sin indicadores ni peticiones pendientes). */
export async function settle(page) {
  await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => {});
  await page.waitForTimeout(400);
}

/** Guarda captura y árbol de accesibilidad de la pantalla para revisarla después. */
export async function capture(page, role, name) {
  const base = join(auditDir, role, name.replace(/[^a-z0-9-]+/gi, "_"));
  mkdirSync(dirname(base), { recursive: true });
  await page.screenshot({ path: `${base}.png`, fullPage: true }).catch(() => {});
  const aria = await page.locator("body").ariaSnapshot({ timeout: 5_000 }).catch((error) => `(sin árbol: ${error.message})`);
  writeFileSync(`${base}.aria.yml`, aria);
  return aria;
}

export function writeReport(name, data) {
  mkdirSync(auditDir, { recursive: true });
  writeFileSync(join(auditDir, `${name}.json`), JSON.stringify(data, null, 2));
}

export function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function todayInPanama(offsetDays = 0) {
  const date = new Date(Date.now() + offsetDays * 86_400_000 - 5 * 3_600_000);
  return date.toISOString().slice(0, 10);
}
