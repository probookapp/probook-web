import {
  getAllMutations,
  discardMutation,
  getPendingMutationCount,
  MAX_RETRIES,
} from "./offline-mutations";

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * Remove stale queue entries from IndexedDB: failed mutations older than 30
 * days that exhausted their retries. Pending and conflict items are kept —
 * pending still syncs, conflicts wait for the user.
 */
export async function cleanupOldMutations(): Promise<number> {
  const all = await getAllMutations();
  const cutoff = Date.now() - THIRTY_DAYS_MS;
  let cleaned = 0;

  for (const mutation of all) {
    const ts = new Date(mutation.queuedAt).getTime();
    if (
      ts < cutoff &&
      mutation.status === "failed" &&
      mutation.retryCount >= MAX_RETRIES
    ) {
      await discardMutation(mutation.id);
      cleaned++;
    }
  }

  return cleaned;
}

/**
 * Check pending mutation count and return warning level.
 * Returns null if ok, or { level, count } if there's a warning.
 */
export async function getStorageWarning(): Promise<{
  level: "warning" | "critical";
  count: number;
} | null> {
  const count = await getPendingMutationCount();

  if (count > 400) {
    return { level: "critical", count };
  }
  if (count > 200) {
    return { level: "warning", count };
  }
  return null;
}
