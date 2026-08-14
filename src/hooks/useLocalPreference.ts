"use client";

import { useSyncExternalStore } from "react";

/**
 * A small on/off preference remembered per browser.
 *
 * Read through useSyncExternalStore rather than an effect: the server has no
 * localStorage, so the server snapshot is the default and React reconciles the
 * stored value on the client without a hydration mismatch — and without writing
 * state from inside an effect, which the React Compiler rules reject.
 */
const cache = new Map<string, boolean>();
const listeners = new Map<string, Set<() => void>>();

function read(key: string, fallback: boolean): boolean {
  const cached = cache.get(key);
  if (cached !== undefined) return cached;
  let value = fallback;
  try {
    const saved = window.localStorage.getItem(key);
    if (saved === "true") value = true;
    else if (saved === "false") value = false;
  } catch {
    /* private mode, or storage disabled */
  }
  cache.set(key, value);
  return value;
}

function subscribe(key: string, listener: () => void): () => void {
  const set = listeners.get(key) ?? new Set();
  set.add(listener);
  listeners.set(key, set);
  return () => set.delete(listener);
}

export function useLocalPreference(
  key: string,
  fallback = false
): [boolean, (value: boolean) => void] {
  const value = useSyncExternalStore(
    (listener) => subscribe(key, listener),
    () => read(key, fallback),
    () => fallback
  );

  const set = (next: boolean) => {
    cache.set(key, next);
    try {
      window.localStorage.setItem(key, String(next));
    } catch {
      /* the preference just won't persist */
    }
    for (const listener of listeners.get(key) ?? []) listener();
  };

  return [value, set];
}
