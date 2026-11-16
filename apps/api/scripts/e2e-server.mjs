import {
  browserAccount,
  browserAdmin,
  browserContractor,
  contractorCompanies,
  flowAccounts,
  flowCompanies,
  flowStaffRoles,
  turnstileToken
} from "../../../tests/e2e/fixtures.mjs";
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
  CORS_ORIGINS: "http://127.0.0.1:8081,http://127.0.0.1:3000",
  ADMIN_WEB_ORIGINS: "http://127.0.0.1:3000",
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
async function seedAccount({ email, password, fullName }, role, { contractorApproved = true } = {}) {
  const { rows: [user] } = await adminPool.query(
    `INSERT INTO app_auth.users (email, password_hash, email_confirmed_at, raw_user_meta_data)
     VALUES ($1, $2, now(), jsonb_build_object('role', 'client', 'full_name', $3::text))
     RETURNING id`,
    [email, await hashPassword(password), fullName]
  );
  await adminPool.query(
    `UPDATE public.profiles
     SET role = $2::public.global_user_role, active = true, approved_at = now(), terms_accepted = true,
         contractor_approved_at = CASE WHEN $2 = 'contractor' AND $3 THEN now() END
     WHERE id = $1`,
    [user.id, role, contractorApproved]
  );
  return user.id;
}

try {
  await seedAccount(browserAccount(), "client");
  await seedAccount(browserAdmin(), "super_admin");
  const contractorId = await seedAccount(browserContractor(), "contractor");
  const { rows: companies } = await adminPool.query(
    `INSERT INTO public.companies (name, created_by)
     SELECT name, $1 FROM unnest($2::text[]) AS name
     RETURNING id`,
    [contractorId, contractorCompanies]
  );
  await adminPool.query(
    `INSERT INTO public.company_members (company_id, user_id, role)
     SELECT id, $1, 'owner' FROM unnest($2::uuid[]) AS id`,
    [contractorId, companies.map(({ id }) => id)]
  );

  // Recorridos por rol: una empresa con todo su equipo, otra empresa que compite
  // por las peticiones, dos clientes, una persona por invitar y un superadministrador.
  const flow = flowAccounts();
  const ids = {};
  for (const key of ["owner", ...flowStaffRoles, "rival"]) {
    ids[key] = await seedAccount(flow[key], "contractor");
  }
  // Como quien se registra desde el enlace de una invitación: contratista sin aprobación propia.
  ids.invitee = await seedAccount(flow.invitee, "contractor", { contractorApproved: false });
  ids.client = await seedAccount(flow.client, "client");
  ids.client2 = await seedAccount(flow.client2, "client");
  ids.buyer = await seedAccount(flow.buyer, "client");
  ids.superAdmin = await seedAccount(flow.superAdmin, "super_admin");

  const seedCompany = async (name, ownerId) => {
    const { rows: [company] } = await adminPool.query(
      `INSERT INTO public.companies (name, created_by) VALUES ($1, $2) RETURNING id`,
      [name, ownerId]
    );
    await adminPool.query(
      `INSERT INTO public.company_members (company_id, user_id, role) VALUES ($1, $2, 'owner')`,
      [company.id, ownerId]
    );
    return company.id;
  };
  const mainCompanyId = await seedCompany(flowCompanies.main, ids.owner);
  await seedCompany(flowCompanies.rival, ids.rival);
  for (const role of flowStaffRoles) {
    await adminPool.query(
      `INSERT INTO public.company_members (company_id, user_id, role) VALUES ($1, $2, $3::public.company_role)`,
      [mainCompanyId, ids[role], role]
    );
  }
} finally {
  await adminPool.end();
}

const app = await buildApp();
await app.listen({ host: "127.0.0.1", port: 3001 });
