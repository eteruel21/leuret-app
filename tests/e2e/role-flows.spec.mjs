import { expect, request as playwrightRequest, test } from "@playwright/test";

import { flowAccounts, flowCompanies } from "./fixtures.mjs";
import {
  adminUrl,
  apiAs,
  apiLogin,
  capture,
  enterCompany,
  escapeRegExp,
  settle,
  signInAdmin,
  signInApp,
  watchPage
} from "./helpers.mjs";

/**
 * Flujos reales de punta a punta, en el navegador y con cuentas controladas:
 * cliente, empresa (propietaria y equipo), otra empresa que compite y
 * superadministrador. Cada paso se hace en la pantalla que usaría la persona.
 */
test.describe.configure({ mode: "serial" });

const accounts = flowAccounts();
const state = {};
let api;

test.beforeAll(async () => {
  test.setTimeout(60_000);
  api = await playwrightRequest.newContext();
  state.owner = apiAs(api, await apiLogin(api, accounts.owner));
  const { body } = await state.owner.get("/companies");
  state.companyId = body.memberships.find(({ company }) => company.name === flowCompanies.main).company_id;
});

test.afterAll(async () => {
  await api?.dispose();
});

/** Acepta los diálogos del navegador (confirmaciones de la app web) y los anota. */
function acceptDialogs(page) {
  const messages = [];
  page.on("dialog", async (dialog) => {
    messages.push(`${dialog.type()}: ${dialog.message()}`);
    await dialog.accept();
  });
  return messages;
}

function expectNoServerErrors(issues) {
  const fatal = issues.filter((issue) => issue.type === "pageerror" || (issue.type === "http" && issue.status >= 500));
  expect(fatal, "errores de JavaScript o 5xx").toEqual([]);
}

test("cliente y empresa: vinculación, presupuesto, aprobación, factura solicitada y abono", async ({ browser }) => {
  test.setTimeout(240_000);
  const companyId = state.companyId;
  const owner = state.owner;

  // 1. La empresa registra al cliente con su correo: se envía la solicitud de vinculación.
  const { body: created } = await owner.post("/clients", {
    companyId,
    clientType: "person",
    firstName: "Beatriz",
    lastName: "Compradora QA",
    email: accounts.buyer.email
  }, 201);
  state.buyerClientId = created.client.id;
  expect(created.connection).toBe("sent");

  const buyerContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const buyerPage = await buyerContext.newPage();
  const buyerIssues = watchPage(buyerPage);
  const buyerDialogs = acceptDialogs(buyerPage);
  await signInApp(buyerPage, accounts.buyer);

  await test.step("el cliente acepta la vinculación", async () => {
    await buyerPage.goto("/solicitudes");
    await buyerPage.getByRole("button", { name: "Aceptar", exact: true }).first().click();
    await expect(buyerPage.getByText(flowCompanies.main).first()).toBeVisible();
    await expect(buyerPage.getByRole("button", { name: "Aceptar", exact: true })).toHaveCount(0);
  });

  // 2. La empresa crea la obra y el presupuesto, agrega una partida y lo envía desde la app.
  const { body: project } = await owner.post("/projects", { companyId, clientId: state.buyerClientId, name: "Baño principal QA" }, 201);
  state.buyerProjectId = project.project.id;
  const { body: budget } = await owner.post("/budgets/from-project", { companyId, projectId: state.buyerProjectId, title: "Remodelación de baño" }, 201);
  state.buyerBudgetId = budget.budgetId;

  const ownerContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const ownerPage = await ownerContext.newPage();
  const ownerIssues = watchPage(ownerPage);
  const ownerDialogs = acceptDialogs(ownerPage);
  await signInApp(ownerPage, accounts.owner);
  await enterCompany(ownerPage, flowCompanies.main);

  await test.step("la empresa agrega una partida manual y envía el presupuesto", async () => {
    await ownerPage.goto(`/presupuestos/${state.buyerBudgetId}`);
    await ownerPage.getByText("Manual", { exact: true }).click();
    await ownerPage.getByPlaceholder("Ej. Instalación de cielo raso PVC").fill("Cambio de inodoro y lavamanos");
    await ownerPage.getByPlaceholder("m², punto, unidad...").fill("global");
    await ownerPage.getByPlaceholder("1", { exact: true }).first().fill("1");
    await ownerPage.getByPlaceholder("0.00").first().fill("450");
    await ownerPage.getByText("Guardar", { exact: true }).click();
    await expect(ownerPage.getByText("Cambio de inodoro y lavamanos")).toBeVisible();
    // La partida manual queda en la sección del presupuesto, no en «Sin sección».
    await expect(ownerPage.getByText("Sin sección", { exact: true })).toHaveCount(0);

    await ownerPage.getByRole("button", { name: "Enviar al cliente" }).click();
    await ownerPage.getByRole("button", { name: "Enviar", exact: true }).click();
    await expect(ownerPage.getByText("Enviado", { exact: true }).first()).toBeVisible();
    await capture(ownerPage, "flujos", "empresa-presupuesto-enviado");
  });

  const { body: sent } = await owner.get(`/budgets/${state.buyerBudgetId}?companyId=${companyId}`);
  const sentBudget = sent.budget ?? sent;
  state.buyerBudgetNumber = sentBudget.budget_number;
  state.buyerBudgetTotal = Number(sentBudget.total);
  expect(state.buyerBudgetTotal).toBeCloseTo(481.5, 2);

  await test.step("el cliente ve el presupuesto y lo aprueba", async () => {
    await buyerPage.goto("/presupuestos");
    await buyerPage.getByText("Remodelación de baño").first().click();
    await expect(buyerPage).toHaveURL(new RegExp(`/cliente-presupuestos/${state.buyerBudgetId}`));
    await expect(buyerPage.getByText("Cambio de inodoro y lavamanos")).toBeVisible();
    await buyerPage.getByRole("button", { name: "Aprobar", exact: true }).click();
    await expect(buyerPage.getByText(/Aprobado/).first()).toBeVisible();
    await capture(buyerPage, "flujos", "cliente-presupuesto-aprobado");
  });

  await test.step("la obra queda aprobada con su valor contratado", async () => {
    const { body } = await owner.get(`/projects/${state.buyerProjectId}?companyId=${companyId}`);
    const detail = body.project ?? body;
    expect(detail.status).toBe("approved");
    expect(Number(detail.contract_value)).toBeCloseTo(state.buyerBudgetTotal, 2);
  });

  await test.step("la empresa marca la obra como completada", async () => {
    await ownerPage.goto(`/proyectos/${state.buyerProjectId}`);
    await ownerPage.getByText("Completado", { exact: true }).click();
    await expect.poll(async () => (await owner.get(`/projects/${state.buyerProjectId}?companyId=${companyId}`)).body.project?.status)
      .toBe("completed");
  });

  await test.step("el cliente solicita la factura desde su obra", async () => {
    await buyerPage.goto(`/cliente-proyectos/${state.buyerProjectId}`);
    await buyerPage.getByRole("button", { name: "Solicitar factura" }).click();
    await expect(buyerPage.getByText(/recibió tu solicitud/)).toBeVisible();
    await capture(buyerPage, "flujos", "cliente-factura-solicitada");
  });

  await test.step("la empresa genera la factura desde la solicitud y registra un abono", async () => {
    await ownerPage.goto("/facturas");
    await ownerPage.getByRole("button", { name: `Generar factura de ${state.buyerBudgetNumber}` }).click();
    await expect(ownerPage).toHaveURL(/\/facturas\/[0-9a-f-]{36}/);
    state.buyerInvoiceId = ownerPage.url().match(/facturas\/([0-9a-f-]{36})/)[1];
    await expect(ownerPage.getByText("Saldo pendiente")).toBeVisible();

    await ownerPage.getByText("Registrar abono", { exact: true }).click();
    await ownerPage.getByPlaceholder("0.00").fill("200");
    await ownerPage.getByPlaceholder("Transferencia, cheque o comprobante").fill("ACH 12345");
    await ownerPage.getByText("Confirmar y generar recibo", { exact: true }).click();
    await expect(ownerPage.getByText("Parcialmente pagada").first()).toBeVisible();
    await capture(ownerPage, "flujos", "empresa-factura-con-abono");
  });

  await test.step("el cliente ve la factura con el abono y el saldo", async () => {
    await buyerPage.goto(`/cliente-facturas/${state.buyerInvoiceId}`);
    await expect(buyerPage.getByText(/281\.50/).first()).toBeVisible();
    await capture(buyerPage, "flujos", "cliente-factura-saldo");
  });

  expectNoServerErrors([...buyerIssues, ...ownerIssues]);
  test.info().annotations.push({ type: "diálogos", description: [...buyerDialogs, ...ownerDialogs].join(" | ") });
  await buyerContext.close();
  await ownerContext.close();
});

test("petición de trabajo: publicar, conversar, cotizar y adjudicar", async ({ browser }) => {
  test.setTimeout(240_000);
  const title = "Instalar 4 lámparas LED en la sala";

  const clientContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const clientPage = await clientContext.newPage();
  const clientIssues = watchPage(clientPage);
  acceptDialogs(clientPage);
  await signInApp(clientPage, accounts.client2);

  await test.step("el cliente publica la petición", async () => {
    await clientPage.goto("/cliente-peticiones/nueva");
    await clientPage.getByLabel("Título de la petición").fill(title);
    await clientPage.getByRole("radio", { name: "Electricidad", exact: true }).click();
    await clientPage.getByLabel("Descripción del trabajo").fill("Son 4 lámparas LED de techo; ya hay salida eléctrica en cada punto de la sala.");
    await clientPage.getByRole("radio", { name: "Panamá", exact: true }).click();
    await clientPage.getByPlaceholder("Ej. San Miguelito").fill("Panamá");
    await clientPage.getByPlaceholder("Calle, casa o edificio y apartamento").fill("PH Vista Mar, apto 8B");
    await clientPage.getByRole("radio", { name: "Este mes", exact: true }).click();
    await clientPage.getByRole("button", { name: "Publicar petición" }).click();
    await expect(clientPage).toHaveURL(/\/cliente-peticiones\/[0-9a-f-]{36}/);
    state.jobRequestId = clientPage.url().match(/cliente-peticiones\/([0-9a-f-]{36})/)[1];
    await expect(clientPage.getByText(title)).toBeVisible();
  });

  const rivalContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const rivalPage = await rivalContext.newPage();
  const rivalIssues = watchPage(rivalPage);
  acceptDialogs(rivalPage);
  await signInApp(rivalPage, accounts.rival);
  await enterCompany(rivalPage, flowCompanies.rival);

  await test.step("otra empresa la encuentra y pregunta", async () => {
    await rivalPage.goto("/peticiones");
    await rivalPage.getByText(title).first().click();
    await expect(rivalPage).toHaveURL(new RegExp(`/peticiones/${state.jobRequestId}`));
    // Antes del presupuesto, la dirección exacta es privada.
    await expect(rivalPage.getByText("PH Vista Mar, apto 8B")).toHaveCount(0);
    await rivalPage.getByRole("button", { name: "Preguntar al cliente" }).click();
    await rivalPage.getByPlaceholder("Escribe un mensaje…").fill("¿Las lámparas ya están compradas?");
    await rivalPage.getByRole("button", { name: "Enviar mensaje" }).click();
    await expect(rivalPage.getByText("¿Las lámparas ya están compradas?")).toBeVisible();
  });

  await test.step("el cliente ve el mensaje en Notificaciones y responde", async () => {
    await clientPage.goto("/notificaciones");
    await clientPage.getByText(flowCompanies.rival).first().click();
    await expect(clientPage.getByText("¿Las lámparas ya están compradas?")).toBeVisible();
    await clientPage.getByPlaceholder("Escribe un mensaje…").fill("Sí, ya las tengo en casa.");
    await clientPage.getByRole("button", { name: "Enviar mensaje" }).click();
    await expect(clientPage.getByText("Sí, ya las tengo en casa.")).toBeVisible();
  });

  await test.step("la empresa prepara el presupuesto y lo envía", async () => {
    await rivalPage.goto(`/peticiones/${state.jobRequestId}`);
    await rivalPage.getByRole("button", { name: "Preparar presupuesto" }).click();
    await expect(rivalPage).toHaveURL(/\/presupuestos\/[0-9a-f-]{36}/);
    state.jobBudgetId = rivalPage.url().match(/presupuestos\/([0-9a-f-]{36})/)[1];
    await rivalPage.getByText("Manual", { exact: true }).click();
    await rivalPage.getByPlaceholder("Ej. Instalación de cielo raso PVC").fill("Instalación de lámpara LED");
    await rivalPage.getByPlaceholder("m², punto, unidad...").fill("punto");
    await rivalPage.getByPlaceholder("1", { exact: true }).first().fill("4");
    await rivalPage.getByPlaceholder("0.00").first().fill("18");
    await rivalPage.getByText("Guardar", { exact: true }).click();
    await expect(rivalPage.getByText("Instalación de lámpara LED")).toBeVisible();
    await rivalPage.getByRole("button", { name: "Enviar al cliente" }).click();
    await rivalPage.getByRole("button", { name: "Enviar", exact: true }).click();
    await expect(rivalPage.getByText("Enviado", { exact: true }).first()).toBeVisible();
  });

  await test.step("la empresa ya ve la dirección exacta", async () => {
    await rivalPage.goto(`/peticiones/${state.jobRequestId}`);
    await expect(rivalPage.getByText(/PH Vista Mar, apto 8B/)).toBeVisible();
  });

  await test.step("el cliente aprueba el presupuesto y la petición queda adjudicada", async () => {
    await clientPage.goto(`/cliente-presupuestos/${state.jobBudgetId}`);
    await expect(clientPage.getByText("Instalación de lámpara LED")).toBeVisible();
    await clientPage.getByRole("button", { name: "Aprobar", exact: true }).click();
    await expect(clientPage.getByText(/Aprobado/).first()).toBeVisible();
    await clientPage.goto(`/cliente-peticiones/${state.jobRequestId}`);
    await expect(clientPage.getByText(/Adjudicada/).first()).toBeVisible();
    await capture(clientPage, "flujos", "cliente-peticion-adjudicada");
  });

  expectNoServerErrors([...clientIssues, ...rivalIssues]);
  await clientContext.close();
  await rivalContext.close();
});

test("equipo: invitar, unirse con el código, cambiar el rol y salir", async ({ browser }) => {
  test.setTimeout(180_000);

  const ownerContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const ownerPage = await ownerContext.newPage();
  const ownerIssues = watchPage(ownerPage);
  acceptDialogs(ownerPage);
  await signInApp(ownerPage, accounts.owner);
  await enterCompany(ownerPage, flowCompanies.main);

  let code;
  await test.step("la propietaria invita a una persona como presupuestista", async () => {
    await ownerPage.goto("/equipo");
    await ownerPage.getByRole("button", { name: "Invitar" }).click();
    await ownerPage.getByLabel("Correo de la persona").fill(accounts.invitee.email);
    await ownerPage.getByRole("radio", { name: /Presupuestista/ }).click();
    await ownerPage.getByRole("button", { name: "Enviar solicitud" }).click();
    await expect(ownerPage.getByText("Invitación lista")).toBeVisible();
    code = (await ownerPage.locator("text=/^[A-Za-z0-9_-]{16,}$/").first().textContent())?.trim();
    expect(code).toBeTruthy();
  });

  const inviteeContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const inviteePage = await inviteeContext.newPage();
  const inviteeIssues = watchPage(inviteePage);
  acceptDialogs(inviteePage);
  await signInApp(inviteePage, accounts.invitee);

  await test.step("la persona invitada se une con el código", async () => {
    await inviteePage.goto(`/invitacion?codigo=${encodeURIComponent(code)}`);
    await expect(inviteePage.getByText(flowCompanies.main).first()).toBeVisible();
    await inviteePage.getByRole("button", { name: "Unirme al equipo" }).click();
    await expect(inviteePage.getByRole("button", { name: new RegExp(`Espacio activo: ${escapeRegExp(flowCompanies.main)}`) })).toBeVisible();
    await inviteePage.goto("/presupuestos");
    await expect(inviteePage).toHaveURL(/\/presupuestos$/);
  });

  await test.step("la propietaria le cambia el rol a supervisor", async () => {
    await ownerPage.goto("/equipo");
    await ownerPage.getByRole("button", { name: new RegExp(accounts.invitee.fullName) }).click();
    await ownerPage.getByText("Supervisor", { exact: true }).click();
    await expect(ownerPage.getByRole("button", { name: new RegExp(`${accounts.invitee.fullName}.*Supervisor`) })).toBeVisible();
  });

  await test.step("con el rol nuevo ya no puede abrir presupuestos y luego sale de la empresa", async () => {
    await inviteePage.goto("/presupuestos");
    await expect(inviteePage).not.toHaveURL(/\/presupuestos$/);
    await inviteePage.goto("/equipo");
    await inviteePage.getByRole("button", { name: "Salir de la empresa" }).click();
    await expect(inviteePage.getByRole("button", { name: new RegExp(`Espacio activo: ${escapeRegExp(flowCompanies.main)}`) })).toHaveCount(0);
  });

  expectNoServerErrors([...ownerIssues, ...inviteeIssues]);
  await ownerContext.close();
  await inviteeContext.close();
});

test("superadministrador: corrige el estado de una obra y anula una factura sin pagos", async ({ page }) => {
  test.setTimeout(180_000);
  const owner = state.owner;
  const companyId = state.companyId;
  const buyer = apiAs(api, await apiLogin(api, accounts.buyer));

  // Factura emitida y sin pagos, como las que un cliente pide anular por error.
  const { body: project } = await owner.post("/projects", { companyId, clientId: state.buyerClientId, name: "Factura por anular QA" }, 201);
  const { body: budget } = await owner.post("/budgets/from-project", { companyId, projectId: project.project.id, title: "Trabajo duplicado" }, 201);
  await owner.post(`/budgets/${budget.budgetId}/items`, { companyId, description: "Visita técnica", quantity: 1, unitPrice: 35, taxable: false }, 201);
  await owner.post(`/budgets/${budget.budgetId}/send`, { companyId }, 200);
  await buyer.post(`/budgets/${budget.budgetId}/approve`, {}, 200);
  const { body: invoice } = await owner.post("/invoices/from-budget", { companyId, budgetId: budget.budgetId, clientId: state.buyerClientId }, 201);

  const issues = watchPage(page);
  acceptDialogs(page);
  await signInAdmin(page, accounts.superAdmin);

  await test.step("cambia el estado de la obra con motivo", async () => {
    await page.goto(`${adminUrl}/#/projects?id=${project.project.id}`);
    await page.getByRole("button", { name: "Cambiar estado" }).click();
    await page.getByLabel("Nuevo estado").selectOption({ label: "Pausada" });
    await page.getByLabel("Motivo (queda en la auditoría y lo ve la empresa)").fill("Pedido de la empresa por soporte QA");
    await page.getByRole("button", { name: "Confirmar cambio" }).click();
    await expect(page.getByText(/Estado cambiado a «Pausad/)).toBeVisible();
    const { body } = await owner.get(`/projects/${project.project.id}?companyId=${companyId}`);
    expect((body.project ?? body).status).toBe("paused");
  });

  await test.step("anula la factura con motivo", async () => {
    await page.goto(`${adminUrl}/#/invoices?id=${invoice.invoice.id}`);
    await page.getByRole("button", { name: "Anular factura" }).click();
    await page.getByLabel("Motivo (queda en la auditoría y lo ve la empresa)").fill("Factura duplicada, pedido del cliente");
    await page.getByRole("button", { name: "Confirmar anulación" }).click();
    await expect(page.getByText("Factura anulada. Quedó en su historial y en la auditoría.")).toBeVisible();
    const { body } = await owner.get(`/invoices/${invoice.invoice.id}?companyId=${companyId}`);
    expect((body.invoice ?? body).status).toBe("cancelled");
  });

  await test.step("la acción queda en la auditoría", async () => {
    await page.goto(`${adminUrl}/#/audit`);
    await settle(page);
    await expect(page.getByText(/ADMIN_INVOICE_CANCELLED|Factura anulada|Anuló/).first()).toBeVisible();
    await capture(page, "flujos", "admin-auditoria");
  });

  expectNoServerErrors(issues);
});
