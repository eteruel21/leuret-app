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
