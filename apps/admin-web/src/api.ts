function getApiUrl(): string {
  const rawUrl = import.meta.env.VITE_API_URL?.trim().replace(/\/+$/, "");
  const isLocalHost = typeof window !== "undefined" && (
    window.location.hostname === "localhost" ||
    window.location.hostname === "127.0.0.1" ||
    window.location.hostname.endsWith(".local")
  );

  if (!rawUrl) {
    throw new Error("VITE_API_URL es obligatoria.");
  }

  if (!isLocalHost && (rawUrl.includes("127.0.0.1") || rawUrl.includes("localhost"))) {
    throw new Error("VITE_API_URL no puede apuntar a localhost fuera del desarrollo local.");
  }

  return rawUrl;
}

const API_URL = getApiUrl();

const SESSION_KEY =
  "contractor-pro.admin-session.v1";

export type AdminUser = {
  id: string;
  email: string;
  role:
  | "super_admin"
  | "contractor"
  | "client";
  active: boolean;
};

export type AdminSession = {
  accessToken: string;
  expiresAt: number;
  sessionId: string;
  user: AdminUser;
};

type AuthResponse = {
  accessToken: string;
  refreshToken?: string;
  expiresIn: number;
  sessionId: string;
  user: AdminUser;
};

type ErrorResponse = {
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

let memorySession: AdminSession | null = null;
let refreshInProgress: { sessionId: string; promise: Promise<AdminSession> } | null = null;

async function readResponse<T>(
  response: Response
): Promise<T> {
  const body = await response
    .json()
    .catch(() => null);

  if (!response.ok) {
    const errorBody =
      body as ErrorResponse | null;

    throw new ApiError(
      errorBody?.message ||
      "No fue posible completar la solicitud.",
      response.status
    );
  }

  return body as T;
}

async function publicRequest<T>(
  path: string,
  init: RequestInit = {}
): Promise<T> {
  const response = await fetch(
    `${API_URL}${path}`,
    {
      ...init,
      credentials: "include",
      headers: {
        Accept: "application/json",
        "Content-Type":
          "application/json",
        ...init.headers
      }
    }
  );

  return readResponse<T>(response);
}

function saveSession(
  session: AdminSession
): void {
  localStorage.setItem(
    SESSION_KEY,
    JSON.stringify({ sessionId: session.sessionId })
  );
  memorySession = session;
}

function readStoredSessionId(): string | null {
  const value =
    localStorage.getItem(
      SESSION_KEY
    );

  if (!value) return null;

  try {
    const { sessionId } = JSON.parse(value) as Partial<AdminSession>;
    if (typeof sessionId !== "string" || !sessionId) {
      clearSession();
      return null;
    }

    const marker = JSON.stringify({ sessionId });
    if (value !== marker) localStorage.setItem(SESSION_KEY, marker);
    return sessionId;
  } catch {
    clearSession();
    return null;
  }
}

function clearSession(): void {
  memorySession = null;
  localStorage.removeItem(
    SESSION_KEY
  );
}

function toSession(
  response: AuthResponse
): AdminSession {
  return {
    accessToken:
      response.accessToken,
    expiresAt:
      Date.now() +
      response.expiresIn * 1000,
    sessionId:
      response.sessionId,
    user:
      response.user
  };
}

async function refreshSession(sessionId: string): Promise<AdminSession> {
  if (refreshInProgress?.sessionId === sessionId) {
    return refreshInProgress.promise;
  }

  const renew = async () => {
    if (readStoredSessionId() !== sessionId) {
      throw new ApiError("La sesión cambió.", 401);
    }
    const response =
      await publicRequest<AuthResponse>(
        "/auth/refresh",
        {
          method: "POST",
          body: JSON.stringify({
            clientType: "web",
            sessionId
          })
        }
      );

    if (response.sessionId !== sessionId || readStoredSessionId() !== sessionId) {
      throw new ApiError("La sesión cambió.", 401);
    }
    const session = ensureSuperAdmin(toSession(response));
    saveSession(session);

    return session;
  };
  const promise = globalThis.navigator?.locks
    ? Promise.resolve(navigator.locks.request(SESSION_KEY, renew))
    : renew();
  refreshInProgress = { sessionId, promise };

  try {
    return await promise;
  } catch (error) {
    if (
      error instanceof ApiError && (error.status === 401 || error.status === 403) &&
      readStoredSessionId() === sessionId
    ) {
      clearSession();
    }
    throw error;
  } finally {
    if (refreshInProgress?.promise === promise) refreshInProgress = null;
  }
}

async function validSession():
  Promise<AdminSession> {
  const sessionId = readStoredSessionId();

  if (!sessionId) {
    throw new ApiError(
      "No hay una sesión activa.",
      401
    );
  }

  if (
    memorySession?.sessionId !== sessionId ||
    Date.now() >= memorySession.expiresAt - 30000
  ) {
    return refreshSession(sessionId);
  }

  return memorySession;
}

export async function authenticatedRequest<T>(
  path: string,
  init: RequestInit = {},
  retry = true
): Promise<T> {
  const session =
    await validSession();

  const send = (accessToken: string) =>
    fetch(`${API_URL}${path}`, {
      ...init,
      credentials: "include",
      headers: {
        Accept: "application/json",
        "Content-Type":
          "application/json",
        ...init.headers,
        Authorization: `Bearer ${accessToken}`
      }
    });
  const response = await send(session.accessToken);

  if (
    response.status === 401 &&
    retry
  ) {
    if (readStoredSessionId() !== session.sessionId) {
      throw new ApiError("La sesión cambió.", 401);
    }
    const refreshed =
      memorySession?.sessionId === session.sessionId && memorySession.accessToken !== session.accessToken
        ? memorySession
        : await refreshSession(session.sessionId);
    return readResponse<T>(await send(refreshed.accessToken));
  }

  return readResponse<T>(response);
}

function ensureSuperAdmin(
  session: AdminSession
): AdminSession {
  if (
    !session.user.active ||
    session.user.role !==
    "super_admin"
  ) {
    clearSession();

    throw new ApiError(
      "Esta cuenta no es superadministradora.",
      403
    );
  }

  return session;
}

export async function loginAdmin(
  email: string,
  password: string,
  captchaToken: string
): Promise<AdminSession> {
  const response =
    await publicRequest<AuthResponse>(
      "/auth/login",
      {
        method: "POST",
        body: JSON.stringify({
          email:
            email.trim().toLowerCase(),
          password,
          captchaToken,
          clientType: "web"
        })
      }
    );

  const session =
    ensureSuperAdmin(
      toSession(response)
    );

  saveSession(session);

  return session;
}

export async function restoreAdminSession():
  Promise<AdminSession | null> {
  const sessionId = readStoredSessionId();

  if (!sessionId) return null;

  const current =
    await authenticatedRequest<{
      user: AdminUser;
    }>("/auth/me");

  if (readStoredSessionId() !== sessionId || memorySession?.sessionId !== sessionId) {
    return null;
  }

  const session =
    ensureSuperAdmin({
      ...memorySession,
      user: current.user
    });

  saveSession(session);

  return session;
}

export async function logoutAdmin():
  Promise<void> {
  try {
    await authenticatedRequest(
      "/auth/logout",
      {
        method: "POST"
      }
    );
  } finally {
    clearSession();
  }
}

export type LegalDocument = {
  title: string;
  updatedAt: string;
  content: string;
};

export async function getLegalDocument(
  type: "terms" | "privacy"
): Promise<LegalDocument> {
  return publicRequest<LegalDocument>(
    `/legal/${type}`
  );
}

export async function exportAccountData(): Promise<
  Record<string, unknown>
> {
  return authenticatedRequest<
    Record<string, unknown>
  >("/account/export");
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

export async function deleteAccount(): Promise<AccountDeletionResponse> {
  return authenticatedRequest<AccountDeletionResponse>(
    "/account",
    {
      method: "DELETE"
    }
  );
}
