/**
 * Centralized cleanup for all tenant/user-scoped state.
 * Must be called on logout, login, and signup to prevent
 * cross-tenant data leaks via persisted caches.
 */
import { clearPersistedQueryCache } from "@/lib/query-persister";
import { clearAllMutations } from "@/lib/offline-mutations";
import { clearAll as clearOfflinePosQueue } from "@/lib/offline-queue";
import type { QueryClient } from "@tanstack/react-query";

export async function clearAllUserData(queryClient: QueryClient) {
  // 1. In-memory React Query cache
  queryClient.clear();

  // 2. Persisted React Query cache (IndexedDB)
  await clearPersistedQueryCache();

  // 3. Offline mutation queue (IndexedDB)
  await clearAllMutations();

  // 4. Offline POS transaction queue (IndexedDB)
  await clearOfflinePosQueue();

  // 5. Invalidate service worker API caches
  if ("serviceWorker" in navigator && navigator.serviceWorker.controller) {
    navigator.serviceWorker.controller.postMessage({ type: "CLEAR_API_CACHE" });
  }
}
