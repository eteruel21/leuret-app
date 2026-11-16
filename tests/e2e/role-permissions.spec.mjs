import { expect, request as playwrightRequest, test } from "@playwright/test";

import { flowAccounts, flowCompanies, flowStaffRoles } from "./fixtures.mjs";
import { apiAs, apiLogin, writeReport } from "./helpers.mjs";

/**
 * Matriz de permisos por rol contra la API real (mismo servidor que usa la
 * app web). Cada fila dice qué roles deben poder hacer la acción; el resto
 * debe recibir 403. Debe coincidir con apps/mobile/src/permissions/permissions.ts.
 */
const ROLES = ["owner", ...flowStaffRoles];
const ALL = ROLES;
const MANAGERS = ["owner", "admin"];
const missing = "00000000-0000-4000-8000-000000000000";

test("cada rol del equipo recibe exactamente los permisos de la app", async () => {
  test.setTimeout(120_000);
  const accounts = flowAccounts();
  const context = await playwrightRequest.newContext();
  const as = {};
  for (const role of ROLES) as[role] = apiAs(context, await apiLogin(context, accounts[role]));

  const { body } = await as.owner.get("/companies");
  const companyId = body.memberships.find(({ company }) => company.name === flowCompanies.main).company_id;
  const { body: clientBody } = await as.owner.post("/clients", { companyId, clientType: "person", firstName: "Permisos", lastName: "QA" }, 201);
  const clientId = clientBody.client.id;
  const { body: projectBody } = await as.owner.post("/projects", { companyId, clientId, name: "Obra para permisos QA" }, 201);
  const projectId = projectBody.project.id;
  const { body: budgetBody } = await as.owner.post("/budgets/from-project", { companyId, projectId, title: "Presupuesto para permisos" }, 201);
  const budgetId = budgetBody.budgetId;
  const q = `companyId=${companyId}`;

  // [capacidad, roles con acceso, método, ruta, cuerpo]
  const matrix = [
    ["budgets.view (lista)", ["owner", "admin", "estimator", "sales"], "GET", `/budgets?${q}`],
    ["budgets.view (detalle)", ["owner", "admin", "estimator", "sales"], "GET", `/budgets/${budgetId}?${q}`],
    ["budgets.edit (partida)", ["owner", "admin", "estimator"], "POST", `/budgets/${budgetId}/items`, { companyId, description: "x" }],
    ["budgets.edit (crear)", ["owner", "admin", "estimator"], "POST", "/budgets/from-project", { companyId, projectId: missing }],
    ["jobRequests.view", ["owner", "admin", "estimator", "sales"], "GET", `/companies/${companyId}/job-requests`],
    ["projects.list", ALL, "GET", `/projects?${q}`],
    ["projects.view", ALL, "GET", `/projects/${projectId}?${q}`],
    ["projects.create", ["owner", "admin", "supervisor", "sales"], "POST", "/projects", { companyId, clientId }],
    ["projects.progress.edit", MANAGERS, "PATCH", `/projects/${projectId}/progress`, { companyId, progress: 500 }],
    ["tasks.mine", ALL, "GET", `/companies/${companyId}/tasks/mine`],
    ["invoices.view", ALL, "GET", `/invoices?${q}`],
    ["invoices.create", ["owner", "admin", "sales"], "POST", "/invoices/from-budget", { companyId, budgetId: missing, clientId }],
    ["invoices (solicitudes)", ["owner", "admin", "sales"], "GET", `/companies/${companyId}/invoice-requests`],
    ["invoices (por presupuesto)", ["owner", "admin", "sales"], "GET", `/invoices/by-budget?${q}&budgetId=${budgetId}`],
    ["clients.view", ALL, "GET", `/clients?${q}`],
    ["clients.edit", ["owner", "admin", "sales"], "POST", "/clients", { companyId, clientType: "person" }],
    ["clients.delete", MANAGERS, "PATCH", `/clients/${missing}/deactivate`, { companyId }],
    ["catalog.view", ALL, "GET", `/catalog/items?${q}`],
    ["agenda.use", ALL, "GET", `/companies/${companyId}/activities`],
    ["team.view", ALL, "GET", `/companies/${companyId}/members`],
    ["company.manage (invitar)", MANAGERS, "POST", `/companies/${companyId}/invitations`, { email: "no-es-correo", role: "member" }]
  ];

  const results = [];
  for (const [capability, allowed, method, path, data] of matrix) {
    for (const role of ROLES) {
      const response = await context.fetch(`http://127.0.0.1:3001${path}`, {
        method,
        headers: { authorization: `Bearer ${as[role].token}` },
        ...(data === undefined ? {} : { data })
      });
      const status = response.status();
      const expectedAccess = allowed.includes(role);
      const ok = expectedAccess ? status !== 403 && status < 500 : status === 403;
      results.push({ capability, role, method, path: path.replace(/\?.*/, ""), status, expected: expectedAccess ? "acceso" : "403", ok });
    }
  }
  writeReport("permissions", results);
  await context.dispose();
  expect(results.filter((row) => !row.ok)).toEqual([]);
});
