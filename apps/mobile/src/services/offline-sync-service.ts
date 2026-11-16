import AsyncStorage from "@react-native-async-storage/async-storage";
import { ApiError, authenticatedRequest, loadStoredSession } from "./api";

const OFFLINE_QUEUE_PREFIX = "contractor_pro_offline_queue_v2_";
const OFFLINE_CACHE_PREFIX = "contractor_pro_cache_v1_";
const MAX_SYNC_RETRIES = 5;

export type QueuedActionType =
  | "RECORD_PROGRESS"
  | "CREATE_TASK"
  | "UPDATE_TASK"
  | "DELETE_TASK"
  | "RECORD_PAYMENT";

export type QueuedOfflineAction = {
  id: string;
  type: QueuedActionType;
  endpoint: string;
  method: "POST" | "PUT" | "PATCH" | "DELETE";
  body: Record<string, unknown>;
  ownerUserId: string;
  createdAt: string;
  retryCount: number;
  blocked?: boolean;
  lastError?: string;
};

export type SyncResultSummary = {
  processed: number;
  succeeded: number;
  failed: number;
  remaining: number;
};

/**
 * Obtiene la lista actual de acciones pendientes en la cola offline.
 */
async function currentUserId(): Promise<string | null> {
  const session = await loadStoredSession();
  return session?.user?.id ?? null;
}

function queueKey(userId: string): string {
  return `${OFFLINE_QUEUE_PREFIX}${userId}`;
}

export function isRetryableOfflineError(error: unknown): boolean {
  if (!(error instanceof ApiError)) return true;
  return error.status === 0 || error.status === 408 || error.status === 429 || error.status >= 500;
}

export async function getOfflineQueue(): Promise<QueuedOfflineAction[]> {
  const userId = await currentUserId();
  if (!userId) return [];

  try {
    const raw = await AsyncStorage.getItem(queueKey(userId));
    if (!raw) return [];
    return (JSON.parse(raw) as QueuedOfflineAction[]).filter(
      (action) => action.ownerUserId === userId
    );
  } catch {
    return [];
  }
}

/**
 * Guarda la cola actualizada de acciones en almacenamiento local.
 */
async function saveOfflineQueue(userId: string, queue: QueuedOfflineAction[]): Promise<void> {
  try {
    await AsyncStorage.setItem(queueKey(userId), JSON.stringify(queue));
  } catch (error) {
    console.error("Error al guardar cola offline:", error);
  }
}

/**
 * Encola una nueva acción para ejecución posterior cuando vuelva la señal.
 */
export async function enqueueOfflineAction(
  action: Omit<QueuedOfflineAction, "id" | "ownerUserId" | "createdAt" | "retryCount" | "blocked" | "lastError">
): Promise<QueuedOfflineAction> {
  const userId = await currentUserId();
  if (!userId) {
    throw new Error("No hay una sesión activa para guardar la acción offline.");
  }

  const newAction: QueuedOfflineAction = {
    ...action,
    id: `off_${Date.now()}_${Math.floor(Math.random() * 10000)}`,
    ownerUserId: userId,
    createdAt: new Date().toISOString(),
    retryCount: 0
  };

  const queue = await getOfflineQueue();
  queue.push(newAction);
  await saveOfflineQueue(userId, queue);

  return newAction;
}

/**
 * Elimina una acción específica de la cola.
 */
export async function removeOfflineAction(actionId: string): Promise<void> {
  const userId = await currentUserId();
  if (!userId) return;
  const queue = await getOfflineQueue();
  const updated = queue.filter((a) => a.id !== actionId);
  await saveOfflineQueue(userId, updated);
}

/**
 * Limpia totalmente la cola de acciones offline.
 */
export async function clearOfflineQueue(): Promise<void> {
  const userId = await currentUserId();
  if (!userId) return;
  try {
    await AsyncStorage.removeItem(queueKey(userId));
  } catch (error) {
    console.error("Error al limpiar cola offline:", error);
  }
}

export type OfflineQueueSummary = {
  pending: number;
  blocked: number;
  lastError: string | null;
};

/** Cambios hechos sin conexión que aún no llegan al servidor. */
export async function getOfflineQueueSummary(): Promise<OfflineQueueSummary> {
  const queue = await getOfflineQueue();
  const blocked = queue.filter((action) => action.blocked);
  return {
    pending: queue.length - blocked.length,
    blocked: blocked.length,
    lastError: blocked[blocked.length - 1]?.lastError ?? null
  };
}

/** Vuelve a intentar las acciones bloqueadas (el usuario lo pide). */
export async function retryBlockedOfflineActions(): Promise<void> {
  const userId = await currentUserId();
  if (!userId) return;
  const queue = await getOfflineQueue();
  await saveOfflineQueue(userId, queue.map((action) => (
    action.blocked ? { ...action, blocked: false, retryCount: 0 } : action
  )));
}

/** Descarta las acciones que el servidor rechazó. */
export async function discardBlockedOfflineActions(): Promise<void> {
  const userId = await currentUserId();
  if (!userId) return;
  const queue = await getOfflineQueue();
  await saveOfflineQueue(userId, queue.filter((action) => !action.blocked));
}

let syncInFlight: Promise<SyncResultSummary> | null = null;

/**
 * Procesa en lote todas las acciones acumuladas en la cola offline. Si ya hay
 * una sincronización en curso, devuelve esa misma (evita enviar dos veces).
 */
export function processOfflineSyncQueue(): Promise<SyncResultSummary> {
  if (!syncInFlight) {
    syncInFlight = runOfflineSync().finally(() => {
      syncInFlight = null;
    });
  }
  return syncInFlight;
}

async function runOfflineSync(): Promise<SyncResultSummary> {
  const userId = await currentUserId();
  if (!userId) {
    return { processed: 0, succeeded: 0, failed: 0, remaining: 0 };
  }

  const queue = await getOfflineQueue();
  if (queue.length === 0) {
    return { processed: 0, succeeded: 0, failed: 0, remaining: 0 };
  }

  let succeeded = 0;
  let failed = 0;
  const remainingQueue: QueuedOfflineAction[] = [];

  for (const action of queue) {
    if (action.blocked) {
      remainingQueue.push(action);
      continue;
    }

    try {
      await authenticatedRequest(action.endpoint, {
        method: action.method,
        body: JSON.stringify(action.body)
      });
      succeeded++;
    } catch (error) {
      failed++;
      const retryCount = action.retryCount + 1;
      remainingQueue.push({
        ...action,
        retryCount,
        blocked: retryCount >= MAX_SYNC_RETRIES || !isRetryableOfflineError(error),
        lastError: error instanceof Error ? error.message : "No fue posible sincronizar la acción."
      });
    }
  }

  // Acciones encoladas mientras se sincronizaba: no se pierden.
  const processedIds = new Set(queue.map((action) => action.id));
  const addedMeanwhile = (await getOfflineQueue()).filter((action) => !processedIds.has(action.id));
  await saveOfflineQueue(userId, [...remainingQueue, ...addedMeanwhile]);

  return {
    processed: queue.length,
    succeeded,
    failed,
    remaining: remainingQueue.length + addedMeanwhile.length
  };
}

/**
 * Guarda en caché local los datos consultados para uso sin conexión.
 */
export async function cacheOfflineData<T>(cacheKey: string, data: T): Promise<void> {
  const userId = await currentUserId();
  if (!userId) return;
  try {
    await AsyncStorage.setItem(
      cacheKeyForUser(userId, cacheKey),
      JSON.stringify({
        timestamp: Date.now(),
        data
      })
    );
  } catch (error) {
    console.error("Error al guardar caché offline:", error);
  }
}

/**
 * Obtiene los datos guardados en caché local cuando no hay conexión.
 */
export async function getCachedOfflineData<T>(cacheKey: string): Promise<T | null> {
  const userId = await currentUserId();
  if (!userId) return null;
  try {
    const raw = await AsyncStorage.getItem(cacheKeyForUser(userId, cacheKey));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { data: T };
    return parsed.data;
  } catch {
    return null;
  }
}

function cacheKeyForUser(userId: string, key: string): string {
  return `${OFFLINE_CACHE_PREFIX}${userId}_${key}`;
}
