"use client";

import { useSyncExternalStore } from "react";

export type ProductViewMode = "grid" | "list";

/** Remembered per browser: a counter keeps the same layout day after day. */
const STORAGE_KEY = "probook.pos.productView";

/**
 * The product list's layout preference.
 *
 * Read through useSyncExternalStore rather than an effect: the server has no
 * localStorage, so the server snapshot is the default and React reconciles the
 * stored value on the client without a hydration mismatch — and without writing
 * state from inside an effect, which the React Compiler rules reject.
 */
let current: ProductViewMode | null = null;
const listeners = new Set<() => void>();

function read(): ProductViewMode {
  if (current !== null) return current;
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    current = saved === "list" ? "list" : "grid";
  } catch {
    current = "grid"; // private mode, or storage disabled
  }
  return current;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function setProductViewMode(mode: ProductViewMode): void {
  current = mode;
  try {
    window.localStorage.setItem(STORAGE_KEY, mode);
  } catch {
    /* the preference just won't persist */
  }
  for (const listener of listeners) listener();
}

export function useProductViewMode(): [ProductViewMode, (mode: ProductViewMode) => void] {
  const mode = useSyncExternalStore(subscribe, read, () => "grid" as ProductViewMode);
  return [mode, setProductViewMode];
}
