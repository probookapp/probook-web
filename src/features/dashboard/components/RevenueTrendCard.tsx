"use client";

import Link from "next/link";
import { useTranslation } from "react-i18next";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui";
import { formatCurrency, getLocale } from "@/lib/utils";
import { localizePath, useLocale } from "@/lib/navigation";

interface RevenueTrendCardProps {
  data: { month: string; revenue: number }[];
}

/**
 * Twelve months of invoiced revenue, the current month last and darker. The
 * dashboard had figures for this month and this year and nothing in between,
 * so a slow month could not be told from a slow season.
 */
export function RevenueTrendCard({ data }: RevenueTrendCardProps) {
  const { t } = useTranslation("dashboard");
  const locale = useLocale();
  const max = Math.max(...data.map((d) => d.revenue), 0);
  const monthLabel = new Intl.DateTimeFormat(getLocale(), { month: "short" });
  const fullMonth = new Intl.DateTimeFormat(getLocale(), { month: "long", year: "numeric" });

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <CardTitle>{t("trend.title")}</CardTitle>
        <Link
          href={localizePath("/reports", locale)}
          className="text-sm font-medium text-primary-600 hover:text-primary-700 dark:text-primary-400"
        >
          {t("trend.details")}
        </Link>
      </CardHeader>
      <CardContent>
        {max === 0 ? (
          <p className="py-10 text-center text-sm text-(--color-text-tertiary)">{t("trend.empty")}</p>
        ) : (
          <div className="flex h-44 items-end gap-1.5" role="list" aria-label={t("trend.title")}>
            {data.map((point, i) => {
              const [year, month] = point.month.split("-").map(Number);
              const date = new Date(year, month - 1, 1);
              const label = `${fullMonth.format(date)}: ${formatCurrency(point.revenue)}`;
              const current = i === data.length - 1;
              return (
                <div key={point.month} role="listitem" aria-label={label} title={label} className="flex h-full min-w-0 flex-1 flex-col items-center gap-1.5">
                  <div className="flex min-h-0 w-full flex-1 items-end">
                    <div
                      className={
                        current
                          ? "w-full rounded-t bg-primary-600 dark:bg-primary-400"
                          : "w-full rounded-t bg-primary-200 dark:bg-primary-800"
                      }
                      style={{ height: `${Math.max((point.revenue / max) * 100, point.revenue > 0 ? 3 : 1)}%` }}
                    />
                  </div>
                  <span className="w-full truncate text-center text-[10px] text-(--color-text-tertiary)">
                    {monthLabel.format(date).replace(".", "")}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
