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
const REQUEST_TIMEOUT_MS = 15_000;

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
const sessionEndedListeners = new Set<(sessionId: string) => void>();

export function onAdminSessionEnded(listener: (sessionId: string) => void): () => void {
  sessionEndedListeners.add(listener);
  return () => { sessionEndedListeners.delete(listener); };
}

async function publicRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const bounded = (!init.method || init.method.toUpperCase() === "GET")
    || path === "/auth/login" || path === "/auth/refresh" || path === "/auth/logout";
  const controller = bounded && !init.signal ? new AbortController() : null;
  const timeout = controller ? setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS) : null;
  const signal = init.signal ?? controller?.signal;

  try {
    const response = await fetch(`${API_URL}${path}`, {
      ...init,
      signal,
      credentials: "include",
      headers: { Accept: "application/json", "Content-Type": "application/json", ...init.headers }
    });
    const body = await response.json().catch(() => null);
    if (signal?.aborted) throw signal.reason;
    if (response.ok) return body as T;

    const errorBody = body as ErrorResponse | null;
    let message = typeof errorBody?.message === "string" ? errorBody.message : "No fue posible completar la solicitud.";
    // 502/503 con mensaje: un servicio externo (p. ej. el correo) no responde o no está
    // configurado; la API ya explica qué pasa. Los demás 5xx no exponen detalles.
    const explainedOutage = (response.status === 502 || response.status === 503) && typeof errorBody?.message === "string";
    if (response.status >= 500 && !explainedOutage) message = "Leuret no está disponible en este momento. Inténtalo de nuevo en unos minutos.";
    if (response.status === 429) message = "Hubo demasiados intentos. Espera un momento y vuelve a intentarlo.";
    throw new ApiError(message, response.status);
  } catch (error) {
    if (error instanceof ApiError || init.signal?.aborted) throw error;
    if (signal?.aborted) throw new ApiError("Leuret tardó en responder. Inténtalo de nuevo.", 0);
    throw new ApiError("No pudimos conectar con Leuret. Revisa tu conexión e inténtalo de nuevo.", 0);
  } finally {
    if (timeout !== null) clearTimeout(timeout);
  }
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

function endSession(sessionId: string): void {
  if (readStoredSessionId() !== sessionId) return;
  clearSession();
  sessionEndedListeners.forEach((listener) => listener(sessionId));
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
  const renewal = globalThis.navigator?.locks
    ? Promise.resolve(navigator.locks.request(SESSION_KEY, renew))
    : renew();
  const promise = renewal.catch((error: unknown) => {
    if (error instanceof ApiError && (error.status === 401 || error.status === 403)) endSession(sessionId);
    throw error;
  });
  refreshInProgress = { sessionId, promise };

  try {
    return await promise;
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

  const send = (accessToken: string) => publicRequest<T>(path, {
    ...init,
    headers: { ...init.headers, Authorization: `Bearer ${accessToken}` }
  });
  try {
    return await send(session.accessToken);
  } catch (error) {
    if (!(error instanceof ApiError) || error.status !== 401 || !retry) {
      if (path === "/auth/me" && error instanceof ApiError && error.status === 403) endSession(session.sessionId);
      throw error;
    }
    if (readStoredSessionId() !== session.sessionId) throw new ApiError("La sesión cambió.", 401);
    const refreshed = memorySession?.sessionId === session.sessionId && memorySession.accessToken !== session.accessToken
      ? memorySession
      : await refreshSession(session.sessionId);
    try {
      return await send(refreshed.accessToken);
    } catch (retryError) {
      if (retryError instanceof ApiError && (retryError.status === 401
        || (path === "/auth/me" && retryError.status === 403))) endSession(session.sessionId);
      throw retryError;
    }
  }
}

function ensureSuperAdmin(
  session: AdminSession
): AdminSession {
  if (
    !session.user.active ||
    session.user.role !==
    "super_admin"
  ) {
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
  if (memorySession?.sessionId !== sessionId || Date.now() >= memorySession.expiresAt - 30_000) {
    return refreshSession(sessionId);
  }

  const current =
    await authenticatedRequest<{
      user: AdminUser;
    }>("/auth/me");

  if (readStoredSessionId() !== sessionId || memorySession?.sessionId !== sessionId) {
    return null;
  }

  try {
    const session = ensureSuperAdmin({ ...memorySession, user: current.user });
    saveSession(session);
    return session;
  } catch (error) {
    if (error instanceof ApiError && error.status === 403) endSession(sessionId);
    throw error;
  }
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

export type AccountDeletionPreview = {
  canDelete: boolean;
  blockers: { companyId: string; companyName: string; activeMembers: number }[];
  companiesToClose: { companyId: string; companyName: string }[];
  membershipsToEnd: number;
  toDelete: Record<string, number>;
  retained: {
    category: string;
    title: string;
    description: string;
    legalBasis: string;
    retainUntil: string | null;
    counts: Record<string, number>;
  }[];
  retentionUntil: string | null;
};

export async function getAccountDeletionPreview(): Promise<AccountDeletionPreview> {
  return authenticatedRequest<AccountDeletionPreview>("/account/deletion-preview");
}

export async function deleteAccount(): Promise<AccountDeletionResponse> {
  return authenticatedRequest<AccountDeletionResponse>(
    "/account",
    {
      method: "DELETE"
    }
  );
}
