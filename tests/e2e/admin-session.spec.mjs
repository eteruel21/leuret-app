import { expect, test } from "@playwright/test";
import { browserAdmin, mockBrowserTurnstile } from "./fixtures.mjs";

test("Admin recupera la sección abierta y conserva el contenido al actualizar", async ({ page }) => {
  const { email, password } = browserAdmin();
  await mockBrowserTurnstile(page);
  await page.goto("http://127.0.0.1:3000/#/system");
  await page.getByLabel("Correo electrónico").fill(email);
  await page.getByLabel("Contraseña").fill(password);
  await page.getByRole("button", { name: "Iniciar sesión", exact: true }).click();

  const dataHeading = page.getByRole("heading", { name: "Datos centrales" });
  await expect(dataHeading).toBeVisible();
  await expect(page).toHaveURL(/#\/system$/);

  await page.getByRole("button", { name: "Usuarios", exact: true }).click();
  await expect(page).toHaveURL(/#\/users$/);
  await page.goBack();
  await expect(dataHeading).toBeVisible();

  let resumeRefresh;
  const waitForRefresh = new Promise((resolve) => { resumeRefresh = resolve; });
  await page.route("**/admin/dashboard", async (route) => {
    await waitForRefresh;
    await route.continue();
  }, { times: 1 });
  await page.getByRole("button", { name: "Actualizar", exact: true }).click();
  try {
    await expect(page.getByRole("button", { name: "Actualizando…", exact: true })).toBeVisible();
    await expect(dataHeading).toBeVisible();
  } finally {
    resumeRefresh();
  }
  await expect(page.getByRole("button", { name: "Actualizar", exact: true })).toBeEnabled();

  await page.route("**/auth/refresh", (route) => route.abort("internetdisconnected"), { times: 1 });
  await page.reload();
  await expect(page.getByRole("heading", { name: "No pudimos recuperar tu sesión" })).toBeVisible();
  await page.getByRole("button", { name: "Reintentar", exact: true }).click();
  await expect(dataHeading).toBeVisible();
  await expect(page).toHaveURL(/#\/system$/);

  const projectsResponse = () => page.waitForResponse((response) =>
    new URL(response.url()).pathname === "/admin/projects"
  );
  const initialProjects = projectsResponse();
  await page.getByRole("button", { name: "Obras", exact: true }).click();
  expect((await initialProjects).status()).toBe(200);
  const refreshedProjects = projectsResponse();
  await page.locator("main > header").getByRole("button", { name: "Actualizar", exact: true }).click();
  expect((await refreshedProjects).status()).toBe(200);

  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("combobox", { name: "Sección del panel" }).selectOption("users");
  await expect(page).toHaveURL(/#\/users$/);
});
