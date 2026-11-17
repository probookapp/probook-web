"use client";

import Link from "next/link";
import { useTranslation } from "react-i18next";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui";
import { cn, formatCurrency } from "@/lib/utils";
import { localizePath, useLocale } from "@/lib/navigation";
import type { DashboardStats } from "@/types";

const BUCKETS = [
  { key: "not_due", label: "aging.notDue", bar: "bg-gray-300 dark:bg-gray-600" },
  { key: "days_0_30", label: "aging.days0to30", bar: "bg-amber-400 dark:bg-amber-500" },
  { key: "days_31_60", label: "aging.days31to60", bar: "bg-orange-500 dark:bg-orange-400" },
  { key: "days_over_60", label: "aging.daysOver60", bar: "bg-red-600 dark:bg-red-400" },
] as const;

interface ReceivablesCardProps {
  aging: DashboardStats["receivables_aging"];
  overdueCount: number;
}

/**
 * What clients still owe, split by how late it is. "Pending" as one figure
 * mixed an invoice issued yesterday with one three months overdue; the second
 * is the one to phone about.
 */
export function ReceivablesCard({ aging, overdueCount }: ReceivablesCardProps) {
  const { t } = useTranslation("dashboard");
  const locale = useLocale();
  const total = BUCKETS.reduce((sum, b) => sum + aging[b.key], 0);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <CardTitle>{t("aging.title")}</CardTitle>
        <Link
          href={localizePath("/invoices?status=ISSUED", locale)}
          className="text-sm font-medium text-primary-600 hover:text-primary-700 dark:text-primary-400"
        >
          {t("aging.viewAll")}
        </Link>
      </CardHeader>
      <CardContent>
        {total === 0 ? (
          <p className="py-10 text-center text-sm text-(--color-text-tertiary)">{t("aging.none")}</p>
        ) : (
          <>
            <p className="font-mono text-2xl font-semibold tabular-nums text-(--color-text-primary)">
              {formatCurrency(total)}
            </p>
            <p
              className={cn(
                "mt-1 text-sm",
                overdueCount > 0 ? "text-red-600 dark:text-red-400" : "text-(--color-text-tertiary)"
              )}
            >
              {overdueCount > 0 ? t("aging.overdueCount", { count: overdueCount }) : t("aging.nothingOverdue")}
            </p>
            <div className="mt-4 flex h-2 overflow-hidden rounded-full bg-(--color-bg-tertiary)" aria-hidden="true">
              {BUCKETS.map((b) =>
                aging[b.key] > 0 ? (
                  <span key={b.key} className={b.bar} style={{ width: `${(aging[b.key] / total) * 100}%` }} />
                ) : null
              )}
            </div>
            <dl className="mt-4 space-y-2">
              {BUCKETS.map((b) => (
                <div key={b.key} className="flex items-center justify-between gap-3 text-sm">
                  <dt className="flex items-center gap-2 text-(--color-text-secondary)">
                    <span className={cn("h-2.5 w-2.5 shrink-0 rounded-full", b.bar)} />
                    {t(b.label)}
                  </dt>
                  <dd className="whitespace-nowrap font-mono tabular-nums text-(--color-text-primary)">
                    {formatCurrency(aging[b.key])}
                  </dd>
                </div>
              ))}
            </dl>
          </>
        )}
      </CardContent>
    </Card>
  );
}
