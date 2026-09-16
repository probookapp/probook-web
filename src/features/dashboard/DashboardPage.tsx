import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import {
  Users,
  FileText,
  Receipt,
  Banknote,
  TrendingUp,
  Clock,
  Wallet,
  PiggyBank,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui";
import { formatCurrency } from "@/lib/utils";
import { dashboardApi } from "@/lib/api";
import { useDemoMode } from "@/components/providers/DemoModeProvider";
import { useDemotedNotices } from "@/components/shared/NoticeBar";
import { EmailVerifyNotice } from "@/components/shared/EmailVerifyNotice";
import { DEMO_DASHBOARD_STATS } from "@/lib/demo-data";
import { AlertsPanel } from "./components";
import { useDashboardStore, type DashboardStatId } from "@/stores/useDashboardStore";
import { useLocale, localizePath } from "@/lib/navigation";
import { useDashboardLayoutSync } from "./hooks/useDashboardLayoutSync";

/**
 * A figure on the dashboard is a question ("how much is still owed?"), and the
 * answer is a list. Cards that have a matching list link to it, already
 * filtered, instead of leaving the reader to find it themselves.
 */
/**
 * Nine figures of equal weight are nine figures nobody reads. The first card in
 * the owner's own order is shown large and the rest compact, so the dashboard
 * leads with something — and the hierarchy still belongs to the owner, since
 * reordering in the settings changes what is led with.
 *
 * The pastel circle behind each icon is gone. It carried no information, and a
 * decorative disc repeated nine times is exactly what makes a panel of numbers
 * look like a template rather than a ledger.
 */
function StatCard({
  title,
  value,
  icon: Icon,
  description,
  href,
  featured,
}: {
  title: string;
  value: string | number;
  icon: React.ElementType;
  description?: string;
  href?: string;
  featured?: boolean;
}) {
  const body = featured ? (
    <CardContent className="py-6">
      <p className="flex items-center gap-2 text-sm font-medium text-(--color-text-secondary)">
        <Icon className="h-4 w-4 text-(--color-text-tertiary)" />
        {title}
      </p>
      <p className="mt-2 font-mono text-3xl sm:text-4xl font-semibold tabular-nums text-(--color-text-primary)">
        {value}
      </p>
      {description && (
        <p className="mt-1 text-sm text-(--color-text-tertiary)">{description}</p>
      )}
    </CardContent>
  ) : (
    <CardContent className="py-4">
      <p className="flex items-center gap-1.5 text-xs font-medium text-(--color-text-tertiary)">
        <Icon className="h-3.5 w-3.5" />
        <span className="truncate">{title}</span>
      </p>
      {/* The description repeats the title at this size, so it is dropped
          rather than shrunk into an unreadable second line.

          The figure is smaller on a phone and allowed to wrap: two columns at
          390 px leave about 139 px of text, and "198 968,00 DZD" set at 20 px
          in a monospaced face needs 168 px. It did not overflow the page — it
          was clipped inside its own card, which is worse, because a total that
          reads "198,968.0" is not obviously wrong.

          It wraps at spaces only. Breaking anywhere sent the final dot of the
          Arabic currency mark "د.ج." onto a line of its own, which looks like a
          rendering fault rather than a long number. */}
      <p className="mt-1.5 font-mono text-base sm:text-xl font-semibold tabular-nums text-(--color-text-primary)">
        {value}
      </p>
    </CardContent>
  );

  if (!href) return <Card>{body}</Card>;

  return (
    <Link
      href={href}
      className="block rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
    >
      <Card className="h-full transition-colors hover:border-(--color-border-secondary)">
        {body}
      </Card>
    </Link>
  );
}

export function DashboardPage() {
  // Warnings the single top strip could not carry (see NoticeBar).
  const demoted = useDemotedNotices();
  const { t } = useTranslation("dashboard");
  const { isDemoMode } = useDemoMode();
  const locale = useLocale();
  const to = (path: string) => localizePath(path, locale);
  const order = useDashboardStore((s) => s.order);
  const hidden = useDashboardStore((s) => s.hidden);
  useDashboardLayoutSync(); // hydrate saved layout from server (cross-device)
  const { data: stats, isLoading } = useQuery({
    queryKey: ["dashboard-stats", { demo: isDemoMode }],
    queryFn: isDemoMode ? () => DEMO_DASHBOARD_STATS : dashboardApi.getStats,
    staleTime: isDemoMode ? Infinity : undefined,
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600" />
      </div>
    );
  }

  // Stat cards keyed by id so the owner can toggle visibility / reorder them
  // (persisted client-side via useDashboardStore).
  const statCards: Record<
    DashboardStatId,
    {
      title: string;
      value: string | number;
      icon: React.ElementType;
      description: string;
      href: string;
    }
  > = {
    clients: {
      title: t("stats.clients"),
      value: stats?.total_clients ?? 0,
      icon: Users,
      description: t("stats.totalClients"),
      href: to("/clients"),
    },
    quotes: {
      title: t("stats.quotes"),
      value: stats?.total_quotes ?? 0,
      icon: FileText,
      description: t("stats.quotesCreated"),
      href: to("/quotes"),
    },
    invoices: {
      title: t("stats.invoices"),
      value: stats?.total_invoices ?? 0,
      icon: Receipt,
      description: t("stats.invoicesIssued"),
      href: to("/invoices"),
    },
    monthlyRevenue: {
      title: t("stats.monthlyRevenue"),
      value: formatCurrency(stats?.revenue_this_month ?? 0),
      icon: Banknote,
      description: t("stats.monthlyRevenueDesc"),
      href: to("/reports"),
    },
    yearlyRevenue: {
      title: t("stats.yearlyRevenue"),
      value: formatCurrency(stats?.revenue_this_year ?? 0),
      icon: TrendingUp,
      description: t("stats.yearlyRevenueDesc"),
      href: to("/reports"),
    },
    pending: {
      title: t("stats.pending"),
      value: formatCurrency(stats?.pending_payments ?? 0),
      icon: Clock,
      description: t("stats.pendingPayments"),
      href: to("/invoices?status=ISSUED"),
    },
    totalExpenses: {
      title: t("stats.totalExpenses"),
      value: formatCurrency(stats?.total_expenses ?? 0),
      icon: Wallet,
      description: t("stats.totalExpensesDesc"),
      href: to("/expenses"),
    },
    profit: {
      title: t("stats.profit"),
      value: formatCurrency(stats?.profit ?? 0),
      icon: PiggyBank,
      description: t("stats.profitDesc"),
      href: to("/reports"),
    },
  };

  const visibleStats = order.filter((id) => !hidden.includes(id));

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-gray-100">{t("title")}</h1>
        <p className="text-gray-500 dark:text-gray-400">{t("welcome")}</p>
      </div>

      {/* Notices the top strip could not carry land here rather than stacking a
          second warning band across every page in the application. */}
      {demoted.includes("emailVerify") && <EmailVerifyNotice variant="card" />}

      {visibleStats.length > 0 && (
        <div className="space-y-4">
          {/* Whatever the owner put first leads the page. */}
          <StatCard
            featured
            title={statCards[visibleStats[0]].title}
            value={statCards[visibleStats[0]].value}
            icon={statCards[visibleStats[0]].icon}
            description={statCards[visibleStats[0]].description}
            href={statCards[visibleStats[0]].href}
          />
          {visibleStats.length > 1 && (
            <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4">
              {visibleStats.slice(1).map((id) => {
                const card = statCards[id];
                return (
                  <StatCard
                    key={id}
                    title={card.title}
                    value={card.value}
                    icon={card.icon}
                    description={card.description}
                    href={card.href}
                  />
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* One panel: the events and the actions on them (see AlertsPanel). */}
      <AlertsPanel />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>{t("recentInvoices")}</CardTitle>
          </CardHeader>
          <CardContent>
            {stats?.recent_invoices && stats.recent_invoices.length > 0 ? (
              <ul className="divide-y divide-gray-200 dark:divide-gray-700">
                {stats.recent_invoices.map((invoice) => (
                  <li key={invoice.id} className="py-3 flex justify-between gap-4">
                    <div className="min-w-0">
                      <p className="font-medium text-gray-900 dark:text-gray-100">{invoice.invoice_number}</p>
                      <p className="text-sm text-gray-500 dark:text-gray-400 truncate">
                        {invoice.client?.name}
                      </p>
                    </div>
                    <p className="shrink-0 font-medium tabular-nums whitespace-nowrap text-gray-900 dark:text-gray-100">
                      {formatCurrency(invoice.total)}
                    </p>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-gray-500 dark:text-gray-400 text-center py-4">
                {t("noRecentInvoices")}
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t("recentQuotes")}</CardTitle>
          </CardHeader>
          <CardContent>
            {stats?.recent_quotes && stats.recent_quotes.length > 0 ? (
              <ul className="divide-y divide-gray-200 dark:divide-gray-700">
                {stats.recent_quotes.map((quote) => (
                  <li key={quote.id} className="py-3 flex justify-between gap-4">
                    <div className="min-w-0">
                      <p className="font-medium text-gray-900 dark:text-gray-100">{quote.quote_number}</p>
                      <p className="text-sm text-gray-500 dark:text-gray-400 truncate">
                        {quote.client?.name}
                      </p>
                    </div>
                    <p className="shrink-0 font-medium tabular-nums whitespace-nowrap text-gray-900 dark:text-gray-100">
                      {formatCurrency(quote.total)}
                    </p>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-gray-500 dark:text-gray-400 text-center py-4">
                {t("noRecentQuotes")}
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
