import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  class ApiError extends Error {
    readonly status: number;
    constructor(message: string, status: number) {
      super(message);
      this.status = status;
    }
  }
  return {
    storage: new Map<string, string>(),
    request: vi.fn(),
    userId: "user-1" as string | null,
    ApiError,
  };
});

vi.mock("@react-native-async-storage/async-storage", () => ({
  default: {
    getItem: vi.fn(async (key: string) => mocks.storage.get(key) ?? null),
    setItem: vi.fn(async (key: string, value: string) => { mocks.storage.set(key, value); }),
    removeItem: vi.fn(async (key: string) => { mocks.storage.delete(key); }),
  },
}));

vi.mock("../api", () => ({
  ApiError: mocks.ApiError,
  authenticatedRequest: mocks.request,
  loadStoredSession: vi.fn(async () => (mocks.userId ? { user: { id: mocks.userId } } : null)),
}));

import {
  flushPendingUserSettings,
  loadSyncedSetting,
  resetUserSettingsMemory,
  saveSyncedSetting,
  serverKeyFor,
} from "../user-settings-service";

const LEGACY = "@contractor-pro/concrete-settings";

function serverReturns(settings: { key: string; value: unknown }[]) {
  mocks.request.mockImplementation(async (url: string, options?: { method?: string }) => {
    if (!options?.method) return { settings: settings.map((item) => ({ ...item, updatedAt: "2026-11-15T00:00:00Z" })) };
    return { setting: {} };
  });
}

/** Deja terminar las subidas en segundo plano (cadenas de promesas). */
async function settle() {
  await vi.runAllTimersAsync();
  for (let index = 0; index < 50; index += 1) await Promise.resolve();
}

const puts = () => mocks.request.mock.calls.filter(([, options]) => options?.method === "PUT");

describe("ajustes sincronizados con el servidor", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mocks.storage.clear();
    mocks.request.mockReset();
    mocks.userId = "user-1";
    resetUserSettingsMemory();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("traduce las claves antiguas de las calculadoras a claves del servidor", () => {
    expect(serverKeyFor(LEGACY)).toBe("calculator.concreto");
    expect(serverKeyFor("@contractor-pro/special-systems-settings")).toBe("calculator.sistemas-especiales");
    expect(serverKeyFor("onboarding.checklist.abc")).toBe("onboarding.checklist.abc");
    expect(serverKeyFor("@contractor-pro/otra-cosa")).toBeNull();
  });

  it("lee el valor del servidor aunque el teléfono tenga otro", async () => {
    mocks.storage.set(LEGACY, JSON.stringify({ wastePercentage: "5" }));
    serverReturns([{ key: "calculator.concreto", value: { wastePercentage: "8" } }]);

    expect(await loadSyncedSetting(LEGACY)).toEqual({ wastePercentage: "8" });
    expect(mocks.request).toHaveBeenCalledWith("/me/settings");
  });

  it("si el servidor no lo tiene, sube lo que estaba solo en el teléfono", async () => {
    mocks.storage.set(LEGACY, JSON.stringify({ wastePercentage: "5" }));
    serverReturns([]);

    expect(await loadSyncedSetting(LEGACY)).toEqual({ wastePercentage: "5" });
    await settle();

    expect(puts()).toEqual([[
      "/me/settings/calculator.concreto",
      { method: "PUT", body: JSON.stringify({ value: { wastePercentage: "5" } }) },
    ]]);
    expect(mocks.storage.has(LEGACY)).toBe(false);
  });

  it("sin conexión usa la copia del dispositivo", async () => {
    mocks.storage.set(LEGACY, JSON.stringify({ wastePercentage: "5" }));
    mocks.request.mockRejectedValue(new Error("Sin conexión"));

    expect(await loadSyncedSetting(LEGACY)).toEqual({ wastePercentage: "5" });
  });

  it("guarda al instante en el teléfono y sube un solo cambio agrupado", async () => {
    serverReturns([]);

    await saveSyncedSetting(LEGACY, { wastePercentage: "6" });
    await saveSyncedSetting(LEGACY, { wastePercentage: "7" });
    expect(puts()).toHaveLength(0);
    await settle();

    expect(puts()).toHaveLength(1);
    expect(puts()[0]![1].body).toBe(JSON.stringify({ value: { wastePercentage: "7" } }));
    expect(mocks.storage.get("@contractor-pro/settings-cache/user-1/calculator.concreto"))
      .toBe(JSON.stringify({ wastePercentage: "7" }));
  });

  it("si la subida falla, queda pendiente y se envía después", async () => {
    mocks.request.mockRejectedValue(new Error("Sin conexión"));
    await saveSyncedSetting(LEGACY, { wastePercentage: "9" });
    await settle();

    serverReturns([]);
    expect(await flushPendingUserSettings()).toBe(0);
    expect(puts().at(-1)![1].body).toBe(JSON.stringify({ value: { wastePercentage: "9" } }));
  });

  it("un cambio pendiente gana sobre el valor viejo del servidor", async () => {
    mocks.request.mockRejectedValue(new Error("Sin conexión"));
    await saveSyncedSetting(LEGACY, { wastePercentage: "4" });
    await settle();

    serverReturns([{ key: "calculator.concreto", value: { wastePercentage: "1" } }]);
    expect(await loadSyncedSetting(LEGACY)).toEqual({ wastePercentage: "4" });
  });

  it("un rechazo del servidor (4xx) no se reintenta para siempre", async () => {
    mocks.request.mockRejectedValue(new mocks.ApiError("Clave no válida", 400));
    await saveSyncedSetting(LEGACY, { wastePercentage: "3" });
    await settle();

    expect(await flushPendingUserSettings()).toBe(0);
  });

  it("los ajustes de cada usuario quedan separados en el dispositivo", async () => {
    serverReturns([]);
    await saveSyncedSetting(LEGACY, { wastePercentage: "2" });
    await settle();

    mocks.userId = "user-2";
    resetUserSettingsMemory();
    mocks.request.mockRejectedValue(new Error("Sin conexión"));
    expect(await loadSyncedSetting(LEGACY)).toBeNull();
  });
});
