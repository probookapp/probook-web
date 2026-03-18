"use client";

import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import { useTranslation } from "react-i18next";
import { WifiOff, RefreshCw, CloudOff, Check, AlertTriangle } from "lucide-react";
import { useState, useEffect } from "react";
import { FailedMutationsPanel } from "@/components/shared/FailedMutationsPanel";
import { getStorageWarning } from "@/lib/storage-cleanup";

export function OfflineIndicator() {
  const { isOnline, pendingCount, isSyncing, sync } = useOnlineStatus();
  const { t } = useTranslation("common");
  const [justSynced, setJustSynced] = useState(false);
  const [wasSyncing, setWasSyncing] = useState(false);
  const [storageWarning, setStorageWarning] = useState<{ level: "warning" | "critical"; count: number } | null>(null);

  // Check storage warning periodically
  useEffect(() => {
    const check = async () => {
      const warning = await getStorageWarning();
      setStorageWarning(warning);
    };
    check();
    const id = setInterval(check, 15000);
    return () => clearInterval(id);
  }, []);

  // Track sync state transitions
  useEffect(() => {
    if (isSyncing) {
      setWasSyncing(true);
    } else if (wasSyncing) {
      setWasSyncing(false);
      setJustSynced(true);
    }
  }, [isSyncing, wasSyncing]);

  // Auto-dismiss the "synced" banner after 3 seconds
  useEffect(() => {
    if (isOnline && pendingCount === 0 && !isSyncing && justSynced) {
      const timeout = setTimeout(() => setJustSynced(false), 3000);
      return () => clearTimeout(timeout);
    }
  }, [isOnline, pendingCount, isSyncing, justSynced]);

  const showMainIndicator = !isOnline || isSyncing || pendingCount > 0;
  const showSyncedBanner = isOnline && pendingCount === 0 && justSynced && !isSyncing;

  // Nothing to show at all
  if (!showMainIndicator && !showSyncedBanner && !storageWarning) {
    return null;
  }

  // Just synced successfully (and no storage warning)
  if (showSyncedBanner && !storageWarning) {
    return (
      <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 px-4 py-2 rounded-full bg-green-600 text-white text-sm font-medium shadow-lg animate-in fade-in slide-in-from-bottom-2">
        <Check className="h-4 w-4" />
        {t("offline.synced")}
      </div>
    );
  }

  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 flex flex-col items-center gap-2 max-w-md w-full px-4">
      {/* Storage warning */}
      {storageWarning && (
        <div
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium shadow-lg w-full ${
            storageWarning.level === "critical"
              ? "bg-red-600 text-white"
              : "bg-yellow-500 text-white"
          }`}
        >
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span>
            {t(`storage.${storageWarning.level}`, {
              count: storageWarning.count,
            })}
          </span>
        </div>
      )}

      {/* Failed mutations panel */}
      <div className="w-full">
        <FailedMutationsPanel />
      </div>

      {/* Main status indicator */}
      {showMainIndicator && (
      <div
        className={`flex items-center gap-3 px-4 py-2.5 rounded-full text-sm font-medium shadow-lg ${
          isOnline
            ? "bg-blue-600 text-white"
            : "bg-amber-500 text-white"
        }`}
      >
        {!isOnline ? (
          <>
            <WifiOff className="h-4 w-4" />
            <span>
              {t("offline.working_offline")}
              {pendingCount > 0 && (
                <span className="ml-1 opacity-80">
                  ({pendingCount} {t("offline.pending")})
                </span>
              )}
            </span>
          </>
        ) : isSyncing ? (
          <>
            <RefreshCw className="h-4 w-4 animate-spin" />
            <span>{t("offline.syncing")}</span>
          </>
        ) : pendingCount > 0 ? (
          <>
            <CloudOff className="h-4 w-4" />
            <span>
              {pendingCount} {t("offline.pending_changes")}
            </span>
            <button
              onClick={sync}
              className="ml-1 px-2 py-0.5 rounded bg-white/20 hover:bg-white/30 transition-colors"
            >
              {t("offline.sync_now")}
            </button>
          </>
        ) : null}
      </div>
      )}
    </div>
  );
}
