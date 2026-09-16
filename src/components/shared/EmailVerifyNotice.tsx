"use client";

import { useState } from "react";
import { useTranslation } from "react-i18next";
import { MailWarning, X } from "lucide-react";
import { useAuthStore } from "@/stores/useAuthStore";
import { authApi } from "@/lib/api";
import { isApiError } from "@/lib/api-adapter";
import { cn } from "@/lib/utils";

/**
 * In-app nudge for users whose email isn't verified yet. Without this, a user
 * could spend the whole trial unaware verification exists, then hit a hard wall
 * at subscribe time. Only shown when the account has an (unverified) email —
 * email-less legacy accounts add their address at the subscribe step instead.
 *
 * Two shapes, one piece of content. When something more urgent owns the top
 * strip this renders as a card inside the dashboard instead of a second stacked
 * bar; the wording and the actions are identical either way, so whichever shape
 * a user meets, they meet the same notice.
 */
export function useEmailVerifyNeeded(): boolean {
  const { currentUser } = useAuthStore();
  return !!currentUser?.email && currentUser.email_verified === false;
}

export function EmailVerifyNotice({ variant = "bar" }: { variant?: "bar" | "card" }) {
  const { t } = useTranslation("common");
  const needed = useEmailVerifyNeeded();
  const [dismissed, setDismissed] = useState(false);
  const [state, setState] = useState<"idle" | "ok" | "throttled" | "err">("idle");
  const [sending, setSending] = useState(false);

  if (dismissed || !needed) return null;

  const resend = async () => {
    setSending(true);
    setState("idle");
    try {
      await authApi.resendVerification();
      setState("ok");
    } catch (err) {
      // A 429 means we already sent one (the signup email counts) — saying
      // "couldn't send" would be a lie that sends users hunting for a fault.
      setState(isApiError(err, 429) ? "throttled" : "err");
    } finally {
      setSending(false);
    }
  };

  const message =
    state === "ok"
      ? t("emailVerify.sent")
      : state === "throttled"
        ? t("emailVerify.throttled")
        : state === "err"
          ? t("emailVerify.error")
          : t("emailVerify.banner");

  const actions = (
    <div className="flex items-center gap-1 lg:gap-2 shrink-0">
      {state !== "ok" && (
        <button
          onClick={resend}
          disabled={sending}
          className="min-h-10 lg:min-h-0 text-xs font-medium rounded-md px-3 py-1.5 transition-colors disabled:opacity-50 bg-warning-100 hover:bg-warning-200 text-warning-800 dark:bg-warning-900 dark:hover:bg-warning-800 dark:text-warning-100"
        >
          {t("emailVerify.resend")}
        </button>
      )}
      <button
        onClick={() => setDismissed(true)}
        aria-label={t("emailVerify.dismiss")}
        // The icon is 16px; the target around it is not, below lg.
        className="-me-2 lg:me-0 p-3 lg:p-1 rounded-md text-warning-700 dark:text-warning-300 hover:opacity-70"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );

  if (variant === "card") {
    return (
      <div className="rounded-lg border border-warning-200 bg-warning-50 dark:border-warning-800 dark:bg-warning-950 px-4 py-3">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0 text-sm text-warning-800 dark:text-warning-200">
            <MailWarning className="h-4 w-4 shrink-0" />
            <span>{message}</span>
          </div>
          {actions}
        </div>
      </div>
    );
  }

  return (
    <div className={cn("bg-warning-50 dark:bg-warning-950 border-b border-warning-200 dark:border-warning-800")}>
      <div className="px-4 sm:px-6 lg:px-8 py-1 lg:py-2 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0 text-sm text-warning-800 dark:text-warning-200">
          <MailWarning className="h-4 w-4 shrink-0" />
          <span className="truncate">{message}</span>
        </div>
        {actions}
      </div>
    </div>
  );
}
