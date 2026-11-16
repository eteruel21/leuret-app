import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

import type { AccountDeletionPreview, RetainedCategory } from "@/utils/account-deletion";

const isWeb = Platform.OS === "web";
const refreshTokenKey = "contractor_refresh_token";
const legacyRefreshTokenKey = `fallback_${refreshTokenKey}`;


function getMobileApiUrl(): string {
  const rawUrl = process.env.EXPO_PUBLIC_API_URL?.trim().replace(/\/+$/, "");
  const browserHostname = typeof window !== "undefined"
    ? window.location?.hostname
    : undefined;
  const isLocalHost = !!browserHostname && (
    browserHostname === "localhost" ||
    browserHostname === "127.0.0.1" ||
    browserHostname.endsWith(".local")
  );

  if (!rawUrl) {
    throw new Error("EXPO_PUBLIC_API_URL es obligatoria.");
  }

  if (browserHostname && !isLocalHost && (rawUrl.includes("127.0.0.1") || rawUrl.includes("localhost"))) {
    throw new Error("EXPO_PUBLIC_API_URL no puede apuntar a localhost fuera del desarrollo local.");
  }

  return rawUrl;
}

export const API_URL = getMobileApiUrl();

const SESSION_STORAGE_KEY =
  "contractor-pro.local-session.v1";
const READ_REQUEST_TIMEOUT_MS = 15_000;

export type AppRole =
  | "super_admin"
  | "contractor"
  | "client";

export type AppProfile = {
  id: string;
  email: string;
  full_name: string | null;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  avatar_url: string | null;
  role: AppRole;
  active: boolean;
  contractor_requested_at?: string | null;
  contractor_approved_at?: string | null;
  province: string | null;
  district: string | null;
  corregimiento: string | null;
  terms_accepted: boolean;
  notifications_opt_in: boolean;

  business_name?: string | null;
  id_document?: string | null;
  tax_id?: string | null;
  tax_dv?: string | null;
  primary_category?: string | null;
  specialties?: string[] | null;
  experience_years?: number | null;
  work_areas?: string[] | null;
  professional_description?: string | null;
  company_logo_url?: string | null;
  portfolio_urls?: string[] | null;
  certifications?: string[] | null;
  availability?: string | null;
  preferred_contact_method?: string | null;
  emits_invoice?: boolean;
  has_transport?: boolean;
  work_mode?: string | null;

  created_at: string;
  updated_at: string;
};

export type StoredSession = {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  sessionId: string;
  user: AppProfile | null;
  requiresApproval: boolean;
  requiresEmailConfirmation?: boolean;
  emailDeliverySucceeded?: boolean;
};

type AuthResponse = {
  accessToken?: string;
  refreshToken?: string;
  expiresIn?: number;
  sessionId?: string;
  user?: AppProfile | null;
  requiresApproval?: boolean;
  requiresEmailConfirmation?: boolean;
  emailDeliverySucceeded?: boolean;
  message?: string;
};

type ApiErrorBody = {
  message?: string;
  code?: string;
};

export class ApiError extends Error {
  readonly status: number;
  readonly code?: string;

  constructor(
    message: string,
    status: number,
    code?: string
  ) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }
}

let inMemorySession: StoredSession | null = null;
let refreshInProgress: { sessionId: string; promise: Promise<StoredSession> } | null = null;
const sessionEndedListeners = new Set<(sessionId: string) => void>();

export function onSessionEnded(listener: (sessionId: string) => void): () => void {
  sessionEndedListeners.add(listener);
  return () => { sessionEndedListeners.delete(listener); };
}

async function sendRequest<T>(path: string, init: RequestInit): Promise<T> {
  const bounded = (!init.method || init.method.toUpperCase() === "GET")
    || path === "/auth/refresh" || path === "/auth/login"
    || path === "/auth/recover-password" || path === "/auth/logout";
  const controller = bounded && !init.signal ? new AbortController() : null;
  const timeout = controller ? setTimeout(() => controller.abort(), READ_REQUEST_TIMEOUT_MS) : null;

  try {
    const response = await fetch(`${API_URL}${path}`, {
      ...init,
      ...(controller ? { signal: controller.signal } : {}),
      ...(isWeb ? { credentials: "include" as const } : {}),
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        ...init.headers
      }
    });
    const body = await readResponse<T>(response);
    if (controller?.signal.aborted) {
      throw new ApiError("Leuret tardó en responder. Inténtalo de nuevo.", 0, "REQUEST_TIMEOUT");
    }
    return body;
  } catch (error) {
    if (error instanceof ApiError || init.signal?.aborted) throw error;
    if (controller?.signal.aborted) {
      throw new ApiError("Leuret tardó en responder. Inténtalo de nuevo.", 0, "REQUEST_TIMEOUT");
    }
    throw new ApiError("No pudimos conectar con Leuret. Revisa tu conexión e inténtalo de nuevo.", 0, "NETWORK_ERROR");
  } finally {
    if (timeout !== null) clearTimeout(timeout);
  }
}

async function readResponse<T>(
  response: Response
): Promise<T> {
  const body = await response.json().catch(() => null);
  if (response.ok) return body as T;
  const errorBody = body as ApiErrorBody | null;
  let message = typeof errorBody?.message === "string" ? errorBody.message : "No fue posible completar la solicitud.";
  if (response.status >= 500) message = "Leuret no está disponible en este momento. Inténtalo de nuevo en unos minutos.";
  if (response.status === 429) message = "Hubo demasiados intentos. Espera un momento y vuelve a intentarlo.";
  throw new ApiError(message, response.status, errorBody?.code);
}

export async function publicRequest<T>(
  path: string,
  init: RequestInit = {}
): Promise<T> {
  return sendRequest<T>(path, init);
}

function toStoredSession(
  response: AuthResponse
): StoredSession {
  return {
    accessToken: response.accessToken || "",
    refreshToken: response.refreshToken || "",
    expiresAt: response.expiresIn ? Date.now() + response.expiresIn * 1000 : 0,
    sessionId: response.sessionId || "",
    user: response.user || null,
    requiresApproval: !!response.requiresApproval,
    requiresEmailConfirmation: response.requiresEmailConfirmation,
    emailDeliverySucceeded: response.emailDeliverySucceeded
  };
}

export async function storeSession(
  session: StoredSession
): Promise<void> {
  if (!isWeb && await SecureStore.isAvailableAsync()) {
    await SecureStore.setItemAsync(refreshTokenKey, session.refreshToken);
  }
  await AsyncStorage.removeItem(legacyRefreshTokenKey);
  await AsyncStorage.setItem(
    SESSION_STORAGE_KEY,
    JSON.stringify({ sessionId: session.sessionId })
  );
  inMemorySession = session;
}

export async function loadStoredSession():
Promise<StoredSession | null> {
  const stored = await AsyncStorage.getItem(
    SESSION_STORAGE_KEY
  );

  if (!stored) {
    await AsyncStorage.removeItem(legacyRefreshTokenKey);
    return null;
  }

  let markerData: Partial<StoredSession> | null = null;
  try {
    markerData = JSON.parse(stored);
  } catch {
    // A malformed marker has no session identifier to restore.
  }
  const sessionId = markerData?.sessionId;
  if (typeof sessionId !== "string" || !sessionId) {
    await clearStoredSession();
    return null;
  }
  if (inMemorySession?.sessionId === sessionId) return inMemorySession;

  const marker = JSON.stringify({ sessionId });
  if (stored !== marker) {
    await AsyncStorage.removeItem(legacyRefreshTokenKey);
    await AsyncStorage.setItem(SESSION_STORAGE_KEY, marker);
  }
  const refreshToken = !isWeb && await SecureStore.isAvailableAsync()
    ? await SecureStore.getItemAsync(refreshTokenKey)
    : null;
  return {
    sessionId,
    accessToken: "",
    refreshToken: refreshToken ?? "",
    expiresAt: 0,
    user: null,
    requiresApproval: false
  };
}

export async function clearStoredSession():
Promise<void> {
  inMemorySession = null;
  await AsyncStorage.multiRemove([SESSION_STORAGE_KEY, legacyRefreshTokenKey]);
  if (!isWeb && await SecureStore.isAvailableAsync()) {
    await SecureStore.deleteItemAsync(refreshTokenKey);
  }
}

async function endSession(sessionId: string): Promise<void> {
  if ((await loadStoredSession())?.sessionId !== sessionId) return;
  try {
    await clearStoredSession();
  } finally {
    sessionEndedListeners.forEach((listener) => listener(sessionId));
  }
}

export async function login(
  email: string,
  password: string,
  captchaToken: string
): Promise<StoredSession> {
  const response =
    await publicRequest<AuthResponse>(
      "/auth/login",
      {
        method: "POST",
        body: JSON.stringify({
          email,
          password,
          captchaToken,
          ...(isWeb ? { clientType: "app-web" } : {})
        })
      }
    );

  const session = toStoredSession(response);
  await storeSession(session);

  return session;
}

export type LegalDocumentType = "terms" | "privacy";
export type LegalDocumentSummary = {
  title: string;
  version: string;
  updatedAt: string;
};
export type AccountLegalStatus = Record<
  LegalDocumentType,
  LegalDocumentSummary & { confirmedAt: string | null }
>;
export type LegalConfirmations = {
  terms?: { accepted: true; version: string };
  privacy?: { acknowledged: true; version: string };
};

export async function getRegistrationLegalDocuments(signal: AbortSignal) {
  const [terms, privacy] = await Promise.all([
    publicRequest<LegalDocumentSummary>("/legal/terms", { signal }),
    publicRequest<LegalDocumentSummary>("/legal/privacy", { signal })
  ]);
  if (![terms, privacy].every((document) => document && /^[0-9a-f]{64}$/.test(document.version))) {
    throw new Error("No se pudo identificar la versión de los documentos.");
  }
  return { terms, privacy };
}

export function getVersionedLegalUrl(type: LegalDocumentType, version: string): string {
  return API_URL + "/legal/" + type + "/version/" + encodeURIComponent(version);
}

export async function getAccountLegalStatus(signal: AbortSignal): Promise<AccountLegalStatus> {
  return authenticatedRequest<AccountLegalStatus>("/account/legal-acceptances", { signal });
}

export async function confirmAccountLegalDocuments(
  confirmations: LegalConfirmations
): Promise<AccountLegalStatus> {
  return authenticatedRequest<AccountLegalStatus>("/account/legal-acceptances", {
    method: "POST",
    body: JSON.stringify(confirmations)
  });
}

export type RegisterInput = {
  fullName: string;
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
  password: string;
  captchaToken: string;
  role?: "contractor" | "client";
  province: string;
  district: string;
  corregimiento: string;
  legalConfirmations: Required<LegalConfirmations>;
  notificationsOptIn: boolean;
  registrationDevice: string;
};

export async function register(
  input: RegisterInput
): Promise<StoredSession> {
  const response =
    await publicRequest<AuthResponse>(
      "/auth/register",
      {
        method: "POST",
        body: JSON.stringify(input)
      }
    );


  const session = toStoredSession(response);
  if (!session.requiresEmailConfirmation) {
    await storeSession(session);
  }

  return session;
}

async function refreshSession(current: StoredSession): Promise<StoredSession> {
  if (refreshInProgress?.sessionId === current.sessionId) {
    return refreshInProgress.promise;
  }

  const renew = async () => {
    if ((await loadStoredSession())?.sessionId !== current.sessionId) {
      throw new ApiError("La sesión cambió.", 401);
    }
    if (!isWeb && !current.refreshToken) {
      throw new ApiError("No existe una sesión para renovar.", 401);
    }
    const response =
      await publicRequest<AuthResponse>(
        "/auth/refresh",
        {
          method: "POST",
          body: JSON.stringify({
            sessionId: current.sessionId,
            ...(isWeb ? { clientType: "app-web" } : { refreshToken: current.refreshToken })
          })
        }
      );

    const session = toStoredSession(response);
    if (session.sessionId !== current.sessionId || (await loadStoredSession())?.sessionId !== current.sessionId) {
      throw new ApiError("La sesión cambió.", 401);
    }
    await storeSession(session);

    return session;
  };
  const renewal = isWeb && globalThis.navigator?.locks
    ? Promise.resolve(navigator.locks.request(SESSION_STORAGE_KEY, renew))
    : renew();
  const promise = renewal.catch(async (error: unknown) => {
    if (error instanceof ApiError && (error.status === 401 || error.status === 403)) {
      await endSession(current.sessionId);
    }
    throw error;
  });
  refreshInProgress = { sessionId: current.sessionId, promise };

  try {
    return await promise;
  } finally {
    if (refreshInProgress?.promise === promise) refreshInProgress = null;
  }
}

function needsRenewal(session: StoredSession): boolean {
  return Date.now() >= session.expiresAt - 30_000;
}

export async function restoreStoredSession(): Promise<StoredSession | null> {
  const stored = await loadStoredSession();
  if (!stored) return null;

  const renewed = needsRenewal(stored) ? await refreshSession(stored) : null;
  if (renewed?.user) return renewed;
  return { ...(renewed ?? stored), ...await getCurrentUser() };
}

async function validSession():
Promise<StoredSession> {
  const session = await loadStoredSession();

  if (!session) {
    throw new ApiError(
      "No hay una sesión activa.",
      401
    );
  }

  if (needsRenewal(session)) {
    return refreshSession(session);
  }

  return session;
}

export async function authenticatedRequest<T>(
  path: string,
  init: RequestInit = {},
  retry = true
): Promise<T> {
  const session = await validSession();

  const send = (accessToken: string) =>
    sendRequest<T>(path, {
      ...init,
      headers: {
        ...init.headers,
        Authorization: `Bearer ${accessToken}`
      }
    });
  try {
    return await send(session.accessToken);
  } catch (error) {
    if (!(error instanceof ApiError) || error.status !== 401 || !retry) {
      if (path === "/auth/me" && error instanceof ApiError && error.status === 403) {
        await endSession(session.sessionId);
      }
      throw error;
    }
    const current = await loadStoredSession();
    if (current?.sessionId !== session.sessionId) {
      throw new ApiError("La sesión cambió.", 401);
    }
    const refreshed = current.accessToken === session.accessToken ? await refreshSession(current) : current;
    try {
      return await send(refreshed.accessToken);
    } catch (retryError) {
      if (retryError instanceof ApiError && (retryError.status === 401
        || (path === "/auth/me" && retryError.status === 403))) {
        await endSession(session.sessionId);
      }
      throw retryError;
    }
  }
}

export async function getCurrentUser():
Promise<{
  user: AppProfile;
  requiresApproval: boolean;
}> {
  return authenticatedRequest(
    "/auth/me"
  );
}

export async function logout():
Promise<void> {
  try {
    await authenticatedRequest(
      "/auth/logout",
      {
        method: "POST",
        body: JSON.stringify({ clientType: isWeb ? "app-web" : "native" })
      }
    );
  } finally {
    await clearStoredSession();
  }
}

export async function updateOwnProfile(
  input: {
    fullName: string;
    phone: string | null;
    notificationsOptIn?: boolean;
  }
): Promise<void> {
  await authenticatedRequest(
    "/profile",
    {
      method: "PATCH",
      body: JSON.stringify(input)
    }
  );
}

export async function updateOwnAvatar(
  avatarUrl: string | null
): Promise<void> {
  await authenticatedRequest(
    "/profile/avatar",
    {
      method: "PATCH",
      body: JSON.stringify({ avatarUrl })
    }
  );
}

export async function updateContractorProfile(
  input: Record<string, unknown>
): Promise<void> {
  await authenticatedRequest(
    "/profile/contractor",
    {
      method: "PATCH",
      body: JSON.stringify(input)
    }
  );
}

export async function confirmEmailApi(token: string): Promise<{ message?: string }> {
  return publicRequest<{ message?: string }>("/auth/verify-email", {
    method: "POST",
    body: JSON.stringify({ token })
  });
}

export async function resendVerificationEmail(email: string, captchaToken: string): Promise<{ message?: string }> {
  return publicRequest<{ message?: string }>("/auth/resend-verification", {
    method: "POST",
    body: JSON.stringify({ email, captchaToken })
  });
}

export async function requestPasswordReset(email: string, captchaToken: string): Promise<{ message?: string }> {
  return publicRequest<{ message?: string }>("/auth/recover-password", {
    method: "POST",
    body: JSON.stringify({ email, captchaToken })
  });
}

export type AccountDeletionResponse = {
  success: boolean;
  accountStatus: "deleted";
  deletedAt?: string;
  authenticationDisabled: boolean;
  profilePersonalDataAnonymized: boolean;
  sessionsRevoked: boolean;
  deleted?: Record<string, number>;
  retained?: RetainedCategory[];
  retentionUntil?: string | null;
  storageCleanup: {
    status: "completed" | "not_required" | "queued_for_retry";
    objectCount: number;
    completedObjectCount: number;
    pendingObjectCount: number;
    failedObjectCount: number;
    retryScheduled: boolean;
    sharedProjectPhotosPreserved: number;
    note: string;
  };
};

export async function exportAccountData(): Promise<Record<string, unknown>> {
  return authenticatedRequest<Record<string, unknown>>(
    "/account/export"
  );
}

/**
 * Enlace de 10 minutos para descargar la exportación en el navegador del
 * teléfono (iOS y Android no pueden guardar el JSON desde la app).
 */
export async function createAccountExportLink(): Promise<{ url: string; expiresAt: string }> {
  const result = await authenticatedRequest<{ path: string; expiresAt: string }>(
    "/account/export/link",
    { method: "POST" }
  );
  return { url: `${API_URL}${result.path}`, expiresAt: result.expiresAt };
}

export async function getAccountDeletionPreview(): Promise<AccountDeletionPreview> {
  return authenticatedRequest<AccountDeletionPreview>("/account/deletion-preview");
}

export async function deleteOwnAccount(): Promise<AccountDeletionResponse> {
  const result = await authenticatedRequest<AccountDeletionResponse>(
    "/account",
    {
      method: "DELETE"
    }
  );

  await clearStoredSession();
  return result;
}

export async function resetPasswordApi(token: string, newPassword: string): Promise<{ message?: string }> {
  return publicRequest<{ message?: string }>("/auth/reset-password", {
    method: "POST",
    body: JSON.stringify({ token, newPassword })
  });
}
