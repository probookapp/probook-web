// ─── Offline Sync Engine ───

import { API_BASE_URL } from "./config";
import {
  getPendingTransactions,
  markSynced,
  markFailed,
} from "./offline-queue";

const MAX_RETRIES = 5;

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
