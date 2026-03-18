import { get, set, del } from "idb-keyval";
import type { PersistedClient, Persister } from "@tanstack/react-query-persist-client";

const IDB_KEY = "probook-query-cache";

/**
 * IndexedDB persister for TanStack Query.
 * Stores the entire query cache in IndexedDB so data survives
 * page refreshes and is available on cold starts while offline.
 */
export function createIdbPersister(): Persister {
  return {
    persistClient: async (client: PersistedClient) => {
      await set(IDB_KEY, client);
    },
    restoreClient: async () => {
      return await get<PersistedClient>(IDB_KEY);
    },
    removeClient: async () => {
      await del(IDB_KEY);
    },
  };
}

/** Clear the persisted query cache from IndexedDB (e.g. on logout). */
export async function clearPersistedQueryCache() {
  await del(IDB_KEY);
}
