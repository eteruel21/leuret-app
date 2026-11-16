import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { buildApp } from "../app.js";

const companyId = "00000000-0000-4000-8000-000000000001";
const protectedRoutes = [
  "/companies",
  `/clients?companyId=${companyId}`,
  `/projects?companyId=${companyId}`,
  `/budgets?companyId=${companyId}`,
  `/invoices?companyId=${companyId}`,
  "/client-connections"
];

describe("regresión de seguridad de rutas críticas de la API", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildApp();
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it.each(protectedRoutes)("rechaza acceso anónimo a GET %s", async (url) => {
    const response = await app.inject({ method: "GET", url });
    expect(response.statusCode, response.body).toBe(401);
    expect(response.headers["cache-control"]).toBe("no-store");
    expect(response.body).not.toContain("postgresql://");
  });

  it("no acepta un token falsificado para acceder a empresas", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/companies",
      headers: { authorization: "Bearer forged.invalid.signature" }
    });
    expect(response.statusCode, response.body).toBe(401);
    expect(response.body).not.toContain("postgresql://");
  });
});
