export const turnstileToken = "leuret-browser-test-login";

export function browserAccount() {
  const runId = process.env.LEURET_E2E_RUN_ID;
  if (!runId) throw new Error("Inicia el entorno de prueba con npm run test:e2e.");

  return {
    email: `cliente-ci-${runId}@example.test`,
    password: `Leuret-ci-${runId}!`,
    fullName: "Andrea Cliente de Prueba"
  };
}

export function browserAdmin() {
  const client = browserAccount();
  return { email: client.email.replace(/^cliente-/, "admin-"), password: client.password, fullName: "Administración de Prueba" };
}

export const contractorCompanies = ["Constructora Norte de Prueba", "Constructora Sur de Prueba"];

export function browserContractor() {
  const client = browserAccount();
  return {
    email: client.email.replace(/^cliente-/, "contratista-"),
    password: client.password,
    fullName: "Contratista de Prueba"
  };
}

export const flowCompanies = { main: "Constructora Flujo QA", rival: "Instalaciones Pacífico QA" };

/** Roles de equipo que se siembran como miembros activos de la empresa principal. */
export const flowStaffRoles = ["admin", "estimator", "supervisor", "sales", "member"];

/**
 * Cuentas controladas para los recorridos por rol. Son independientes de las
 * de las pruebas de sesión para que ningún dato creado aquí cambie esas pruebas.
 */
export function flowAccounts() {
  const { password } = browserAccount();
  const runId = process.env.LEURET_E2E_RUN_ID;
  const account = (key, fullName) => ({ key, email: `flujo-${key}-${runId}@example.test`, password, fullName });

  return {
    owner: account("owner", "Olga Propietaria QA"),
    admin: account("admin", "Adrián Administrador QA"),
    estimator: account("estimator", "Elena Estimadora QA"),
    supervisor: account("supervisor", "Saúl Supervisor QA"),
    sales: account("sales", "Vanesa Ventas QA"),
    member: account("member", "Mario Miembro QA"),
    invitee: account("invitee", "Iván Invitado QA"),
    rival: account("rival", "Ramiro Rival QA"),
    client: account("client", "Carla Cliente QA"),
    client2: account("client2", "Diego Cliente QA"),
    buyer: account("buyer", "Beatriz Compradora QA"),
    superAdmin: account("superadmin", "Sofía Superadmin QA")
  };
}

export function mockBrowserTurnstile(page) {
  return page.route("https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit", (route) =>
    route.fulfill({
      contentType: "application/javascript",
      body: `window.turnstile = {
        render(_element, options) {
          queueMicrotask(() => options.callback(${JSON.stringify(turnstileToken)}));
          return 'ci-widget';
        },
        remove() {}
      };`
    })
  );
}
