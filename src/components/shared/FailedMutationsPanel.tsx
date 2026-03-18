"use client";

import { useState, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { AlertTriangle, RefreshCw, Trash2, ChevronDown, ChevronUp } from "lucide-react";
import {
  getPendingMutations,
  replaySingleMutation,
  discardMutation,
  replayMutations,
  clearAllMutations,
  type QueuedMutation,
} from "@/lib/offline-mutations";

export function FailedMutationsPanel() {
  const { t } = useTranslation("common");
  const [mutations, setMutations] = useState<QueuedMutation[]>([]);
  const [expanded, setExpanded] = useState(false);
  const [retryingId, setRetryingId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const pending = await getPendingMutations();
    setMutations(pending.filter((m) => m.status === "failed"));
  }, []);

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 5000);
    return () => clearInterval(id);
  }, [refresh]);

  if (mutations.length === 0) return null;

  const handleRetry = async (id: string) => {
    setRetryingId(id);
    await replaySingleMutation(id);
    setRetryingId(null);
    await refresh();
  };

  const handleDiscard = async (id: string) => {
    await discardMutation(id);
    await refresh();
  };

  const handleRetryAll = async () => {
    await replayMutations();
    await refresh();
  };

  const handleDiscardAll = async () => {
    await clearAllMutations();
    await refresh();
  };

  return (
    <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-4 py-3 text-sm font-medium text-red-800 dark:text-red-200"
      >
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-4 w-4" />
          <span>
            {t("offline.failedMutations")} ({mutations.length})
          </span>
        </div>
        {expanded ? (
          <ChevronUp className="h-4 w-4" />
        ) : (
          <ChevronDown className="h-4 w-4" />
        )}
      </button>

      {expanded && (
        <div className="px-4 pb-3 space-y-2">
          {/* Bulk actions */}
          <div className="flex gap-2 mb-2">
            <button
              onClick={handleRetryAll}
              className="text-xs px-2 py-1 bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300 rounded hover:bg-red-200 dark:hover:bg-red-900/60 transition-colors"
            >
              {t("offline.retryAll")}
            </button>
            <button
              onClick={handleDiscardAll}
              className="text-xs px-2 py-1 bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300 rounded hover:bg-red-200 dark:hover:bg-red-900/60 transition-colors"
            >
              {t("offline.discardAll")}
            </button>
          </div>

          {/* Individual mutations */}
          {mutations.map((mutation) => (
            <div
              key={mutation.id}
              className="flex items-center justify-between gap-2 bg-white dark:bg-gray-800 rounded px-3 py-2 text-xs"
            >
              <div className="min-w-0 flex-1">
                <p className="font-medium truncate">
                  {mutation.label || mutation.url}
                </p>
                <p className="text-gray-500 dark:text-gray-400">
                  {new Date(mutation.timestamp).toLocaleString()} &middot;{" "}
                  {t("offline.retries", { count: mutation.retryCount })}
                </p>
                {mutation.error && (
                  <p className="text-red-600 dark:text-red-400 truncate mt-0.5">
                    {t("offline.error")}: {mutation.error}
                  </p>
                )}
              </div>
              <div className="flex gap-1 shrink-0">
                <button
                  onClick={() => handleRetry(mutation.id)}
                  disabled={retryingId === mutation.id}
                  className="p-1.5 text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded transition-colors disabled:opacity-50"
                  title={t("offline.retry")}
                >
                  <RefreshCw
                    className={`h-3.5 w-3.5 ${retryingId === mutation.id ? "animate-spin" : ""}`}
                  />
                </button>
                <button
                  onClick={() => handleDiscard(mutation.id)}
                  className="p-1.5 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition-colors"
                  title={t("offline.discard")}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
