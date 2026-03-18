"use client";

import { useState, useEffect, useCallback } from "react";
import {
  getPendingMutationCount,
  replayMutations,
} from "@/lib/offline-mutations";
import { cleanupOldMutations } from "@/lib/storage-cleanup";

export function useOnlineStatus() {
  const [isOnline, setIsOnline] = useState(
    typeof navigator !== "undefined" ? navigator.onLine : true
  );
  const [pendingCount, setPendingCount] = useState(0);
  const [isSyncing, setIsSyncing] = useState(false);

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

  // Auto-sync when coming back online
  const sync = useCallback(async () => {
    if (!navigator.onLine || isSyncing) return;
    // Only start sync if there are actually pending mutations
    const pending = await getPendingMutationCount();
    setPendingCount(pending);
    if (pending === 0) return;
    setIsSyncing(true);
    try {
      await replayMutations();
      const count = await getPendingMutationCount();
      setPendingCount(count);
    } finally {
      setIsSyncing(false);
    }
  }, [isSyncing]);

  useEffect(() => {
    if (isOnline && pendingCount > 0) {
      sync();
    }
  }, [isOnline]); // eslint-disable-line react-hooks/exhaustive-deps

  // Also auto-sync periodically when online
  useEffect(() => {
    if (!isOnline) return;

    const id = setInterval(() => {
      if (navigator.onLine) {
        sync();
      }
    }, 30_000);

    return () => clearInterval(id);
  }, [isOnline, sync]);

  return { isOnline, pendingCount, isSyncing, sync };
}
