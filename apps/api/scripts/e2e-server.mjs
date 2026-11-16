import { browserAccount, turnstileToken } from "../../../tests/e2e/fixtures.mjs";
import { deriveTestDatabaseEnvironment } from "../src/db/test-database-env.ts";

const database = deriveTestDatabaseEnvironment(process.env.TEST_DATABASE_URL, process.env.NODE_ENV);
if (database.PGHOST !== "127.0.0.1" || process.env.PGUSER !== "contractor_api" || !process.env.PGPASSWORD) {
  throw new Error("La prueba web requiere PostgreSQL local de pruebas y el usuario contractor_api.");
}

Object.assign(process.env, {
  DATABASE_MODE: "postgres",
  PGHOST: database.PGHOST,
  PGPORT: database.PGPORT,
  PGDATABASE: database.PGDATABASE,
  PGSSL: "disable",
  CORS_ORIGINS: "http://127.0.0.1:8081",
  APP_WEB_ORIGINS: "http://127.0.0.1:8081",
  TURNSTILE_SECRET_KEY: "isolated-ci-turnstile",
  TURNSTILE_ALLOWED_HOSTNAMES: "127.0.0.1"
});

// Simula únicamente la respuesta del proveedor en este proceso de pruebas.
globalThis.fetch = async (input, init) => {
  if (input !== "https://challenges.cloudflare.com/turnstile/v0/siteverify") {
    throw new Error("La API de pruebas solo admite servicios locales.");
  }
  const body = new URLSearchParams(init?.body);
  return Response.json({
    success: body.get("response") === turnstileToken,
    hostname: "127.0.0.1",
    action: "login"
  });
};

const { buildApp } = await import("../src/app.ts");
const { hashPassword } = await import("../src/auth/services.ts");
const { adminPool } = await import("../src/db/test-db.ts");
const { email, password, fullName } = browserAccount();

try {
  const { rows: [user] } = await adminPool.query(
    `INSERT INTO app_auth.users (email, password_hash, email_confirmed_at, raw_user_meta_data)
     VALUES ($1, $2, now(), jsonb_build_object('role', 'client', 'full_name', $3::text))
     RETURNING id`,
    [email, await hashPassword(password), fullName]
  );
  await adminPool.query(
    `UPDATE public.profiles
     SET role = 'client', active = true, approved_at = now(), terms_accepted = true
     WHERE id = $1`,
    [user.id]
  );
} finally {
  await adminPool.end();
}

const app = await buildApp();
await app.listen({ host: "127.0.0.1", port: 3001 });
