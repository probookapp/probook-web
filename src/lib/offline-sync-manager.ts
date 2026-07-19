// ─── Unified Offline Sync Manager ───
// The ONE replay engine for the unified offline queue (offline-mutations.ts).
// A module-level singleton: started once at app init (Providers), it listens
// for the `online` event and runs a single 30s interval, with an isSyncing
// mutex so loops can never overlap.

import type { QueryClient } from "@tanstack/react-query";
import { buildCommandRequest } from "./api-adapter";
import {
  MAX_RETRIES,
  ensureQueueMigrated,
  getAllMutations,
  getMutation,
  getSyncableMutations,
  removeMutation,
  updateMutation,
  type QueuedMutation,
} from "./offline-mutations";
import { useConflictStore } from "@/stores/useConflictStore";

/**
 * Fired on `window` after a sync pass that replayed at least one queued
 * mutation, so open views (POS, dashboard) can refresh their caches.
 * (Name kept from the pre-unification POS sync engine.)
 */
export const OFFLINE_SYNC_COMPLETE_EVENT = "pos:offline-sync-complete";

/** Fired on `window` whenever a sync run starts or ends ({ isSyncing }). */
export const SYNC_STATE_EVENT = "probook:sync-state";

export interface SyncResult {
  synced: number;
  failed: number;
  conflicts: number;
}

export function isOnline(): boolean {
  return typeof navigator !== "undefined" ? navigator.onLine : true;
}

let queryClient: QueryClient | null = null;
let started = false;
let inFlight: Promise<SyncResult> | null = null;

function dispatchSyncState(isSyncing: boolean): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent(SYNC_STATE_EVENT, { detail: { isSyncing } })
  );
}

export function getIsSyncing(): boolean {
  return inFlight !== null;
}

/** Build the raw HTTP request for a queue item (command-based or legacy). */
function buildRequestFor(item: QueuedMutation): {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: string | undefined;
} {
  if (item.legacyRequest) {
    return {
      url: item.legacyRequest.url,
      method: item.legacyRequest.method,
      headers: item.legacyRequest.headers,
      body:
        item.legacyRequest.method !== "GET"
          ? item.legacyRequest.body ?? undefined
          : undefined,
    };
  }
  const { url, method, body } = buildCommandRequest(item.command, item.args);
  return { url, method, headers: { "Content-Type": "application/json" }, body };
}

function markConflict(item: QueuedMutation, serverData: unknown): Promise<void> {
  item.status = "conflict";
  item.error = "Conflict: record was modified";
  item.conflictServerData = serverData;
  useConflictStore.getState().addConflict({
    id: item.id,
    command: item.command,
    label: item.label,
    serverData,
  });
  return updateMutation(item);
}

async function markHttpFailure(
  item: QueuedMutation,
  message: string
): Promise<void> {
  item.retryCount++;
  item.error = message;
  if (item.retryCount >= MAX_RETRIES) {
    item.status = "failed";
  }
  await updateMutation(item);
}

async function runSync(): Promise<SyncResult> {
  const result: SyncResult = { synced: 0, failed: 0, conflicts: 0 };
  if (!isOnline()) return result;

  const pending = await getSyncableMutations();

  // Replay FIFO; conflicts never block the run.
  for (const item of pending) {
    let request: ReturnType<typeof buildRequestFor>;
    try {
      request = buildRequestFor(item);
    } catch (err) {
      // Unknown/unmappable command: park it as failed for manual triage.
      item.status = "failed";
      item.error = err instanceof Error ? err.message : "Unknown command";
      await updateMutation(item);
      result.failed++;
      continue;
    }

    let res: Response;
    try {
      res = await fetch(request.url, {
        method: request.method,
        headers: request.headers,
        body: request.body,
        credentials: "include", // send auth cookies for replay
      });
    } catch {
      // Network error: still offline — stop this run, keep the rest pending.
      break;
    }

    if (res.ok) {
      await removeMutation(item.id);
      result.synced++;
    } else if (res.status === 409) {
      const serverData: unknown = await res.json().catch(() => ({}));
      await markConflict(item, serverData);
      result.conflicts++;
    } else {
      const text = await res.text().catch(() => "Unknown error");
      await markHttpFailure(item, `HTTP ${res.status}: ${text}`);
      result.failed++;
    }
  }

  if (result.synced > 0) {
    // Broad invalidation: replayed writes can touch any list/detail cache.
    if (queryClient) {
      queryClient.invalidateQueries();
    }
    if (typeof window !== "undefined") {
      window.dispatchEvent(
        new CustomEvent(OFFLINE_SYNC_COMPLETE_EVENT, {
          detail: { synced: result.synced, failed: result.failed },
        })
      );
    }
  }

  return result;
}

/**
 * Run a sync pass now. Mutex-guarded: if a run is already in flight, the
 * caller awaits that run instead of starting an overlapping one.
 */
export function syncNow(): Promise<SyncResult> {
  if (inFlight) return inFlight;

  dispatchSyncState(true);
  inFlight = runSync()
    .catch((): SyncResult => ({ synced: 0, failed: 0, conflicts: 0 }))
    .finally(() => {
      inFlight = null;
      dispatchSyncState(false);
    });
  return inFlight;
}

/**
 * Manually replay a single queued item (FailedMutationsPanel "retry").
 * Skipped while a full run is in flight to avoid double-posting.
 */
export async function replaySingleMutation(id: string): Promise<boolean> {
  if (inFlight) return false;

  const item = await getMutation(id);
  if (!item) return false;

  try {
    const request = buildRequestFor(item);
    const res = await fetch(request.url, {
      method: request.method,
      headers: request.headers,
      body: request.body,
      credentials: "include",
    });
    if (res.ok) {
      await removeMutation(id);
      useConflictStore.getState().removeConflict(id);
      if (queryClient) queryClient.invalidateQueries();
      return true;
    }
    if (res.status === 409) {
      const serverData: unknown = await res.json().catch(() => ({}));
      await markConflict(item, serverData);
      return false;
    }
    const text = await res.text().catch(() => "Unknown error");
    await markHttpFailure(item, `HTTP ${res.status}: ${text}`);
    return false;
  } catch {
    return false;
  }
}

/**
 * Replay a queued item with the force-update header, overwriting the server
 * version (ConflictResolutionModal "apply my changes"). Removes the item and
 * its conflict entry on success.
 */
export async function forceReplayMutation(id: string): Promise<boolean> {
  const item = await getMutation(id);
  if (!item) {
    useConflictStore.getState().removeConflict(id);
    return true;
  }

  try {
    const request = buildRequestFor(item);
    const res = await fetch(request.url, {
      method: request.method,
      headers: { ...request.headers, "X-Force-Update": "true" },
      body: request.body,
      credentials: "include",
    });
    if (res.ok) {
      await removeMutation(id);
      useConflictStore.getState().removeConflict(id);
      if (queryClient) queryClient.invalidateQueries();
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

/** Rehydrate the conflict store from items persisted with status "conflict". */
async function loadPersistedConflicts(): Promise<void> {
  const all = await getAllMutations();
  const store = useConflictStore.getState();
  for (const item of all) {
    if (item.status === "conflict") {
      store.addConflict({
        id: item.id,
        command: item.command,
        label: item.label,
        serverData: item.conflictServerData ?? {},
      });
    }
  }
}

/**
 * Start the singleton sync manager. Idempotent — called from Providers at app
 * init. Owns the ONLY `online` listener and 30s interval that trigger syncs.
 */
export function initSyncManager(client: QueryClient): void {
  queryClient = client;
  if (started || typeof window === "undefined") return;
  started = true;

  ensureQueueMigrated()
    .then(loadPersistedConflicts)
    .catch(() => {});

  window.addEventListener("online", () => {
    syncNow().catch(() => {});
  });

  setInterval(() => {
    if (isOnline()) {
      syncNow().catch(() => {});
    }
  }, 30_000);

  // Catch up on anything queued while the app was closed.
  if (isOnline()) {
    syncNow().catch(() => {});
  }
}
