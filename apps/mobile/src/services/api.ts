import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

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
};

export class ApiError extends Error {
  readonly status: number;

  constructor(
    message: string,
    status: number
  ) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

let inMemorySession: StoredSession | null = null;
let refreshInProgress: { sessionId: string; promise: Promise<StoredSession> } | null = null;

async function readResponse<T>(
  response: Response
): Promise<T> {
  const body = await response
    .json()
    .catch(() => null);

  if (!response.ok) {
    const errorBody =
      body as ApiErrorBody | null;

    throw new ApiError(
      errorBody?.message ||
        "No fue posible completar la solicitud.",
      response.status
    );
  }

  return body as T;
}

export async function publicRequest<T>(
  path: string,
  init: RequestInit = {}
): Promise<T> {
  const response = await fetch(
    `${API_URL}${path}`,
    {
      ...init,
      ...(isWeb ? { credentials: "include" as const } : {}),
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        ...init.headers
      }
    }
  );

  return readResponse<T>(response);
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

  try {
    const { sessionId } = JSON.parse(stored) as Partial<StoredSession>;
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
  } catch {
    await clearStoredSession();
    return null;
  }
}

export async function clearStoredSession():
Promise<void> {
  inMemorySession = null;
  await AsyncStorage.multiRemove([SESSION_STORAGE_KEY, legacyRefreshTokenKey]);
  if (!isWeb && await SecureStore.isAvailableAsync()) {
    await SecureStore.deleteItemAsync(refreshTokenKey);
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
  termsAccepted: boolean;
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
  const promise = isWeb && globalThis.navigator?.locks
    ? Promise.resolve(navigator.locks.request(SESSION_STORAGE_KEY, renew))
    : renew();
  refreshInProgress = { sessionId: current.sessionId, promise };

  try {
    return await promise;
  } catch (error) {
    if (
      error instanceof ApiError && (error.status === 401 || error.status === 403) &&
      (await loadStoredSession())?.sessionId === current.sessionId
    ) {
      await clearStoredSession();
    }
    throw error;
  } finally {
    if (refreshInProgress?.promise === promise) refreshInProgress = null;
  }
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

  const refreshBefore =
    session.expiresAt - 30_000;

  if (Date.now() >= refreshBefore) {
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
    fetch(`${API_URL}${path}`, {
      ...init,
      ...(isWeb ? { credentials: "include" as const } : {}),
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        ...init.headers,
        Authorization: `Bearer ${accessToken}`
      }
    });
  const response = await send(session.accessToken);

  if (
    response.status === 401 &&
    retry
  ) {
    const current = await loadStoredSession();
    if (current?.sessionId !== session.sessionId) {
      throw new ApiError("La sesión cambió.", 401);
    }
    const refreshed = current.accessToken === session.accessToken ? await refreshSession(current) : current;
    return readResponse<T>(await send(refreshed.accessToken));
  }

  return readResponse<T>(response);
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
  authenticationDisabled: boolean;
  profilePersonalDataAnonymized: boolean;
  sessionsRevoked: boolean;
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
