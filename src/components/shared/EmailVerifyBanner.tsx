"use client";

import { useState } from "react";
import { useTranslation } from "react-i18next";
import { MailWarning, X } from "lucide-react";
import { useAuthStore } from "@/stores/useAuthStore";
import { authApi } from "@/lib/api";

/**
 * In-app nudge for users whose email isn't verified yet. Without this, a user
 * could spend the whole trial unaware verification exists, then hit a hard wall
 * at subscribe time. Only shown when the account has an (unverified) email —
 * email-less legacy accounts add their address at the subscribe step instead.
 */
export function EmailVerifyBanner() {
  const { t } = useTranslation("common");
  const { currentUser } = useAuthStore();
  const [dismissed, setDismissed] = useState(false);
  const [state, setState] = useState<"idle" | "ok" | "err">("idle");
  const [sending, setSending] = useState(false);

  if (dismissed) return null;
  if (!currentUser?.email || currentUser.email_verified !== false) return null;

  const resend = async () => {
    setSending(true);
    setState("idle");
    try {
      await authApi.resendVerification();
      setState("ok");
    } catch {
      setState("err");
    } finally {
      setSending(false);
    }
  };

  const message =
    state === "ok" ? t("emailVerify.sent") : state === "err" ? t("emailVerify.error") : t("emailVerify.banner");

  return (
    <div className="bg-amber-50 dark:bg-amber-900/20 border-b border-amber-200 dark:border-amber-800">
      <div className="max-w-7xl mx-auto px-4 py-2 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0 text-sm text-amber-800 dark:text-amber-200">
          <MailWarning className="h-4 w-4 shrink-0" />
          <span className="truncate">{message}</span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {state !== "ok" && (
            <button
              onClick={resend}
              disabled={sending}
              className="text-xs font-medium bg-amber-200/60 hover:bg-amber-200 dark:bg-amber-800/60 dark:hover:bg-amber-800 rounded-md px-3 py-1.5 transition-colors disabled:opacity-50"
            >
              {t("emailVerify.resend")}
            </button>
          )}
          <button
            onClick={() => setDismissed(true)}
            aria-label={t("emailVerify.dismiss")}
            className="text-amber-700 dark:text-amber-300 hover:opacity-70"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
