// ─── Unified Offline Mutation Queue (IndexedDB via idb-keyval) ───
// The single queue for ALL queueable writes, including POS sales.
// apiCall enqueues here on network failure (and throws OfflineQueuedError);
// src/lib/offline-sync-manager.ts replays the queue when connectivity returns.

import { get, set, del, keys } from "idb-keyval";

// Keep the historical store prefix so items queued before the unification
// survive the deploy (they are normalized in place by the init migration).
const QUEUE_PREFIX = "probook-mutation-";

/** Legacy raw-IndexedDB POS queue (pre-unification). Drained once, then deleted. */
const LEGACY_POS_DB_NAME = "probook-offline";
const LEGACY_POS_STORE_NAME = "pending-transactions";
const LEGACY_POS_MIGRATED_FLAG = "probook:pos-queue-migrated";

export const MAX_RETRIES = 10;

export type QueuedMutationStatus = "pending" | "conflict" | "failed";

export interface QueuedMutation {
  id: string;
  /** apiCall command name (COMMAND_MAP key), or "legacy_request" for pre-unification items. */
  command: string;
  /** The exact args apiCall was invoked with (empty for legacy items). */
  args: Record<string, unknown>;
  queuedAt: string;
  retryCount: number;
  /**
   * pending  → will be replayed by the next sync run
   * conflict → hit a 409; waiting for the user (ConflictResolutionModal)
   * failed   → exhausted MAX_RETRIES; manual retry/discard only
   */
  status: QueuedMutationStatus;
  error?: string;
  /** Human-readable label shown in the offline indicator / conflict modal */
  label?: string;
  /** Server payload captured on a 409, shown by the conflict modal. */
  conflictServerData?: unknown;
  /** Raw request captured by the pre-unification generic queue; replayed verbatim. */
  legacyRequest?: {
    url: string;
    method: string;
    headers: Record<string, string>;
    body: string | null;
  };
}

/** Shape of items written by the pre-unification generic queue. */
interface LegacyQueuedMutation {
  id: string;
  timestamp: string;
  url: string;
  method: string;
  headers: Record<string, string>;
  body: string | null;
  retryCount: number;
  status: "pending" | "syncing" | "failed";
  error?: string;
  label?: string;
}

/** Shape of items stored by the legacy raw-IndexedDB POS queue. */
interface LegacyPosTransaction {
  id?: number;
  /** Forwarded verbatim on replay, including idempotency_key and variant_id. */
  data: Record<string, unknown>;
  createdAt: string;
  status: "pending" | "syncing" | "failed";
  error?: string;
  retryCount: number;
}

function mutationKey(id: string) {
  return `${QUEUE_PREFIX}${id}`;
}

function newId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

// ─── One-time migration ───

function isLegacyItem(
  item: QueuedMutation | LegacyQueuedMutation
): item is LegacyQueuedMutation {
  return !("command" in item) && "url" in item;
}

/** Normalize a pre-unification generic-queue item into the unified shape. */
function upgradeLegacyItem(old: LegacyQueuedMutation): QueuedMutation {
  const retryCount = old.retryCount ?? 0;
  return {
    id: old.id,
    command: "legacy_request",
    args: {},
    queuedAt: old.timestamp,
    retryCount,
    // Old "failed" items below the cap were still auto-retried; keep that.
    // "syncing" was a transient status (crash recovery) → back to pending.
    status:
      old.status === "failed" && retryCount >= MAX_RETRIES ? "failed" : "pending",
    error: old.error,
    label: old.label,
    legacyRequest: {
      url: old.url,
      method: old.method,
      headers: old.headers,
      body: old.body,
    },
  };
}

/** Read every entry from the legacy POS store (empty if the DB/store is missing). */
function readLegacyPosEntries(): Promise<LegacyPosTransaction[]> {
  return new Promise((resolve) => {
    const request = indexedDB.open(LEGACY_POS_DB_NAME);
    request.onupgradeneeded = () => {
      // DB did not exist before this open — nothing to drain.
    };
    request.onerror = () => resolve([]);
    request.onsuccess = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(LEGACY_POS_STORE_NAME)) {
        db.close();
        resolve([]);
        return;
      }
      const tx = db.transaction(LEGACY_POS_STORE_NAME, "readonly");
      const getAll = tx.objectStore(LEGACY_POS_STORE_NAME).getAll();
      getAll.onsuccess = () => {
        const entries = getAll.result as LegacyPosTransaction[];
        db.close();
        resolve(entries);
      };
      getAll.onerror = () => {
        db.close();
        resolve([]);
      };
    };
  });
}

function deleteLegacyPosDb(): Promise<void> {
  return new Promise((resolve) => {
    const request = indexedDB.deleteDatabase(LEGACY_POS_DB_NAME);
    request.onsuccess = () => resolve();
    request.onerror = () => resolve();
    request.onblocked = () => resolve();
  });
}

/** Drain the legacy POS queue into the unified queue, then delete its DB. */
async function migrateLegacyPosQueue(): Promise<void> {
  if (typeof indexedDB === "undefined") return;
  try {
    if (localStorage.getItem(LEGACY_POS_MIGRATED_FLAG)) return;
  } catch {
    // localStorage unavailable — fall through and migrate (idempotent enough:
    // draining an already-deleted DB yields no entries).
  }

  const entries = await readLegacyPosEntries();
  for (const entry of entries) {
    const retryCount = entry.retryCount ?? 0;
    const item: QueuedMutation = {
      id: newId(),
      command: "create_pos_transaction",
      // Same args shape apiCall("create_pos_transaction", { input }) uses.
      // entry.data is preserved verbatim, incl. idempotency_key & variant_id.
      args: { input: entry.data },
      queuedAt: entry.createdAt,
      retryCount,
      status: retryCount >= MAX_RETRIES ? "failed" : "pending",
      error: entry.error,
      label: "create pos transaction",
    };
    await set(mutationKey(item.id), item);
  }

  await deleteLegacyPosDb();
  try {
    localStorage.setItem(LEGACY_POS_MIGRATED_FLAG, "1");
  } catch {
    // Best effort; the DB is gone either way.
  }
}

/** Normalize any pre-unification generic-queue items in place. */
async function migrateLegacyGenericItems(): Promise<void> {
  const allKeys = await keys();
  for (const key of allKeys) {
    if (typeof key !== "string" || !key.startsWith(QUEUE_PREFIX)) continue;
    const item = await get<QueuedMutation | LegacyQueuedMutation>(key);
    if (item && isLegacyItem(item)) {
      await set(key, upgradeLegacyItem(item));
    }
  }
}

let migrationPromise: Promise<void> | null = null;

/** Idempotent one-time migration; every public queue API awaits it. */
export function ensureQueueMigrated(): Promise<void> {
  if (!migrationPromise) {
    migrationPromise = (async () => {
      await migrateLegacyGenericItems();
      await migrateLegacyPosQueue();
    })().catch(() => {
      // Never block queue usage on a migration failure; retry next call.
      migrationPromise = null;
    });
  }
  return migrationPromise;
}

// ─── Queue CRUD ───

/**
 * Enqueue a command for later replay. Called by apiCall when a queueable
 * write fails with a network error (the caller then receives OfflineQueuedError).
 */
export async function queueCommand(
  command: string,
  args: Record<string, unknown>,
  label?: string
): Promise<string> {
  await ensureQueueMigrated();

  const entry: QueuedMutation = {
    id: newId(),
    command,
    args,
    queuedAt: new Date().toISOString(),
    retryCount: 0,
    status: "pending",
    label: label ?? command.replace(/_/g, " "),
  };

  await set(mutationKey(entry.id), entry);

  // Notify listeners (OfflineIndicator, POS badge) about the new mutation.
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("probook:mutation-queued"));
  }

  return entry.id;
}

export async function getAllMutations(): Promise<QueuedMutation[]> {
  await ensureQueueMigrated();

  const allKeys = await keys();
  const mutationKeys = allKeys.filter(
    (k) => typeof k === "string" && k.startsWith(QUEUE_PREFIX)
  );

  const entries: QueuedMutation[] = [];
  for (const key of mutationKeys) {
    const entry = await get<QueuedMutation>(key);
    if (entry) entries.push(entry);
  }

  return entries.sort(
    (a, b) => new Date(a.queuedAt).getTime() - new Date(b.queuedAt).getTime()
  );
}

/** Every unresolved item (pending, conflict, failed), FIFO. */
export async function getPendingMutations(): Promise<QueuedMutation[]> {
  return getAllMutations();
}

/** Items eligible for automatic replay (FIFO). */
export async function getSyncableMutations(): Promise<QueuedMutation[]> {
  const all = await getAllMutations();
  return all.filter((m) => m.status === "pending");
}

/** Unified pending badge count: everything not yet synced or resolved. */
export async function getPendingMutationCount(): Promise<number> {
  const pending = await getPendingMutations();
  return pending.length;
}

export async function getMutation(
  id: string
): Promise<QueuedMutation | undefined> {
  await ensureQueueMigrated();
  return get<QueuedMutation>(mutationKey(id));
}

export async function updateMutation(mutation: QueuedMutation): Promise<void> {
  await set(mutationKey(mutation.id), mutation);
}

export async function removeMutation(id: string): Promise<void> {
  await del(mutationKey(id));
}

export async function discardMutation(id: string): Promise<void> {
  await removeMutation(id);
}

export async function clearAllMutations(): Promise<void> {
  const allKeys = await keys();
  for (const key of allKeys) {
    if (typeof key === "string" && key.startsWith(QUEUE_PREFIX)) {
      await del(key);
    }
  }
  // Also wipe the legacy POS DB in case the migration never ran (e.g. logout
  // on a device that predates the unification).
  if (typeof indexedDB !== "undefined") {
    await deleteLegacyPosDb();
  }
}
