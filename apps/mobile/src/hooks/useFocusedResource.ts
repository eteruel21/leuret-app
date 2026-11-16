import { useFocusEffect } from "expo-router";
import { useCallback, useLayoutEffect, useRef, useState } from "react";

type Result<T> = { data?: T; error?: string | null };

type Snapshot<T> = Result<T> & {
  key: string;
  refreshing: boolean;
};

export function useFocusedResource<T>(
  key: string | null,
  fetchData: () => Promise<Result<T>>,
  staleTimeMs = 20_000,
) {
  const [snapshot, setSnapshot] = useState<Snapshot<T> | null>(null);
  const currentKey = useRef(key);
  const fetched = useRef<{ key: string; at: number } | null>(null);
  const pending = useRef<{ key: string; token: symbol } | null>(null);

  useLayoutEffect(() => {
    currentKey.current = key;
    return () => {
      currentKey.current = null;
      pending.current = null;
      fetched.current = null;
    };
  }, [key]);

  const load = useCallback(async (force: boolean) => {
    if (!key || currentKey.current !== key) return;
    if (!force && (
      pending.current?.key === key ||
      (fetched.current?.key === key && Date.now() - fetched.current.at < staleTimeMs)
    )) return;

    const token = Symbol();
    pending.current = { key, token };
    setSnapshot((current) => ({
      key,
      data: current?.key === key ? current.data : undefined,
      refreshing: true,
    }));

    let result: Result<T>;
    try {
      result = await fetchData();
    } catch (error) {
      result = { error: error instanceof Error ? error.message : "Inténtalo de nuevo." };
    }

    if (currentKey.current !== key || pending.current?.token !== token) return;
    pending.current = null;
    const error = result.error ?? (result.data === undefined ? "Inténtalo de nuevo para cargar los datos." : null);
    fetched.current = error ? null : { key, at: Date.now() };
    setSnapshot((current) => ({
      key,
      data: result.data ?? (current?.key === key ? current.data : undefined),
      error,
      refreshing: false,
    }));
  }, [fetchData, key, staleTimeMs]);

  useFocusEffect(useCallback(() => { void load(false); }, [load]));

  const current = snapshot?.key === key ? snapshot : null;
  const reload = useCallback(() => load(true), [load]);
  const updateData = useCallback((update: (data: T) => T) => {
    if (!key || currentKey.current !== key) return;
    // A response from before a confirmed write cannot replace the new data.
    pending.current = null;
    setSnapshot((previous) => previous?.key === key && previous.data !== undefined
      ? { ...previous, data: update(previous.data), refreshing: false }
      : previous);
  }, [key]);
  return {
    data: current?.data,
    error: current?.error ?? null,
    loading: Boolean(key && current?.data === undefined && !current?.error),
    refreshing: Boolean(current?.refreshing),
    reload,
    updateData,
  };
}
