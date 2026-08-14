"use client";

import { useTranslation } from "react-i18next";
import { AlertTriangle, Clock, Eye } from "lucide-react";
import { useDemoMode } from "@/components/providers/DemoModeProvider";
import { EmailVerifyNotice, useEmailVerifyNeeded } from "./EmailVerifyNotice";

/**
 * One strip, never a stack.
 *
 * Four notices could be true at once — demo mode, a subscription about to
 * lapse, the trial countdown, an unverified address — and each used to render
 * its own full-width bar. On a 390 px phone that was ninety pixels of warning
 * above the first line of content, and the pile-up made every one of them
 * easier to ignore than any single one would have been.
 *
 * So the bar carries exactly the most urgent notice. The order below is by what
 * stops working, not by what shouts loudest: seeing someone else's data beats
 * losing access, losing access beats a countdown, and a countdown beats a
 * chore. Whatever the bar does not take is not lost — see `useDemotedNotices`.
 */
export type NoticeKind = "demo" | "expiry" | "trial" | "emailVerify";

function useActiveNotices(): NoticeKind[] {
  const { isDemoMode, isInTrial, expiryDays } = useDemoMode();
  const emailVerify = useEmailVerifyNeeded();

  const active: NoticeKind[] = [];
  if (isDemoMode) active.push("demo");
  if (expiryDays !== null) active.push("expiry");
  if (isInTrial) active.push("trial");
  if (emailVerify) active.push("emailVerify");
  return active;
}

/**
 * Notices the bar could not fit, for pages that give them a home of their own.
 * The dashboard renders these; nothing is silently dropped.
 */
export function useDemotedNotices(): NoticeKind[] {
  return useActiveNotices().slice(1);
}

export function NoticeBar() {
  const { t } = useTranslation("common");
  const { trialDaysLeft, expiryDays, openPlans } = useDemoMode();
  const [top] = useActiveNotices();

  if (!top) return null;

  if (top === "emailVerify") return <EmailVerifyNotice variant="bar" />;

  if (top === "demo") {
    return (
      <Strip
        tone="info"
        icon={<Eye className="h-4 w-4 shrink-0 opacity-80" />}
        message={
          <>
            <span className="hidden sm:inline">{t("demo.banner")}</span>
            <span className="sm:hidden">{t("demo.bannerShort")}</span>
          </>
        }
        action={
          <StripAction onClick={openPlans}>
            <span className="hidden sm:inline">{t("demo.viewPlans")}</span>
            <span className="sm:hidden">{t("demo.subscribe")}</span>
          </StripAction>
        }
      />
    );
  }

  if (top === "expiry") {
    return (
      <Strip
        tone="warning"
        icon={<AlertTriangle className="h-4 w-4 shrink-0" />}
        message={t("subscription.expiryWarning", { days: expiryDays })}
      />
    );
  }

  const days = trialDaysLeft ?? 0;
  return (
    <Strip
      tone="warning"
      icon={<Clock className="h-4 w-4 shrink-0 opacity-90" />}
      message={days <= 0 ? t("subscription.trialLastDay") : t("subscription.trialBanner", { days })}
      action={<StripAction onClick={openPlans}>{t("subscription.trialSubscribe")}</StripAction>}
    />
  );
}

/**
 * Tinted, not saturated. A solid ochre band across the top of every page has
 * the weight of an error, which a ten-day countdown is not.
 */
const TONES = {
  info: "bg-info-50 text-info-800 border-info-200 dark:bg-info-950 dark:text-info-200 dark:border-info-800",
  warning:
    "bg-warning-50 text-warning-800 border-warning-200 dark:bg-warning-950 dark:text-warning-200 dark:border-warning-800",
} as const;

function Strip({
  tone,
  icon,
  message,
  action,
}: {
  tone: keyof typeof TONES;
  icon: React.ReactNode;
  message: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className={`border-b ${TONES[tone]}`}>
      <div className="max-w-7xl mx-auto px-4 py-2 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0 text-sm font-medium">
          {icon}
          <span className="truncate">{message}</span>
        </div>
        {action}
      </div>
    </div>
  );
}

function StripAction({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className="shrink-0 text-xs font-medium rounded-md px-3 py-1.5 transition-colors bg-current/10 hover:bg-current/20"
    >
      {children}
    </button>
  );
}
