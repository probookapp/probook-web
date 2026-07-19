import { get, set, del } from "idb-keyval";
import type { PersistedClient, Persister } from "@tanstack/react-query-persist-client";

const IDB_KEY_PREFIX = "probook-query-cache";
// Pre-namespacing key (v1) — deleted once on first restore so a stale global
// bucket can never leak one user's data to another on a shared device.
const LEGACY_IDB_KEY = "probook-query-cache";
const SCOPE_STORAGE_KEY = "probook-cache-scope";

/**
 * Current cache scope: the logged-in user's id (users are tenant-scoped, so
 * this also isolates tenants), or "anon" when logged out / unknown.
 */
export function getCacheScope(): string {
  if (typeof window === "undefined") return "anon";
  try {
    return window.localStorage.getItem(SCOPE_STORAGE_KEY) || "anon";
  } catch {
    return "anon";
  }
}

/** Persist the cache scope so it is readable synchronously on cold starts. */
export function setCacheScope(scope: string) {
  try {
    window.localStorage.setItem(SCOPE_STORAGE_KEY, scope);
  } catch {
    // localStorage unavailable (private mode) — persister falls back to "anon"
  }
}

function idbKey(): string {
  return `${IDB_KEY_PREFIX}:${getCacheScope()}`;
}

let legacyKeyCleaned = false;

/**
 * IndexedDB persister for TanStack Query.
 * Stores the query cache in IndexedDB — namespaced per user — so data survives
 * page refreshes and is available on cold starts while offline.
 */
export function createIdbPersister(): Persister {
  return {
    persistClient: async (client: PersistedClient) => {
      try {
        await set(idbKey(), client);
      } catch {
        // DataCloneError on Safari — non-cloneable data in cache, skip persisting
      }
    },
    restoreClient: async () => {
      if (!legacyKeyCleaned) {
        legacyKeyCleaned = true;
        del(LEGACY_IDB_KEY).catch(() => {});
      }
      return await get<PersistedClient>(idbKey());
    },
    removeClient: async () => {
      await del(idbKey());
    },
  };
}

/** Clear the persisted query cache from IndexedDB (e.g. on logout). */
export async function clearPersistedQueryCache() {
  await del(idbKey());
  await del(LEGACY_IDB_KEY);
}
