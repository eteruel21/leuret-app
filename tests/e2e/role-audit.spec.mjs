import { expect, request as playwrightRequest, test } from "@playwright/test";

import { flowAccounts, flowCompanies, flowStaffRoles } from "./fixtures.mjs";
import {
  adminUrl,
  apiAs,
  apiLogin,
  capture,
  enterCompany,
  settle,
  signInAdmin,
  signInApp,
  todayInPanama,
  watchPage,
  writeReport
} from "./helpers.mjs";

/**
 * Recorrido de auditoría: prepara datos reales por la API (como la app) y
 * visita cada pantalla con cada rol. Guarda captura y árbol de accesibilidad
 * y falla si una pantalla lanza un error de JavaScript o la API responde 4xx/5xx.
 */
test.describe.configure({ mode: "serial" });

const accounts = flowAccounts();
const data = {};

test.beforeAll(async () => {
  test.setTimeout(120_000);
  const context = await playwrightRequest.newContext();
  const owner = apiAs(context, await apiLogin(context, accounts.owner));
  const client = apiAs(context, await apiLogin(context, accounts.client));
  const client2 = apiAs(context, await apiLogin(context, accounts.client2));

  const { body: companies } = await owner.get("/companies");
  data.companyId = companies.memberships.find(({ company }) => company.name === flowCompanies.main).company_id;
  const companyId = data.companyId;

  const { body: createdClient } = await owner.post("/clients", {
    companyId,
    clientType: "person",
    firstName: "Carla",
    lastName: "Cliente QA",
    email: accounts.client.email,
    phone: "6000-0000"
  }, 201);
  data.clientId = createdClient.client.id;
  const { body: connections } = await client.get("/client-connections");
  const pending = connections.requests.find((item) => item.status === "pending");
  await client.patch(`/client-connections/${pending.id}`, { action: "accept" }, 200);

  const { body: projectA } = await owner.post("/projects", { companyId, clientId: data.clientId, name: "Remodelación de cocina QA" }, 201);
  data.projectId = projectA.project.id;
  const { body: budgetA } = await owner.post("/budgets/from-project", { companyId, projectId: data.projectId, title: "Cocina completa" }, 201);
  data.sentBudgetId = budgetA.budgetId;
  await owner.post(`/budgets/${data.sentBudgetId}/items`, { companyId, description: "Demolición de enchape", quantity: 12, unitPrice: 8.5, taxable: true }, 201);
  await owner.post(`/budgets/${data.sentBudgetId}/items`, { companyId, description: "Instalación de porcelanato", quantity: 12, unitPrice: 22, taxable: true }, 201);
  await owner.post(`/budgets/${data.sentBudgetId}/send`, { companyId }, 200);

  const { body: projectB } = await owner.post("/projects", { companyId, clientId: data.clientId, name: "Pintura exterior QA" }, 201);
  data.billedProjectId = projectB.project.id;
  const { body: budgetB } = await owner.post("/budgets/from-project", { companyId, projectId: data.billedProjectId, title: "Pintura de fachada" }, 201);
  data.approvedBudgetId = budgetB.budgetId;
  await owner.post(`/budgets/${data.approvedBudgetId}/items`, { companyId, description: "Pintura acrílica 2 manos", quantity: 80, unitPrice: 4.25, taxable: true }, 201);
  await owner.post(`/budgets/${data.approvedBudgetId}/send`, { companyId }, 200);
  await client.post(`/budgets/${data.approvedBudgetId}/approve`, {}, 200);
  const { body: invoice } = await owner.post("/invoices/from-budget", { companyId, budgetId: data.approvedBudgetId, clientId: data.clientId }, 201);
  data.invoiceId = invoice.invoice.id;
  await owner.post(`/invoices/${data.invoiceId}/payments`, { companyId, amount: 100, method: "cash" }, 201);

  // Factura generada por ventas: es la única que esa persona puede ver.
  const sales = apiAs(context, await apiLogin(context, accounts.sales));
  const { body: projectC } = await owner.post("/projects", { companyId, clientId: data.clientId, name: "Cerca perimetral QA" }, 201);
  const { body: budgetC } = await owner.post("/budgets/from-project", { companyId, projectId: projectC.project.id, title: "Cerca de bloque" }, 201);
  await owner.post(`/budgets/${budgetC.budgetId}/items`, { companyId, description: "Cerca de bloque 2 m", quantity: 20, unitPrice: 35, taxable: true }, 201);
  await sales.post(`/budgets/${budgetC.budgetId}/send`, { companyId }, 200);
  await client.post(`/budgets/${budgetC.budgetId}/approve`, {}, 200);
  const { body: salesInvoice } = await sales.post("/invoices/from-budget", { companyId, budgetId: budgetC.budgetId, clientId: data.clientId }, 201);
  data.salesInvoiceId = salesInvoice.invoice.id;

  const { body: task } = await owner.post(`/companies/${companyId}/projects/${data.projectId}/tasks`, {
    title: "Medir área de cocina",
    priority: "high",
    dueDate: todayInPanama(2)
  }, 201);
  data.taskId = task.task?.id ?? task.id;
  const { body: activity } = await owner.post(`/companies/${companyId}/activities`, {
    companyId,
    clientId: data.clientId,
    projectId: data.projectId,
    title: "Visita técnica QA",
    type: "visit",
    date: todayInPanama(1),
    startTime: "10:00"
  }, 201);
  data.activityId = activity.activity?.id ?? activity.id;

  const { body: jobRequest } = await client2.post("/job-requests", {
    title: "Reparar filtración en baño",
    description: "Hay una filtración debajo del lavamanos que moja el piso del baño principal.",
    category: "General",
    province: "Panamá",
    district: "San Miguelito",
    addressLine: "Calle 5, casa 12",
    timing: "this_week"
  }, 201);
  data.jobRequestId = jobRequest.requestId;
  await owner.post(`/job-requests/${data.jobRequestId}/conversations/${companyId}/messages`, {
    body: "¿Puede enviarnos una foto del lavamanos?"
  }, [200, 201]);

  writeReport("seed", data);
  await context.dispose();
});

const report = {};

async function visitAll(page, role, routes) {
  const issues = watchPage(page);
  for (const [name, path] of routes) {
    const before = issues.length;
    await page.goto(path);
    await settle(page);
    await capture(page, role, name);
    report[role] ??= {};
    report[role][name] = { path, finalUrl: new URL(page.url()).pathname, issues: issues.slice(before) };
  }
  writeReport("screens", report);
  // En CI el correo de Resend no está configurado: /admin/mail responde 503 a propósito.
  const expectedOutage = (issue) => issue.status === 503 && issue.path.startsWith("/admin/mail/");
  // Una pantalla que el rol puede abrir no debe pedir nada que la API le niegue
  // (403), ni fallar (5xx), ni lanzar errores de JavaScript.
  const unexpected = issues.filter((issue) =>
    issue.type === "pageerror" || (issue.type === "http" && issue.status >= 400 && !expectedOutage(issue))
  );
  expect.soft(unexpected, `${role}: errores en pantallas`).toEqual([]);
}

function companyRoutes(role) {
  return [
    ["inicio", "/"],
    ["agenda", "/agenda"],
    ["agenda-detalle", `/agenda/${data.activityId}`],
    ["calculos", "/calculos"],
    ["calc-concreto", "/calculos/concreto"],
    ["calc-electricidad", "/calculos/electricidad"],
    ["calc-sistemas-especiales", "/calculos/sistemas-especiales"],
    ["calc-pintura", "/calculos/pintura"],
    ["calc-acero", "/calculos/acero"],
    ["calc-techos", "/calculos/techos"],
    ["calc-plomeria", "/calculos/plomeria"],
    ["calc-impermeabilizacion", "/calculos/impermeabilizacion"],
    ["calc-excavacion", "/calculos/excavacion"],
    ["calc-encofrado", "/calculos/encofrado"],
    ["calc-estructura", "/calculos/estructura"],
    ["calc-cercas", "/calculos/cercas"],
    ["calc-puertas-ventanas", "/calculos/puertas-ventanas"],
    ["clientes", "/clientes"],
    ["cliente-detalle", `/clientes/${data.clientId}`],
    ["mas", "/mas"],
    ["obras", "/proyectos"],
    ["obra-detalle", `/proyectos/${data.projectId}`],
    ["presupuestos", "/presupuestos"],
    ["presupuesto-enviado", `/presupuestos/${data.sentBudgetId}`],
    ["presupuesto-aprobado", `/presupuestos/${data.approvedBudgetId}`],
    ["facturas", "/facturas"],
    ["factura-detalle", `/facturas/${role === "sales" ? data.salesInvoiceId : data.invoiceId}`],
    ["facturas-ajustes", "/facturas/settings"],
    ["catalogo", "/catalogo"],
    ["equipo", "/equipo"],
    ["equipo-historial", "/equipo/historial"],
    ["tareas", "/tareas"],
    ["peticiones", "/peticiones"],
    ["peticion-detalle", `/peticiones/${data.jobRequestId}`],
    ["notificaciones", "/notificaciones"],
    ["solicitudes", "/solicitudes"],
    ["perfil", "/perfil"],
    ["informe-ventas", "/ventas"]
  ];
}

for (const role of ["owner", ...flowStaffRoles]) {
  test(`pantallas de la empresa: ${role}`, async ({ page }) => {
    test.setTimeout(240_000);
    await page.setViewportSize({ width: 390, height: 844 });
    await signInApp(page, accounts[role]);
    await enterCompany(page, flowCompanies.main);
    await visitAll(page, role, companyRoutes(role));
  });
}

test("pantallas del cliente", async ({ page }) => {
  test.setTimeout(180_000);
  await page.setViewportSize({ width: 390, height: 844 });
  await signInApp(page, accounts.client);
  await visitAll(page, "client", [
    ["inicio", "/"],
    ["presupuestos", "/presupuestos"],
    ["presupuesto-enviado", `/cliente-presupuestos/${data.sentBudgetId}`],
    ["presupuesto-aprobado", `/cliente-presupuestos/${data.approvedBudgetId}`],
    ["obras", "/proyectos"],
    ["obra-detalle", `/cliente-proyectos/${data.projectId}`],
    ["obra-facturada", `/cliente-proyectos/${data.billedProjectId}`],
    ["facturas", "/facturas"],
    ["factura-detalle", `/cliente-facturas/${data.invoiceId}`],
    ["peticiones", "/peticiones"],
    ["peticion-nueva", "/cliente-peticiones/nueva"],
    ["contratista", `/contratistas/${data.companyId}`],
    ["notificaciones", "/notificaciones"],
    ["solicitudes", "/solicitudes"],
    ["cuenta", "/cuenta"],
    ["perfil", "/perfil"]
  ]);
});

test("pantallas del cliente que publicó una petición", async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 390, height: 844 });
  await signInApp(page, accounts.client2);
  await visitAll(page, "client2", [
    ["inicio", "/"],
    ["peticiones", "/peticiones"],
    ["peticion-detalle", `/cliente-peticiones/${data.jobRequestId}`],
    ["conversacion", `/cliente-peticiones/conversacion?requestId=${data.jobRequestId}&companyId=${data.companyId}`],
    ["notificaciones", "/notificaciones"]
  ]);
});

test("pantallas de la persona invitada sin empresa", async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 390, height: 844 });
  await signInApp(page, accounts.invitee);
  await visitAll(page, "invitee", [
    ["inicio", "/"],
    ["espacios", "/espacios"],
    ["empresa", "/empresa"],
    ["unirme", "/equipo/unirme"],
    ["notificaciones", "/notificaciones"]
  ]);
});

test("panel del superadministrador", async ({ page }) => {
  test.setTimeout(240_000);
  await signInAdmin(page, accounts.superAdmin);
  const tabs = ["dashboard", "users", "companies", "projects", "budgets", "invoices", "clients", "catalog", "calculations", "pricing", "audit", "system", "mail"];
  await visitAll(page, "superadmin", [
    ...tabs.map((tab) => [tab, `${adminUrl}/#/${tab}`]),
    ["obra-detalle", `${adminUrl}/#/projects?id=${data.projectId}`],
    ["factura-detalle", `${adminUrl}/#/invoices?id=${data.invoiceId}`],
    ["presupuesto-detalle", `${adminUrl}/#/budgets?id=${data.sentBudgetId}`]
  ]);
});
