import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import {
  Users,
  FileText,
  Receipt,
  Euro,
  TrendingUp,
  Clock,
  Wallet,
  DollarSign,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui";
import { formatCurrency } from "@/lib/utils";
import { dashboardApi } from "@/lib/api";
import { useDemoMode } from "@/components/providers/DemoModeProvider";
import { DEMO_DASHBOARD_STATS } from "@/lib/demo-data";
import { AlertsPanel } from "./components";

function StatCard({
  title,
  value,
  icon: Icon,
  description,
}: {
  title: string;
  value: string | number;
  icon: React.ElementType;
  description?: string;
}) {
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-gray-500 dark:text-gray-400">{title}</p>
            <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{value}</p>
            {description && (
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{description}</p>
            )}
          </div>
          <div className="p-3 bg-primary-100 dark:bg-primary-900/30 rounded-full">
            <Icon className="h-6 w-6 text-primary-600 dark:text-primary-400" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export function DashboardPage() {
  const { t } = useTranslation("dashboard");
  const { isDemoMode } = useDemoMode();
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

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">{t("title")}</h1>
        <p className="text-gray-500 dark:text-gray-400">{t("welcome")}</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <StatCard
          title={t("stats.clients")}
          value={stats?.total_clients ?? 0}
          icon={Users}
          description={t("stats.totalClients")}
        />
        <StatCard
          title={t("stats.quotes")}
          value={stats?.total_quotes ?? 0}
          icon={FileText}
          description={t("stats.quotesCreated")}
        />
        <StatCard
          title={t("stats.invoices")}
          value={stats?.total_invoices ?? 0}
          icon={Receipt}
          description={t("stats.invoicesIssued")}
        />
        <StatCard
          title={t("stats.monthlyRevenue")}
          value={formatCurrency(stats?.revenue_this_month ?? 0)}
          icon={Euro}
          description={t("stats.monthlyRevenueDesc")}
        />
        <StatCard
          title={t("stats.yearlyRevenue")}
          value={formatCurrency(stats?.revenue_this_year ?? 0)}
          icon={TrendingUp}
          description={t("stats.yearlyRevenueDesc")}
        />
        <StatCard
          title={t("stats.pending")}
          value={formatCurrency(stats?.pending_payments ?? 0)}
          icon={Clock}
          description={t("stats.pendingPayments")}
        />
        <StatCard
          title={t("stats.totalExpenses")}
          value={formatCurrency(stats?.total_expenses ?? 0)}
          icon={Wallet}
          description={t("stats.totalExpensesDesc")}
        />
        <StatCard
          title={t("stats.profit")}
          value={formatCurrency(stats?.profit ?? 0)}
          icon={DollarSign}
          description={t("stats.profitDesc")}
        />
      </div>

      {/* Alerts Panel */}
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
                  <li key={invoice.id} className="py-3 flex justify-between">
                    <div>
                      <p className="font-medium text-gray-900 dark:text-gray-100">{invoice.invoice_number}</p>
                      <p className="text-sm text-gray-500 dark:text-gray-400">
                        {invoice.client?.name}
                      </p>
                    </div>
                    <p className="font-medium text-gray-900 dark:text-gray-100">
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
                  <li key={quote.id} className="py-3 flex justify-between">
                    <div>
                      <p className="font-medium text-gray-900 dark:text-gray-100">{quote.quote_number}</p>
                      <p className="text-sm text-gray-500 dark:text-gray-400">
                        {quote.client?.name}
                      </p>
                    </div>
                    <p className="font-medium text-gray-900 dark:text-gray-100">
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
