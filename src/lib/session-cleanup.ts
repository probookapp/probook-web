/**
 * Centralized cleanup for all tenant/user-scoped state.
 * Must be called on logout, login, and signup to prevent
 * cross-tenant data leaks via persisted caches.
 */
import { clearPersistedQueryCache, setCacheScope } from "@/lib/query-persister";
import { clearAllMutations } from "@/lib/offline-mutations";
import { useConflictStore } from "@/stores/useConflictStore";
import type { QueryClient } from "@tanstack/react-query";

/**
 * @param nextScope The user id of the account being logged in (namespaces the
 * persisted query cache and SW API cache), or omitted on logout → "anon".
 */
export async function clearAllUserData(queryClient: QueryClient, nextScope?: string) {
  // 1. In-memory React Query cache
  queryClient.clear();

  // 2. Persisted React Query cache (IndexedDB) — clears the outgoing scope's bucket
  await clearPersistedQueryCache();

  // 3. Unified offline mutation queue (IndexedDB, incl. queued POS sales and
  //    the legacy pre-unification POS store) + in-memory conflict list
  await clearAllMutations();
  useConflictStore.getState().clearConflicts();

  // 4. Switch the cache namespace to the incoming user (or back to "anon")
  const scope = nextScope || "anon";
  setCacheScope(scope);

  // 5. Invalidate service worker API caches and tell it the new cache scope
  if ("serviceWorker" in navigator && navigator.serviceWorker.controller) {
    navigator.serviceWorker.controller.postMessage({ type: "CLEAR_API_CACHE" });
    navigator.serviceWorker.controller.postMessage({ type: "SET_CACHE_SCOPE", scope });
  }
}
