"use client";

import { useState, useEffect, useCallback } from "react";
import { getPendingMutationCount } from "@/lib/offline-mutations";
import {
  syncNow,
  getIsSyncing,
  SYNC_STATE_EVENT,
} from "@/lib/offline-sync-manager";
import { cleanupOldMutations } from "@/lib/storage-cleanup";

/**
 * Connectivity + unified-queue status for the UI. Sync scheduling itself
 * (online event + 30s interval) is owned by the offline sync manager
 * singleton; this hook only reflects its state and exposes a manual trigger.
 */
export function useOnlineStatus() {
  const [isOnline, setIsOnline] = useState(
    typeof navigator !== "undefined" ? navigator.onLine : true
  );
  const [pendingCount, setPendingCount] = useState(0);
  const [isSyncing, setIsSyncing] = useState(getIsSyncing);

  // Track online/offline state
  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  // Run cleanup on mount
  useEffect(() => {
    cleanupOldMutations().catch(() => {});
  }, []);

  // Poll pending mutation count + listen for immediate queued events
  useEffect(() => {
    const update = () => {
      getPendingMutationCount().then(setPendingCount).catch(() => {});
    };

    update();
    const id = setInterval(update, 5000);

    // Immediately update count when a new mutation is queued
    const handleQueued = () => update();
    window.addEventListener("probook:mutation-queued", handleQueued);

    return () => {
      clearInterval(id);
      window.removeEventListener("probook:mutation-queued", handleQueued);
    };
  }, []);

  // Mirror the sync manager's mutex state (and refresh the count after runs)
  useEffect(() => {
    const handleSyncState = (event: Event) => {
      const detail = (event as CustomEvent<{ isSyncing: boolean }>).detail;
      setIsSyncing(detail.isSyncing);
      if (!detail.isSyncing) {
        getPendingMutationCount().then(setPendingCount).catch(() => {});
      }
    };
    window.addEventListener(SYNC_STATE_EVENT, handleSyncState);
    return () => window.removeEventListener(SYNC_STATE_EVENT, handleSyncState);
  }, []);

  // Manual "Sync now": delegate to the singleton (mutex-guarded there)
  const sync = useCallback(async () => {
    if (!navigator.onLine) return;
    await syncNow();
    const count = await getPendingMutationCount();
    setPendingCount(count);
  }, []);

  return { isOnline, pendingCount, isSyncing, sync };
}
