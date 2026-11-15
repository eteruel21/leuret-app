import { expect, test } from "@playwright/test";
import { browserAccount, turnstileToken } from "./fixtures.mjs";

test("el cliente inicia sesión, conserva su pantalla y pierde el acceso al salir", async ({ page }) => {
  const { email, password } = browserAccount();
  await page.route("https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit", (route) =>
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
