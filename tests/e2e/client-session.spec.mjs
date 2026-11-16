import { expect, test } from "@playwright/test";
import { browserAccount, browserContractor, contractorCompanies, mockBrowserTurnstile } from "./fixtures.mjs";

async function signInProWeb(page, { email, password } = browserAccount()) {
  await mockBrowserTurnstile(page);

  await page.goto("/login");
  await page.getByPlaceholder("correo@empresa.com").fill(email);
  await page.getByPlaceholder("Tu contraseña").fill(password);

  const [loginResponse] = await Promise.all([
    page.waitForResponse((response) =>
      response.request().method() === "POST" && new URL(response.url()).pathname === "/auth/login"
    ),
    page.getByRole("button", { name: "Iniciar sesión", exact: true }).click()
  ]);
  expect(loginResponse.status()).toBe(200);
  const { accessToken, refreshToken } = await loginResponse.json();
  expect(accessToken).toEqual(expect.any(String));
  expect(refreshToken).toBeUndefined();

  return { email, accessToken };
}

test("el cliente inicia sesión, conserva su pantalla y pierde el acceso al salir", async ({ page }) => {
  const { email, accessToken } = await signInProWeb(page);
  await page.getByLabel("Mi cuenta", { exact: true }).click();
  await expect(page).toHaveURL(/\/cuenta$/);
  await expect(page.getByText(email, { exact: true })).toBeVisible();

  await page.reload();
  await expect(page).toHaveURL(/\/cuenta$/);
  await expect(page.getByText(email, { exact: true })).toBeVisible();

  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Cerrar sesión", exact: true }).click();
  await expect(page.getByPlaceholder("Tu contraseña")).toBeVisible();

  await page.goto("/cuenta");
  await expect(page.getByPlaceholder("Tu contraseña")).toBeVisible();
  const signedOut = await page.request.get("http://127.0.0.1:3001/auth/me", {
    headers: { authorization: `Bearer ${accessToken}` }
  });
  expect(signedOut.status()).toBe(401);
});

test("un fallo al recuperar la sesión o la empresa permite reintentar y volver a la última pantalla", async ({ page }) => {
  const { email, accessToken } = await signInProWeb(page);
  await page.getByRole("button", { name: "Mi cuenta", exact: true }).click();
  await expect(page).toHaveURL(/\/cuenta$/);
  await expect(page.getByText(email, { exact: true })).toBeVisible();

  const markerKey = "contractor-pro.local-session.v1";
  const readMarker = () => page.evaluate((key) => localStorage.getItem(key), markerKey);
  const marker = await readMarker();
  expect(marker).toBeTruthy();

  await page.route("**/auth/refresh", (route) => route.abort("internetdisconnected"), { times: 1 });
  await page.goto("/");
  await expect(page.getByText("No pudimos recuperar tu sesión", { exact: true })).toBeVisible();
  expect(await readMarker()).toBe(marker);

  await page.route("**/companies", (route) => route.abort("internetdisconnected"), { times: 1 });
  await page.getByRole("button", { name: "Reintentar", exact: true }).click();
  await expect(page.getByText("No pudimos cargar tu espacio", { exact: true })).toBeVisible();
  expect(await readMarker()).toBe(marker);

  await page.getByRole("button", { name: "Reintentar", exact: true }).click();
  await expect(page).toHaveURL(/\/cuenta$/);
  await expect(page.getByText(email, { exact: true })).toBeVisible();

  // A direct URL uses the client tab when it shares a path with a company screen.
  await page.goto("/facturas");
  await expect(page.getByText("Saldo pendiente", { exact: true })).toBeVisible();
  await expect(page).toHaveURL(/\/facturas$/);

  // Revoke the refreshed browser session while the local marker still exists.
  const refreshResponse = page.waitForResponse((response) => new URL(response.url()).pathname === "/auth/refresh");
  await page.reload();
  const { accessToken: renewedToken } = await (await refreshResponse).json();
  expect(renewedToken).toEqual(expect.any(String));
  expect(renewedToken).not.toBe(accessToken);
  const revoked = await page.request.post("http://127.0.0.1:3001/auth/logout", {
    headers: { authorization: `Bearer ${renewedToken}` },
    data: { clientType: "app-web" }
  });
  expect(revoked.status()).toBe(200);
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Iniciar sesión", exact: true })).toBeVisible();
  await expect(page.getByText("Tu sesión terminó. Inicia sesión para continuar.", { exact: true })).toBeVisible();
  await expect.poll(readMarker).toBeNull();
});

test("el contratista recupera Agenda y puede archivar y restaurar clientes en la empresa seleccionada", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const companiesRequest = page.waitForResponse((response) => new URL(response.url()).pathname === "/companies");
  const { accessToken } = await signInProWeb(page, browserContractor());
  const { memberships } = await (await companiesRequest).json();
  const companyName = contractorCompanies[1];
  const companyId = memberships.find(({ company }) => company.name === companyName)?.company_id;
  expect(companyId).toEqual(expect.any(String));

  await page.goto("/espacios");
  await page.getByRole("button", { name: new RegExp(`^(Entrar a|Continuar en) ${companyName}$`) }).click();
  await expect(page.getByRole("button", { name: new RegExp(`Espacio activo: ${companyName}`) })).toBeVisible();
  await page.getByRole("tab", { name: "Agenda", exact: true }).click();
  await expect(page).toHaveURL(/\/agenda$/);
  await expect(page.getByText("No hay actividades programadas", { exact: true })).toBeVisible();

  const activities = page.waitForResponse((response) =>
    new URL(response.url()).pathname === `/companies/${companyId}/activities`
  );
  await page.goto("/");
  await expect(page).toHaveURL(/\/agenda$/);
  expect((await activities).status()).toBe(200);
  await expect(page.getByText("No hay actividades programadas", { exact: true })).toBeVisible();

  const clientName = "Cliente de Prueba para Archivo";
  const created = await page.request.post("http://127.0.0.1:3001/clients", {
    headers: { authorization: `Bearer ${accessToken}` },
    data: { companyId, clientType: "person", firstName: "Cliente de Prueba", lastName: "para Archivo" }
  });
  expect(created.status()).toBe(201);
  await page.getByRole("tab", { name: "Clientes", exact: true }).click();
  const archive = page.getByRole("button", { name: `Archivar a ${clientName}`, exact: true });
  const restore = page.getByRole("button", { name: `Restaurar a ${clientName}`, exact: true });

  page.once("dialog", (dialog) => dialog.accept());
  await archive.click();
  await expect(archive).toHaveCount(0);
  await page.getByRole("tab", { name: "Archivados", exact: true }).click();

  page.once("dialog", (dialog) => dialog.accept());
  await restore.click();
  await expect(restore).toHaveCount(0);
  await page.getByRole("tab", { name: "Activos", exact: true }).click();
  await expect(archive).toBeVisible();
});
