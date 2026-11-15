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
