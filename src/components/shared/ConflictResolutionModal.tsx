"use client";

import { useState } from "react";
import { useTranslation } from "react-i18next";
import { AlertTriangle } from "lucide-react";
import { Button, Modal } from "@/components/ui";
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

  // The shared Modal, not dismissible: the queued change waits on a choice,
  // so there is no close button and a click outside does not count as one.
  const title = conflicts.length > 1 ? `${t("conflict.title")} (1/${conflicts.length})` : t("conflict.title");

  return (
    <Modal isOpen onClose={() => {}} title={title} size="md" dismissible={false}>
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-yellow-100 dark:bg-yellow-900/30">
          <AlertTriangle className="h-5 w-5 text-yellow-600 dark:text-yellow-400" />
        </div>
        <div className="min-w-0 space-y-2 wrap-anywhere">
          <p className="text-sm text-(--color-text-secondary)">{t("conflict.description")}</p>
          {conflict.label && (
            <p className="text-sm text-(--color-text-tertiary)">
              {t("conflict.details", { label: conflict.label })}
            </p>
          )}
        </div>
      </div>

      <div className="mt-6 flex flex-col gap-2">
        <Button onClick={handleApplyMine} disabled={isApplying} isLoading={isApplying} className="w-full">
          {t("conflict.applyMine")}
        </Button>
        <Button variant="secondary" onClick={handleKeepNewer} disabled={isApplying} className="w-full">
          {t("conflict.keepNewer")}
        </Button>
      </div>
    </Modal>
  );
}
