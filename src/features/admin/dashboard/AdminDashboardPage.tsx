"use client";

import { useState } from "react";
import { useRouter } from "@/lib/navigation";
import { useTranslation } from "react-i18next";
import {
  Building2,
  Users,
  TrendingUp,
  DollarSign,
  UserPlus,
  Activity,
  ClipboardList,
  Receipt,
  CalendarClock,
  Gift,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, Badge, Input, Button } from "@/components/ui";
import {
  useAdminOverview,
  useAdminSignups,
  useAdminRevenue,
  useAdminSubscriptionAnalytics,
} from "./hooks/useAdminAnalytics";
import { OnboardingFunnel } from "./OnboardingFunnel";

type OverviewData = Record<string, unknown>;
type SignupEntry = { month: string; count: number };
// Revenue is reported per currency: { month, revenue: { DZD: 1600000, ... } }
type RevenueEntry = { month: string; revenue: Record<string, number> };
type MoneyByCurrency = { currency: string; amount: number }[];

function formatCentimes(amount: number): string {
  return (amount / 100).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

// "16,000.00 DZD + 290.00 EUR" — money figures are per-currency and must not
// be collapsed into a single number.
function formatMoneyByCurrency(entries: MoneyByCurrency): string {
  if (!entries || entries.length === 0) return "0.00";
  return entries
    .map((e) => `${formatCentimes(e.amount)} ${e.currency}`)
    .join(" + ");
}

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
            <p className="text-sm font-medium text-gray-500 dark:text-gray-400">
              {title}
            </p>
            <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">
              {value}
            </p>
            {description && (
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                {description}
              </p>
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

function BarChart({
  data,
  valueKey,
  label,
  formatValue,
}: {
  data: { month: string; [key: string]: unknown }[];
  valueKey: string;
  label: string;
  formatValue?: (v: number) => string;
}) {
  const { t } = useTranslation("admin");

  if (!data || data.length === 0) {
    return (
      <p className="text-gray-500 dark:text-gray-400 text-center py-4">
        {t("dashboard.no_data")}
      </p>
    );
  }

  const maxVal = Math.max(...data.map((d) => Number(d[valueKey] || 0)), 1);

  return (
    <div className="space-y-2">
      <p className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-3">
        {label}
      </p>
      <div className="flex items-end gap-1 h-40">
        {data.map((entry) => {
          const val = Number(entry[valueKey] || 0);
          const heightPct = Math.max((val / maxVal) * 100, 2);
          const displayVal = formatValue ? formatValue(val) : String(val);
          const monthLabel = entry.month.slice(5); // "01", "02", etc.

          return (
            <div
              key={entry.month}
              className="flex-1 flex flex-col items-center gap-1"
            >
              <span className="text-[10px] text-gray-500 dark:text-gray-400 truncate max-w-full">
                {displayVal}
              </span>
              <div
                className="w-full bg-primary-500 dark:bg-primary-400 rounded-t transition-all"
                style={{ height: `${heightPct}%` }}
                title={`${entry.month}: ${displayVal}`}
              />
              <span className="text-[10px] text-gray-500 dark:text-gray-400">
                {monthLabel}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/**
 * One queue that needs someone to act. Zero is rendered too, in a muted style:
 * "nothing pending" is the information you want at a glance.
 */
function AttentionTile({
  label,
  count,
  icon: Icon,
  href,
  onNavigate,
}: {
  label: string;
  count: number;
  icon: React.ElementType;
  href: string;
  onNavigate: (href: string) => void;
}) {
  const empty = count === 0;
  return (
    <button
      onClick={() => onNavigate(href)}
      className={`flex items-center gap-3 rounded-lg border p-4 text-left transition-colors ${
        empty
          ? "border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800"
          : "border-amber-300 bg-amber-50 hover:bg-amber-100 dark:border-amber-700 dark:bg-amber-900/20 dark:hover:bg-amber-900/30"
      }`}
    >
      <Icon
        className={`h-5 w-5 shrink-0 ${
          empty ? "text-gray-400" : "text-amber-600 dark:text-amber-400"
        }`}
      />
      <div className="min-w-0">
        <p
          className={`text-xl font-bold ${
            empty ? "text-gray-400 dark:text-gray-500" : "text-gray-900 dark:text-gray-100"
          }`}
        >
          {count}
        </p>
        <p className="text-sm text-gray-500 dark:text-gray-400">{label}</p>
      </div>
    </button>
  );
}

const STATUS_COLORS: Record<string, "success" | "warning" | "danger" | "default"> = {
  active: "success",
  pending: "warning",
  expired: "danger",
  suspended: "danger",
  cancelled: "default",
};

export function AdminDashboardPage() {
  const { t } = useTranslation("admin");
  const router = useRouter();
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const { data: overview, isLoading: overviewLoading } = useAdminOverview();
  const { data: signups } = useAdminSignups(startDate || undefined, endDate || undefined);
  const { data: revenue } = useAdminRevenue(startDate || undefined, endDate || undefined);
  const { data: subscriptionMix } = useAdminSubscriptionAnalytics();

  const handleResetRange = () => {
    setStartDate("");
    setEndDate("");
  };

  if (overviewLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600" />
      </div>
    );
  }

  const stats = (overview || {}) as OverviewData;
  const signupData = (signups || []) as SignupEntry[];
  const revenueData = (revenue || []) as RevenueEntry[];
  // One chart per currency present in the range (mixed currencies can't share a scale)
  const revenueCurrencies = Array.from(
    new Set(revenueData.flatMap((entry) => Object.keys(entry.revenue || {})))
  ).sort();
  const breakdown = (stats.subscription_breakdown || {}) as Record<string, number>;
  const attention = (stats.needs_attention || {}) as Record<string, number>;
  // { "Pro": { active: 4, cancelled: 1 }, ... }
  const byPlan = ((subscriptionMix as Record<string, unknown> | undefined)?.by_plan || {}) as Record<
    string,
    Record<string, number>
  >;
  const planRows = Object.entries(byPlan)
    .map(([plan, statuses]) => ({
      plan,
      statuses,
      total: Object.values(statuses).reduce((sum, n) => sum + n, 0),
    }))
    .sort((a, b) => b.total - a.total);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
          {t("dashboard.title")}
        </h1>
        <p className="text-gray-500 dark:text-gray-400">
          {t("dashboard.subtitle")}
        </p>
      </div>

      {/* What needs someone today */}
      <Card>
        <CardHeader>
          <CardTitle>{t("dashboard.needs_attention")}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <AttentionTile
              label={t("dashboard.pending_requests")}
              count={Number(attention.pending_requests ?? 0)}
              icon={ClipboardList}
              href="/admin/subscriptions/requests"
              onNavigate={router.push}
            />
            <AttentionTile
              label={t("dashboard.unpaid_invoices")}
              count={Number(attention.unpaid_invoices ?? 0)}
              icon={Receipt}
              href="/admin/subscription-invoices"
              onNavigate={router.push}
            />
            <AttentionTile
              label={t("dashboard.expiring_soon")}
              count={Number(attention.subscriptions_expiring_soon ?? 0)}
              icon={CalendarClock}
              href="/admin/subscriptions"
              onNavigate={router.push}
            />
            <AttentionTile
              label={t("dashboard.trials_ending_soon")}
              count={Number(attention.trials_ending_soon ?? 0)}
              icon={Gift}
              href="/admin/tenants"
              onNavigate={router.push}
            />
          </div>
        </CardContent>
      </Card>

      {/* Stat Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <StatCard
          title={t("dashboard.total_tenants")}
          value={Number(stats.total_tenants ?? 0)}
          icon={Building2}
        />
        <StatCard
          title={t("dashboard.active_tenants")}
          value={Number(stats.active_tenants ?? 0)}
          icon={Activity}
        />
        <StatCard
          title={t("dashboard.total_users")}
          value={Number(stats.total_users ?? 0)}
          icon={Users}
        />
        <StatCard
          title={t("dashboard.mrr")}
          value={formatMoneyByCurrency((stats.mrr as MoneyByCurrency) || [])}
          icon={TrendingUp}
          description={t("dashboard.mrr_desc")}
        />
        <StatCard
          title={t("dashboard.total_revenue")}
          value={formatMoneyByCurrency((stats.total_revenue as MoneyByCurrency) || [])}
          icon={DollarSign}
          description={t("dashboard.total_revenue_desc")}
        />
        <StatCard
          title={t("dashboard.new_signups")}
          value={Number(stats.new_signups_this_month ?? 0)}
          icon={UserPlus}
          description={t("dashboard.new_signups_desc")}
        />
        <StatCard
          title={t("dashboard.trials_running")}
          value={Number(stats.trials_running ?? 0)}
          icon={Gift}
          description={t("dashboard.trials_running_desc", {
            count: Number(stats.trials_ending_soon ?? 0),
          })}
        />
        <StatCard
          title={t("dashboard.trials_converted")}
          value={Number(stats.trials_converted ?? 0)}
          icon={TrendingUp}
          description={t("dashboard.trials_converted_desc")}
        />
      </div>

      {/* Subscription Breakdown */}
      <Card>
        <CardHeader>
          <CardTitle>{t("dashboard.subscription_breakdown")}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-3">
            {Object.entries(breakdown).map(([status, count]) => (
              <div key={status} className="flex items-center gap-2">
                <Badge variant={STATUS_COLORS[status] || "default"}>
                  {t(`dashboard.status_${status}`, status)}
                </Badge>
                <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                  {count}
                </span>
              </div>
            ))}
            {Object.keys(breakdown).length === 0 && (
              <p className="text-gray-500 dark:text-gray-400">
                {t("dashboard.no_subscriptions")}
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Which plans the subscriptions actually sit on */}
      <Card>
        <CardHeader>
          <CardTitle>{t("dashboard.subscriptions_by_plan")}</CardTitle>
        </CardHeader>
        <CardContent>
          {planRows.length > 0 ? (
            <div className="space-y-3">
              {planRows.map((row) => (
                <div key={row.plan} className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-medium text-gray-900 dark:text-gray-100">{row.plan}</span>
                  <div className="flex flex-wrap items-center gap-2">
                    {Object.entries(row.statuses)
                      .sort(([a], [b]) => a.localeCompare(b))
                      .map(([status, count]) => (
                        <span key={status} className="flex items-center gap-1.5">
                          <Badge variant={STATUS_COLORS[status] || "default"}>
                            {t(`dashboard.status_${status}`, status)}
                          </Badge>
                          <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                            {count}
                          </span>
                        </span>
                      ))}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-gray-500 dark:text-gray-400">{t("dashboard.no_subscriptions")}</p>
          )}
        </CardContent>
      </Card>

      {/* Date range for charts */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <Input
          name="analytics-start-date"
          type="date"
          label={t("dashboard.from")}
          value={startDate}
          onChange={(e) => setStartDate(e.target.value)}
          className="w-full sm:w-44"
        />
        <Input
          name="analytics-end-date"
          type="date"
          label={t("dashboard.to")}
          value={endDate}
          onChange={(e) => setEndDate(e.target.value)}
          className="w-full sm:w-44"
        />
        {(startDate || endDate) && (
          <Button variant="secondary" size="sm" onClick={handleResetRange}>
            {t("dashboard.reset")}
          </Button>
        )}
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>{t("dashboard.signup_trend")}</CardTitle>
          </CardHeader>
          <CardContent>
            <BarChart
              data={signupData}
              valueKey="count"
              label={t("dashboard.signups_per_month")}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t("dashboard.revenue_trend")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            {revenueCurrencies.length === 0 ? (
              <BarChart
                data={revenueData.map((entry) => ({ month: entry.month, revenue: 0 }))}
                valueKey="revenue"
                label={t("dashboard.revenue_per_month")}
                formatValue={(v) => formatCentimes(v)}
              />
            ) : (
              revenueCurrencies.map((currency) => (
                <BarChart
                  key={currency}
                  data={revenueData.map((entry) => ({
                    month: entry.month,
                    revenue: entry.revenue?.[currency] || 0,
                  }))}
                  valueKey="revenue"
                  label={`${t("dashboard.revenue_per_month")} (${currency})`}
                  formatValue={(v) => formatCentimes(v)}
                />
              ))
            )}
          </CardContent>
        </Card>
      </div>

      {/* Onboarding funnel across tenants */}
      <OnboardingFunnel />
    </div>
  );
}
