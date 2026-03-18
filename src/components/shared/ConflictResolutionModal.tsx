"use client";

import { useState, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { AlertTriangle } from "lucide-react";
import { discardMutation, type QueuedMutation } from "@/lib/offline-mutations";

interface ConflictDetail {
  mutation: QueuedMutation;
  serverData: Record<string, unknown>;
}

export function ConflictResolutionModal() {
  const { t } = useTranslation("common");
  const [conflict, setConflict] = useState<ConflictDetail | null>(null);
  const [isApplying, setIsApplying] = useState(false);

  const handleConflict = useCallback((event: Event) => {
    const detail = (event as CustomEvent<ConflictDetail>).detail;
    setConflict(detail);
  }, []);

  useEffect(() => {
    window.addEventListener("probook:conflict", handleConflict);
    return () => {
      window.removeEventListener("probook:conflict", handleConflict);
    };
  }, [handleConflict]);

  const resolve = useCallback(() => {
    setConflict(null);
    window.dispatchEvent(new CustomEvent("probook:conflict-resolved"));
  }, []);

  const handleApplyMine = async () => {
    if (!conflict) return;
    setIsApplying(true);

    try {
      const { mutation } = conflict;
      const headers = { ...mutation.headers, "X-Force-Update": "true" };

      const res = await fetch(mutation.url, {
        method: mutation.method,
        headers,
        body: mutation.method !== "GET" ? mutation.body : undefined,
        credentials: "include",
      });

      if (res.ok) {
        await discardMutation(mutation.id);
      }
    } catch {
      // If force update fails, mutation stays in queue
    } finally {
      setIsApplying(false);
      resolve();
    }
  };

  const handleKeepNewer = async () => {
    if (!conflict) return;
    await discardMutation(conflict.mutation.id);
    resolve();
  };

  if (!conflict) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl p-6 max-w-md w-full mx-4">
        <div className="flex items-center gap-3 mb-4">
          <div className="flex items-center justify-center w-10 h-10 rounded-full bg-yellow-100 dark:bg-yellow-900/30">
            <AlertTriangle className="h-5 w-5 text-yellow-600 dark:text-yellow-400" />
          </div>
          <h3 className="text-lg font-semibold">{t("conflict.title")}</h3>
        </div>

        <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">
          {t("conflict.description")}
        </p>

        {conflict.mutation.label && (
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
            {t("conflict.details", { label: conflict.mutation.label })}
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
