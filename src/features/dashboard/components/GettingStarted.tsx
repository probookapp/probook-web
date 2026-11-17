import { useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Check, ChevronDown } from "lucide-react";
import { authApi, type OnboardingProgress } from "@/lib/api";
import { useLocale } from "@/lib/navigation";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/stores/useAuthStore";
import { useTourStore } from "@/stores/useTourStore";
import { useTourCompletion } from "@/components/tour/useTourCompletion";
import type { PermissionAction, PermissionKey } from "@/types";

const COLLAPSED_KEY = "probook-checklist-collapsed";

/**
 * Folded or not, as the person last left it. Without a choice yet it starts
 * open on a wide screen and folded on a phone, where five open lines would
 * cover half the dashboard.
 */
function readCollapsed() {
  try {
    const stored = localStorage.getItem(COLLAPSED_KEY);
    if (stored !== null) return stored === "1";
  } catch {
    // Storage blocked: fall through to the screen-size default.
  }
  return typeof window !== "undefined" && window.matchMedia("(max-width: 767px)").matches;
}

/** Circumference of the progress ring (r = 15). */
const RING = 2 * Math.PI * 15;

/**
 * "Getting started": the account's first five steps, on the dashboard, once
 * the office tour has been seen or skipped. Each line ticks itself when the
 * thing exists, links to where it is done, and is left out for whoever is not
 * allowed to do it. Goes away when everything is done or the person hides it.
 */
export function GettingStarted() {
  const { t } = useTranslation("dashboard");
  const locale = useLocale();
  const hasPermission = useAuthStore((s) => s.hasPermission);
  const tourActive = useTourStore((s) => s.active !== null);
  const officePostponed = useTourStore((s) => s.officePostponed);
  const { isDone: officeSeen } = useTourCompletion("office");
  const { isDone: hidden, markDone: hide } = useTourCompletion("checklist");
  const [collapsed, setCollapsed] = useState(readCollapsed);

  // After the office tour (seen, skipped or put off with "Later"), until
  // hidden. Not a tour itself, so it does not wait for a person the way tours
  // do in an automated browser.
  const wanted = (officeSeen || officePostponed) && !hidden;
  const { data: progress } = useQuery({
    queryKey: ["onboarding-progress"],
    queryFn: () => authApi.getOnboardingProgress(),
    enabled: wanted,
    staleTime: 0,
  });

  if (!wanted || !progress || tourActive) return null;

  const items: { key: keyof OnboardingProgress; label: string; href: string; permission: PermissionKey; action: PermissionAction }[] = [
    { key: "company_setup", label: t("gettingStarted.companySetup"), href: "/settings", permission: "settings", action: "edit" },
    { key: "first_client", label: t("gettingStarted.firstClient"), href: "/clients", permission: "clients", action: "create" },
    { key: "first_product", label: t("gettingStarted.firstProduct"), href: "/products", permission: "products", action: "create" },
    { key: "first_quote", label: t("gettingStarted.firstQuote"), href: "/quotes/new", permission: "quotes", action: "create" },
    { key: "first_invoice", label: t("gettingStarted.firstInvoice"), href: "/invoices/new", permission: "invoices", action: "create" },
  ];
  const mine = items.filter((item) => hasPermission(item.permission, item.action));
  const done = mine.filter((item) => progress[item.key]).length;
  if (mine.length === 0 || done === mine.length) return null;

  const toggle = () => {
    const next = !collapsed;
    setCollapsed(next);
    try {
      localStorage.setItem(COLLAPSED_KEY, next ? "1" : "0");
    } catch {
      // Private mode: the choice lasts as long as this page.
    }
  };

  return (
    <section
      // data-fab: the layout leaves room under the page for it on a phone.
      data-fab
      aria-labelledby="getting-started-title"
      className="fixed z-30 bottom-[max(1rem,env(safe-area-inset-bottom))] inset-x-4 md:inset-x-auto md:end-6 md:w-80 rounded-xl border border-(--color-border-primary) bg-(--color-bg-elevated) shadow-xl"
    >
      <button
        type="button"
        onClick={toggle}
        aria-expanded={!collapsed}
        className="flex w-full items-center gap-3 px-4 py-3 text-start"
      >
        <svg viewBox="0 0 36 36" className="h-8 w-8 shrink-0 -rotate-90" aria-hidden>
          <circle cx="18" cy="18" r="15" fill="none" strokeWidth="4" className="stroke-(--color-border-primary)" />
          <circle
            cx="18"
            cy="18"
            r="15"
            fill="none"
            strokeWidth="4"
            strokeLinecap="round"
            strokeDasharray={RING}
            strokeDashoffset={RING * (1 - done / mine.length)}
            className="stroke-primary-600 dark:stroke-primary-400"
          />
        </svg>
        <span className="grid flex-1 min-w-0">
          <span id="getting-started-title" className="text-sm font-semibold text-(--color-text-primary)">
            {t("gettingStarted.title")}
          </span>
          <span className="text-xs text-(--color-text-secondary)">
            {t("gettingStarted.progress", { done, total: mine.length })}
          </span>
        </span>
        <ChevronDown
          className={cn("h-4 w-4 shrink-0 text-(--color-text-tertiary) transition-transform", collapsed && "rotate-180")}
          aria-hidden
        />
      </button>
      {!collapsed && (
        <>
          <ul className="grid gap-0.5 px-2 pb-2">
            {mine.map((item) => {
              const isDone = progress[item.key];
              return (
                <li key={item.key}>
                  <Link
                    href={`/${locale}${item.href}`}
                    aria-disabled={isDone}
                    tabIndex={isDone ? -1 : undefined}
                    className={cn(
                      "flex items-center gap-3 rounded-lg px-2 py-2 text-sm",
                      isDone ? "pointer-events-none" : "hover:bg-(--color-bg-secondary)"
                    )}
                  >
                    <span
                      className={cn(
                        "grid h-5 w-5 shrink-0 place-items-center rounded-full border-2",
                        isDone
                          ? "border-green-600 bg-green-600 text-white dark:border-green-500 dark:bg-green-500 dark:text-gray-950"
                          : "border-(--color-border-primary)"
                      )}
                    >
                      {isDone && <Check className="h-3 w-3" strokeWidth={3} aria-hidden />}
                    </span>
                    <span
                      className={cn(
                        "flex-1 min-w-0",
                        isDone ? "text-(--color-text-tertiary) line-through" : "text-(--color-text-primary)"
                      )}
                    >
                      {item.label}
                      {isDone && <span className="sr-only"> — {t("gettingStarted.done")}</span>}
                    </span>
                    {!isDone && (
                      <span className="shrink-0 text-xs font-medium text-primary-600 dark:text-primary-400" aria-hidden>
                        {t("gettingStarted.go")}
                      </span>
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>
          <div className="flex items-center justify-between gap-3 border-t border-(--color-border-primary) px-4 py-2 text-xs text-(--color-text-tertiary)">
            <span>{t("gettingStarted.autoTick")}</span>
            <button type="button" onClick={hide} className="underline underline-offset-2 hover:text-(--color-text-primary)">
              {t("gettingStarted.hide")}
            </button>
          </div>
        </>
      )}
    </section>
  );
}
