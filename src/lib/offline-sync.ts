// ─── Offline Sync Engine ───

import { API_BASE_URL } from "./config";
import {
  getPendingTransactions,
  markSynced,
  markFailed,
} from "./offline-queue";

const MAX_RETRIES = 5;

/**
 * Fired on `window` after a sync pass that replayed at least one queued
 * transaction, so open views (POS, dashboard) can refresh their caches.
 */
export const OFFLINE_SYNC_COMPLETE_EVENT = "pos:offline-sync-complete";

export function isOnline(): boolean {
  return typeof navigator !== "undefined" ? navigator.onLine : true;
}

export async function syncOfflineTransactions(): Promise<{
  synced: number;
  failed: number;
}> {
  if (!isOnline()) return { synced: 0, failed: 0 };

  const pending = await getPendingTransactions();
  let synced = 0;
  let failed = 0;

  for (const tx of pending) {
    if (tx.retryCount >= MAX_RETRIES) {
      failed++;
      continue;
    }

    try {
      // tx.data is forwarded verbatim, including idempotency_key and each
      // line's variant_id — the server dedupes replays on the key.
      const res = await fetch(`${API_BASE_URL}/api/pos/transactions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(tx.data),
      });

      if (res.ok) {
        await markSynced(tx.id!);
        synced++;
      } else {
        const text = await res.text().catch(() => "Unknown error");
        await markFailed(tx.id!, `HTTP ${res.status}: ${text}`);
        failed++;
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Network error";
      await markFailed(tx.id!, message);
      failed++;
    }
  }

  // Let open views know server state changed so they can refetch stale caches.
  if (synced > 0 && typeof window !== "undefined") {
    window.dispatchEvent(
      new CustomEvent(OFFLINE_SYNC_COMPLETE_EVENT, { detail: { synced, failed } })
    );
  }

  return { synced, failed };
}

export function startAutoSync(intervalMs = 30_000): () => void {
  const id = setInterval(async () => {
    if (isOnline()) {
      await syncOfflineTransactions().catch(() => {});
    }
  }, intervalMs);

  // Also sync when coming back online
  const onlineHandler = () => {
    syncOfflineTransactions().catch(() => {});
  };
  window.addEventListener("online", onlineHandler);

  return () => {
    clearInterval(id);
    window.removeEventListener("online", onlineHandler);
  };
}
