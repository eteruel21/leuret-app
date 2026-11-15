import AsyncStorage from "@react-native-async-storage/async-storage";

import { ApiError, authenticatedRequest, loadStoredSession } from "./api";

/**
 * Ajustes del usuario guardados en PostgreSQL (`/me/settings`, migración 047)
 * con copia en el dispositivo.
 *
 * - Al abrir: se lee del servidor; sin conexión, se usa la copia local.
 * - Al cambiar: se guarda en el dispositivo al instante y se sube al servidor
 *   (agrupado, ~1 s). Si falla, queda pendiente y se reintenta al volver a la
 *   app o al abrir otra calculadora.
 * - La primera vez, un valor que solo estaba en el teléfono se sube.
 */

/** Claves antiguas de AsyncStorage → clave en el servidor. */
export const CALCULATOR_SETTING_KEYS: Record<string, string> = {
  "@contractor-pro/concrete-settings": "calculator.concreto",
  "@contractor-pro/masonry-settings": "calculator.bloques-repello",
  "@contractor-pro/gypsum-settings": "calculator.gypsum",
  "@contractor-pro/pvc-ceiling-settings": "calculator.cielo-raso-pvc",
  "@contractor-pro/paint-settings": "calculator.pintura",
  "@contractor-pro/electrical-settings": "calculator.electricidad",
  "@contractor-pro/flooring-settings": "calculator.pisos",
  "@contractor-pro/mdf-settings": "calculator.muebles-mdf",
  "@contractor-pro/air-conditioning-settings": "calculator.aire-acondicionado",
  "@contractor-pro/special-systems-settings": "calculator.sistemas-especiales",
};

export const SERVER_SETTING_KEY = /^(calculator|onboarding|ui)\.[a-z0-9][a-z0-9._-]{0,59}$/;

const CACHE_PREFIX = "@contractor-pro/settings-cache/";
const PENDING_PREFIX = "@contractor-pro/settings-pending/";
const SNAPSHOT_TTL_MS = 60_000;
const UPLOAD_DELAY_MS = 900;

type SettingValue = Record<string, unknown>;
type ServerSetting = { key: string; value: unknown; updatedAt: string };

export function serverKeyFor(key: string): string | null {
  const mapped = CALCULATOR_SETTING_KEYS[key] ?? key;
  return SERVER_SETTING_KEY.test(mapped) ? mapped : null;
}

function isObject(value: unknown): value is SettingValue {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

async function currentUserId(): Promise<string | null> {
  try {
    const session = await loadStoredSession();
    return session?.user?.id ?? null;
  } catch {
    return null;
  }
}

async function readJson<T>(key: string): Promise<T | null> {
  try {
    const raw = await AsyncStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

async function writeJson(key: string, value: unknown): Promise<void> {
  try {
    await AsyncStorage.setItem(key, JSON.stringify(value));
  } catch {
    // La copia local es una ayuda; la fuente es el servidor.
  }
}

// Copia del servidor en memoria (una consulta por minuto como máximo).
let snapshot: { userId: string; at: number; values: Map<string, unknown> } | null = null;
let snapshotRequest: Promise<Map<string, unknown> | null> | null = null;

async function remoteSettings(userId: string): Promise<Map<string, unknown> | null> {
  if (snapshot && snapshot.userId === userId && Date.now() - snapshot.at < SNAPSHOT_TTL_MS) {
    return snapshot.values;
  }
  if (!snapshotRequest) {
    snapshotRequest = (async () => {
      try {
        const res = await authenticatedRequest<{ settings: ServerSetting[] }>("/me/settings");
        const values = new Map((res.settings ?? []).map((item) => [item.key, item.value]));
        snapshot = { userId, at: Date.now(), values };
        return values;
      } catch {
        return null;
      } finally {
        snapshotRequest = null;
      }
    })();
  }
  return snapshotRequest;
}

// Subidas pendientes: se guardan en el dispositivo para no perderlas.
const timers = new Map<string, ReturnType<typeof setTimeout>>();

async function pendingFor(userId: string): Promise<Record<string, SettingValue>> {
  return (await readJson<Record<string, SettingValue>>(`${PENDING_PREFIX}${userId}`)) ?? {};
}

async function setPending(userId: string, serverKey: string, value: SettingValue | null): Promise<void> {
  const pending = await pendingFor(userId);
  if (value) pending[serverKey] = value;
  else delete pending[serverKey];
  await writeJson(`${PENDING_PREFIX}${userId}`, pending);
}

async function upload(userId: string, serverKey: string, value: SettingValue): Promise<boolean> {
  try {
    await authenticatedRequest(`/me/settings/${encodeURIComponent(serverKey)}`, {
      method: "PUT",
      body: JSON.stringify({ value }),
    });
    if (snapshot?.userId === userId) snapshot.values.set(serverKey, value);
    const pending = await pendingFor(userId);
    // Solo se borra si no cambió mientras se subía.
    if (JSON.stringify(pending[serverKey]) === JSON.stringify(value)) {
      await setPending(userId, serverKey, null);
    }
    return true;
  } catch (error) {
    // 4xx (clave o valor inválidos): reintentar no lo arregla.
    if (error instanceof ApiError && error.status >= 400 && error.status < 500 && error.status !== 408 && error.status !== 429) {
      await setPending(userId, serverKey, null);
    }
    return false;
  }
}

/** Sube los ajustes pendientes. Devuelve cuántos quedan por subir. */
export async function flushPendingUserSettings(): Promise<number> {
  const userId = await currentUserId();
  if (!userId) return 0;
  const pending = await pendingFor(userId);
  const entries = Object.entries(pending);
  for (const [serverKey, value] of entries) {
    await upload(userId, serverKey, value);
  }
  return Object.keys(await pendingFor(userId)).length;
}

/**
 * Lee un ajuste. `key` puede ser la clave antigua de AsyncStorage de una
 * calculadora o una clave del servidor (`onboarding.…`).
 */
export async function loadSyncedSetting<T extends object>(key: string): Promise<T | null> {
  const serverKey = serverKeyFor(key);
  const userId = await currentUserId();
  const cacheKey = serverKey && userId ? `${CACHE_PREFIX}${userId}/${serverKey}` : key;
  const cached = await readJson<T>(cacheKey);
  // Valor de antes de esta versión (sin usuario en la clave).
  const legacy = cached ?? (key !== cacheKey ? await readJson<T>(key) : null);
  if (!serverKey || !userId) return legacy;

  const pending = await pendingFor(userId);
  if (pending[serverKey]) {
    // Hay un cambio sin subir: es el más reciente.
    void upload(userId, serverKey, pending[serverKey]);
    return pending[serverKey] as unknown as T;
  }

  const remote = await remoteSettings(userId);
  if (!remote) return legacy; // Sin conexión: copia del dispositivo.

  if (remote.has(serverKey)) {
    const value = remote.get(serverKey);
    if (isObject(value)) {
      await writeJson(cacheKey, value);
      return value as unknown as T;
    }
    return legacy;
  }

  // El servidor no lo tiene: se sube lo que había en el teléfono.
  if (isObject(legacy)) {
    await writeJson(cacheKey, legacy);
    await setPending(userId, serverKey, legacy);
    void upload(userId, serverKey, legacy).then((ok) => {
      if (ok && key !== cacheKey) void AsyncStorage.removeItem(key).catch(() => undefined);
    });
  }
  return legacy;
}

/** Guarda un ajuste en el dispositivo y lo sube al servidor. */
export async function saveSyncedSetting<T extends object>(key: string, value: T): Promise<void> {
  const serverKey = serverKeyFor(key);
  const userId = await currentUserId();
  if (!serverKey || !userId || !isObject(value)) {
    await writeJson(key, value);
    return;
  }
  await writeJson(`${CACHE_PREFIX}${userId}/${serverKey}`, value);
  await setPending(userId, serverKey, value);

  const timerKey = `${userId}/${serverKey}`;
  const previous = timers.get(timerKey);
  if (previous) clearTimeout(previous);
  timers.set(timerKey, setTimeout(() => {
    timers.delete(timerKey);
    void pendingFor(userId).then((pending) => {
      const latest = pending[serverKey];
      if (latest) void upload(userId, serverKey, latest);
    });
  }, UPLOAD_DELAY_MS));
}

/** Solo para pruebas. */
export function resetUserSettingsMemory(): void {
  snapshot = null;
  snapshotRequest = null;
  for (const timer of timers.values()) clearTimeout(timer);
  timers.clear();
}
