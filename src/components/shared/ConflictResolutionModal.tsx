"use client";

import { useState } from "react";
import { useTranslation } from "react-i18next";
import { AlertTriangle } from "lucide-react";
import { discardMutation } from "@/lib/offline-mutations";
import { forceReplayMutation } from "@/lib/offline-sync-manager";
import { useConflictStore } from "@/stores/useConflictStore";
import { toast } from "@/stores/useToastStore";

/**
 * Resolves offline-queue conflicts one at a time, keyed by queue item id.
 * The conflict list lives in useConflictStore (fed by the sync manager), so
 * unmounting this modal never blocks the sync loop — conflicts simply wait.
 */
export function ConflictResolutionModal() {
  const { t } = useTranslation("common");
  const conflicts = useConflictStore((s) => s.conflicts);
  const removeConflict = useConflictStore((s) => s.removeConflict);
  const [isApplying, setIsApplying] = useState(false);

  const conflict = conflicts[0] ?? null;
  if (!conflict) return null;

  const handleApplyMine = async () => {
    setIsApplying(true);
    try {
      // Force-replays this item with X-Force-Update; on success it is removed
      // from both the queue and the conflict list.
      const ok = await forceReplayMutation(conflict.id);
      if (!ok) {
        // Item stays queued as a conflict; the user can retry later.
        toast.error(t("errors.somethingWentWrong"));
      }
    } finally {
      setIsApplying(false);
    }
  };

  const handleKeepNewer = async () => {
    await discardMutation(conflict.id);
    removeConflict(conflict.id);
  };

  return (
    <div className="fixed inset-0 z-100 flex items-center justify-center bg-black/50">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl p-6 max-w-md w-full mx-4">
        <div className="flex items-center gap-3 mb-4">
          <div className="flex items-center justify-center w-10 h-10 rounded-full bg-yellow-100 dark:bg-yellow-900/30">
            <AlertTriangle className="h-5 w-5 text-yellow-600 dark:text-yellow-400" />
          </div>
          <h3 className="text-lg font-semibold">
            {t("conflict.title")}
            {conflicts.length > 1 && (
              <span className="ml-2 text-sm font-normal text-gray-500 dark:text-gray-400">
                (1/{conflicts.length})
              </span>
            )}
          </h3>
        </div>

        <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">
          {t("conflict.description")}
        </p>

        {conflict.label && (
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
            {t("conflict.details", { label: conflict.label })}
          </p>
        )}

        <div className="flex flex-col gap-2 mt-6">
          <button
            onClick={handleApplyMine}
            disabled={isApplying}
            className="w-full px-4 py-2.5 bg-primary-600 text-white rounded-lg hover:bg-primary-700 font-medium disabled:opacity-50 transition-colors"
          >
            {t("conflict.applyMine")}
          </button>
          <button
            onClick={handleKeepNewer}
            disabled={isApplying}
            className="w-full px-4 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 font-medium transition-colors"
          >
            {t("conflict.keepNewer")}
          </button>
        </div>
      </div>
    </div>
  );
}
