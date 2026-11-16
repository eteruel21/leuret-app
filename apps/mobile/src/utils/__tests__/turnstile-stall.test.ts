import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  createTurnstileStallGuard,
  TURNSTILE_STALL_MS,
} from "../turnstile-stall";

describe("createTurnstileStallGuard", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("avisa si el widget no responde en 15 s", () => {
    const onStall = vi.fn();
    const guard = createTurnstileStallGuard(onStall);

    vi.advanceTimersByTime(TURNSTILE_STALL_MS - 1);
    expect(onStall).not.toHaveBeenCalled();
    expect(guard.isPending()).toBe(true);

    vi.advanceTimersByTime(1);
    expect(onStall).toHaveBeenCalledTimes(1);
    expect(guard.isPending()).toBe(false);
  });

  it("no avisa cuando Turnstile pide la casilla antes de los 15 s", () => {
    const onStall = vi.fn();
    const guard = createTurnstileStallGuard(onStall);

    vi.advanceTimersByTime(3_000);
    // before-interactive-callback: la persona tiene el control.
    guard.stop();
    vi.advanceTimersByTime(TURNSTILE_STALL_MS * 4);

    expect(onStall).not.toHaveBeenCalled();
    expect(guard.isPending()).toBe(false);
  });

  it("no avisa después de recibir el token", () => {
    const onStall = vi.fn();
    const guard = createTurnstileStallGuard(onStall);

    guard.stop();
    vi.advanceTimersByTime(TURNSTILE_STALL_MS);

    expect(onStall).not.toHaveBeenCalled();
  });

  it("detenerlo varias veces o después del aviso no falla ni repite el aviso", () => {
    const onStall = vi.fn();
    const guard = createTurnstileStallGuard(onStall, 1_000);

    vi.advanceTimersByTime(1_000);
    guard.stop();
    guard.stop();
    vi.advanceTimersByTime(5_000);

    expect(onStall).toHaveBeenCalledTimes(1);
  });
});
