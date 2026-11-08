import { afterEach, beforeEach, expect, test, vi } from "vitest";
import {
  cacheOfflineData,
  clearOfflineQueue,
  enqueueOfflineAction,
  getCachedOfflineData,
  getOfflineQueue,
  processOfflineSyncQueue
} from "../offline-sync-service";
import { listProjectProgressHistory, recordProjectProgressHistory } from "../progress-service";
import { createProjectTask, listProjectTasks } from "../task-service";
import { storeSession, type AppProfile } from "../api";

const storageMap = new Map<string, string>();

vi.mock("@react-native-async-storage/async-storage", () => ({
  default: {
    getItem: vi.fn(async (key: string) => storageMap.get(key) ?? null),
    setItem: vi.fn(async (key: string, value: string) => {
      storageMap.set(key, value);
    }),
    removeItem: vi.fn(async (key: string) => {
      storageMap.delete(key);
    })
  }
}));

vi.mock("expo-secure-store", () => ({
  isAvailableAsync: vi.fn(async () => false),
  getItemAsync: vi.fn(),
  setItemAsync: vi.fn(),
  deleteItemAsync: vi.fn()
}));

const fetchMock = vi.fn();

function successfulResponse(body: object = { success: true }): Response {
  return {
    ok: true,
    status: 200,
    json: async () => body
  } as Response;
}

function failedResponse(status: number, message: string): Response {
  return {
    ok: false,
    status,
    json: async () => ({ message })
  } as Response;
}

function mockUser(id: string): AppProfile {
  return {
    id,
    email: `${id}@example.com`,
    full_name: "Usuario de prueba",
    first_name: "Usuario",
    last_name: "Prueba",
    phone: null,
    avatar_url: null,
    role: "contractor",
    active: true,
    province: null,
    district: null,
    corregimiento: null,
    terms_accepted: true,
    notifications_opt_in: false,
    created_at: new Date(0).toISOString(),
    updated_at: new Date(0).toISOString()
  };
}

async function storeMockSession(userId: string): Promise<void> {
  await storeSession({
    accessToken: "mock-access-token",
    refreshToken: "mock-refresh-token",
    expiresAt: Date.now() + 3600000,
    sessionId: `session-${userId}`,
    user: mockUser(userId),
    requiresApproval: false
  });
}

beforeEach(async () => {
  storageMap.clear();
  fetchMock.mockReset();
  fetchMock.mockResolvedValue(successfulResponse());
  vi.stubGlobal("fetch", fetchMock);
  await storeMockSession("user-1");
});

afterEach(() => {
  vi.unstubAllGlobals();
});

test("enqueueOfflineAction y getOfflineQueue: encola y recupera acciones correctamente", async () => {
  await clearOfflineQueue();

  const action = await enqueueOfflineAction({
    type: "RECORD_PROGRESS",
    endpoint: "/companies/comp-1/projects/proj-1/progress-history",
    method: "POST",
    body: { progressPercentage: 45, notes: "Avance de repello" }
  });

  expect(action.id).toBeDefined();
  expect(action.retryCount).toBe(0);

  const queue = await getOfflineQueue();
  expect(queue).toHaveLength(1);
  expect(queue[0].type).toBe("RECORD_PROGRESS");
});

test("cacheOfflineData y getCachedOfflineData: guarda y recupera caché local", async () => {
  const dummyData = [{ id: "task-1", title: "Instalación de tuberías" }];
  await cacheOfflineData("tasks_comp1_proj1", dummyData);

  const cached = await getCachedOfflineData<typeof dummyData>("tasks_comp1_proj1");
  expect(cached).toEqual(dummyData);
});

test("processOfflineSyncQueue: vacía la cola al procesar peticiones exitosas", async () => {
  await clearOfflineQueue();
  await enqueueOfflineAction({
    type: "CREATE_TASK",
    endpoint: "/companies/comp-1/projects/proj-1/tasks",
    method: "POST",
    body: { title: "Tarea en cola" }
  });

  fetchMock.mockResolvedValueOnce(successfulResponse({ task: { id: "t-1" } }));

  const summary = await processOfflineSyncQueue();

  expect(summary.processed).toBe(1);
  expect(summary.succeeded).toBe(1);
  expect(summary.failed).toBe(0);
  expect(summary.remaining).toBe(0);

  const queueAfter = await getOfflineQueue();
  expect(queueAfter).toHaveLength(0);
});

test("recordProjectProgressHistory en modo offline: encola acción y retorna registro optimista", async () => {
  await clearOfflineQueue();
  fetchMock.mockRejectedValueOnce(new Error("Sin conexión a internet"));

  const record = await recordProjectProgressHistory("comp-1", "proj-1", 75, "Fundido de losa");

  expect(record).not.toBeNull();
  expect(record?.progress_percentage).toBe(75);
  expect(record?.is_pending_sync).toBe(true);

  const queue = await getOfflineQueue();
  expect(queue).toHaveLength(1);
  expect(queue[0].type).toBe("RECORD_PROGRESS");

  // Al consultar el historial sin conexión, recupera los datos cacheados
  fetchMock.mockRejectedValueOnce(new Error("Sin conexión a internet"));
  const history = await listProjectProgressHistory("comp-1", "proj-1");
  expect(history.length).toBeGreaterThanOrEqual(1);
  expect(history[0].progress_percentage).toBe(75);
});

test("createProjectTask en modo offline: encola la tarea y retorna objeto optimista", async () => {
  await clearOfflineQueue();
  fetchMock.mockRejectedValueOnce(new Error("Sin conexión a internet"));

  const task = await createProjectTask("comp-1", "proj-1", {
    title: "Vaciado de columnas de concreto",
    priority: "high"
  });

  expect(task).not.toBeNull();
  expect(task?.title).toBe("Vaciado de columnas de concreto");
  expect(task?.is_pending_sync).toBe(true);

  const queue = await getOfflineQueue();
  expect(queue).toHaveLength(1);
  expect(queue[0].type).toBe("CREATE_TASK");

  // Al consultar tareas sin conexión, lee la lista de la caché local
  fetchMock.mockRejectedValueOnce(new Error("Sin conexión a internet"));
  const tasks = await listProjectTasks("comp-1", "proj-1");
  expect(tasks.length).toBeGreaterThanOrEqual(1);
  expect(tasks[0].title).toBe("Vaciado de columnas de concreto");
});

test("la cola y la caché offline quedan aisladas por usuario", async () => {
  await enqueueOfflineAction({
    type: "CREATE_TASK",
    endpoint: "/companies/comp-1/projects/proj-1/tasks",
    method: "POST",
    body: { title: "Solo usuario 1" }
  });
  await cacheOfflineData("tasks_shared", [{ id: "user-1-task" }]);

  await storeMockSession("user-2");
  expect(await getOfflineQueue()).toEqual([]);
  expect(await getCachedOfflineData("tasks_shared")).toBeNull();

  await enqueueOfflineAction({
    type: "CREATE_TASK",
    endpoint: "/companies/comp-2/projects/proj-2/tasks",
    method: "POST",
    body: { title: "Solo usuario 2" }
  });

  await storeMockSession("user-1");
  const userOneQueue = await getOfflineQueue();
  expect(userOneQueue).toHaveLength(1);
  expect(userOneQueue[0].ownerUserId).toBe("user-1");
  expect(await getCachedOfflineData("tasks_shared")).toEqual([{ id: "user-1-task" }]);
});

test("un error 400 no se convierte en una acción offline optimista", async () => {
  fetchMock.mockResolvedValueOnce(failedResponse(400, "Datos inválidos"));

  const task = await createProjectTask("comp-1", "proj-1", {
    title: "Tarea inválida"
  });

  expect(task).toBeNull();
  expect(await getOfflineQueue()).toHaveLength(0);
});

test("una acción que agota los reintentos permanece bloqueada y no se pierde", async () => {
  await enqueueOfflineAction({
    type: "RECORD_PROGRESS",
    endpoint: "/companies/comp-1/projects/proj-1/progress-history",
    method: "POST",
    body: { progressPercentage: 30 }
  });
  fetchMock.mockRejectedValue(new Error("Sin conexión"));

  for (let attempt = 0; attempt < 5; attempt += 1) {
    await processOfflineSyncQueue();
  }

  const queue = await getOfflineQueue();
  expect(queue).toHaveLength(1);
  expect(queue[0].retryCount).toBe(5);
  expect(queue[0].blocked).toBe(true);

  const callsBeforeBlockedRetry = fetchMock.mock.calls.length;
  const summary = await processOfflineSyncQueue();
  expect(fetchMock.mock.calls.length).toBe(callsBeforeBlockedRetry);
  expect(summary.remaining).toBe(1);
});
