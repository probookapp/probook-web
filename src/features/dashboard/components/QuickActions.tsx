"use client";

import Link from "next/link";
import { useTranslation } from "react-i18next";
import { FilePlus, FileText, Store, UserPlus } from "lucide-react";
import { useAuthStore } from "@/stores/useAuthStore";
import { useEntitlements } from "@/hooks/useEntitlements";
import { FEATURE_KEYS } from "@/lib/feature-keys";
import { localizePath, useLocale } from "@/lib/navigation";
import { cn } from "@/lib/utils";

/**
 * The four things people open the application to do, one click from where they
 * land. Each is left out for whoever may not do it, and the till for an offer
 * that does not include it.
 */
export function QuickActions({ className }: { className?: string }) {
  const { t } = useTranslation("dashboard");
  const locale = useLocale();
  const hasPermission = useAuthStore((s) => s.hasPermission);
  const { data: entitlements } = useEntitlements();

  const actions = [
    { key: "newInvoice", href: "/invoices/new", icon: FilePlus, show: hasPermission("invoices", "create"), primary: true },
    { key: "newQuote", href: "/quotes/new", icon: FileText, show: hasPermission("quotes", "create") },
    { key: "newClient", href: "/clients?new=1", icon: UserPlus, show: hasPermission("clients", "create") },
    {
      key: "openTill",
      href: "/pos",
      icon: Store,
      show: hasPermission("pos") && (entitlements?.[FEATURE_KEYS.POS]?.included ?? true),
    },
  ].filter((action) => action.show);

  if (actions.length === 0) return null;

  return (
    <div className={cn("flex flex-wrap gap-2", className)} data-tour="dashboard-actions">
      {actions.map(({ key, href, icon: Icon, primary }) => (
        <Link
          key={key}
          href={localizePath(href, locale)}
          className={cn(
            "inline-flex min-h-10 items-center gap-2 rounded-md px-3.5 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500",
            primary
              ? "bg-primary-600 text-white hover:bg-primary-700"
              : "border border-(--color-border-secondary) bg-(--color-bg-primary) text-(--color-text-primary) hover:bg-(--color-bg-tertiary)"
          )}
        >
          <Icon className="h-4 w-4" />
          {t(`quickActions.${key}`)}
        </Link>
      ))}
    </div>
  );
}
