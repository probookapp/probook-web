import { getAllMutations, discardMutation, getPendingMutationCount } from "./offline-mutations";

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * Remove successfully synced mutations older than 30 days from IndexedDB.
 * Only removes mutations that are no longer pending/failed (i.e., stale entries).
 */
export async function cleanupOldMutations(): Promise<number> {
  const all = await getAllMutations();
  const cutoff = Date.now() - THIRTY_DAYS_MS;
  let cleaned = 0;

  for (const mutation of all) {
    const ts = new Date(mutation.timestamp).getTime();
    if (ts < cutoff) {
      // Remove old failed mutations that have exhausted retries
      if (mutation.status === "failed" && mutation.retryCount >= 10) {
        await discardMutation(mutation.id);
        cleaned++;
      }
      // Remove mutations stuck in "syncing" status (crash recovery)
      if (mutation.status === "syncing") {
        await discardMutation(mutation.id);
        cleaned++;
      }
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
