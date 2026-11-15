import { afterEach, beforeEach, expect, test, vi } from "vitest";
import {
  login,
  register,
  resendVerificationEmail,
  requestPasswordReset,
  resetPasswordApi
} from "../api";
import AsyncStorage from "@react-native-async-storage/async-storage";

vi.mock("@react-native-async-storage/async-storage", () => ({
  default: {
    getItem: vi.fn(),
    setItem: vi.fn(),
    removeItem: vi.fn(),
    multiRemove: vi.fn()
  }
}));

vi.mock("react-native", () => ({
  Platform: { OS: "web" }
}));

vi.mock("expo-secure-store", () => ({
  isAvailableAsync: vi.fn(async () => false),
  getItemAsync: vi.fn(),
  setItemAsync: vi.fn(),
  deleteItemAsync: vi.fn()
}));

const fetchMock = vi.fn();

function successfulResponse(body: object = { message: "ok" }): Response {
  return {
    ok: true,
    status: 200,
    json: async () => body
  } as Response;
}

beforeEach(() => {
  vi.clearAllMocks();
  fetchMock.mockReset();
  fetchMock.mockResolvedValue(successfulResponse());
  vi.stubGlobal("fetch", fetchMock);
});

test("login web persiste el identificador de sesión sin guardar credenciales ni perfil", async () => {
  fetchMock.mockResolvedValueOnce(successfulResponse({
    accessToken: "access-token-for-test",
    sessionId: "session-id-for-test",
    expiresIn: 900,
    user: { email: "user@example.test" }
  }));

  await login("user@example.test", "Password123!", "captcha-test");
  const request = fetchMock.mock.calls[0]?.[1] as RequestInit;
  expect(request.credentials).toBe("include");
  expect(JSON.parse(request.body as string).clientType).toBe("app-web");
  expect(AsyncStorage.setItem).toHaveBeenCalledOnce();
  expect(vi.mocked(AsyncStorage.setItem).mock.calls[0]?.[1]).toBe(
    JSON.stringify({ sessionId: "session-id-for-test" })
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

test("requestPasswordReset: envía el correo al endpoint de recuperación", async () => {
  await requestPasswordReset("user@example.test", "test-captcha-token");

  expect(fetchMock.mock.calls).toHaveLength(1);
  const [url, requestInit] = fetchMock.mock.calls[0] as [string, RequestInit];
  expect(url.endsWith("/auth/recover-password")).toBe(true);
  expect(JSON.parse(requestInit.body as string)).toEqual({
    email: "user@example.test",
    captchaToken: "test-captcha-token"
  });
});

test("resendVerificationEmail: envia correo al endpoint de reenvio con CAPTCHA", async () => {
  await resendVerificationEmail("user@example.test", "test-resend-captcha-token");

  expect(fetchMock.mock.calls).toHaveLength(1);
  const [url, requestInit] = fetchMock.mock.calls[0] as [string, RequestInit];
  expect(url.endsWith("/auth/resend-verification")).toBe(true);
  expect(JSON.parse(requestInit.body as string)).toEqual({
    email: "user@example.test",
    captchaToken: "test-resend-captcha-token"
  });
});

test("resetPasswordApi: respeta el contrato token y newPassword", async () => {
  await resetPasswordApi("reset-token", "Password123!");

  expect(fetchMock.mock.calls).toHaveLength(1);
  const [url, requestInit] = fetchMock.mock.calls[0] as [string, RequestInit];
  expect(url.endsWith("/auth/reset-password")).toBe(true);
  expect(JSON.parse(requestInit.body as string)).toEqual({
    token: "reset-token",
    newPassword: "Password123!"
  });
});

test("register: conserva la cuenta cuando falla el correo de verificación", async () => {
  fetchMock.mockResolvedValueOnce(
    successfulResponse({
      requiresEmailConfirmation: true,
      emailDeliverySucceeded: false,
      message: "La cuenta fue creada, pero el correo no pudo enviarse."
    })
  );

  const result = await register({
    fullName: "Usuario Prueba",
    firstName: "Usuario",
    lastName: "Prueba",
    phone: "+507 6000-0000",
    email: "user@example.test",
    password: "Password123!",
    captchaToken: "test-captcha-token",
    province: "Panamá",
    district: "Panamá",
    corregimiento: "Bella Vista",
    termsAccepted: true,
    notificationsOptIn: false,
    registrationDevice: "test"
  });

  expect(
    result.requiresEmailConfirmation
  ).toBe(true);

  expect(
    result.emailDeliverySucceeded
  ).toBe(false);
});
