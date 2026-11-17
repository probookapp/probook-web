"use client";

import { useState } from "react";
import Link from "next/link";
import { localizePath, useLocale, useRouter } from "@/lib/navigation";
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
  TrendingDown,
  Percent,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, Badge, Input, Button, FitAmount } from "@/components/ui";
import {
  useAdminOverview,
  useAdminSignups,
  useAdminRevenue,
  useAdminSubscriptionAnalytics,
} from "./hooks/useAdminAnalytics";
import { OnboardingFunnel } from "./OnboardingFunnel";
import { getLocale } from "@/lib/utils";

type OverviewData = Record<string, unknown>;
type SignupEntry = { month: string; count: number };
// Revenue is reported per currency: { month, revenue: { DZD: 1600000, ... } }
type RevenueEntry = { month: string; revenue: Record<string, number> };
type MoneyByCurrency = { currency: string; amount: number }[];

function formatCentimes(amount: number): string {
  // The app's language, not the browser's: a French panel read in an English
  // browser showed "408,620.95".
  return (amount / 100).toLocaleString(getLocale(), {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

// "16,000.00 DZD + 290.00 EUR" — money figures are per-currency and must not
// be collapsed into a single number.
function formatMoneyByCurrency(entries: MoneyByCurrency): string {
  if (!entries || entries.length === 0) return formatCentimes(0);
  return entries
    .map((e) => `${formatCentimes(e.amount)} ${e.currency}`)
    .join(" + ");
}

/**
 * A platform figure that opens the rows behind it. The pastel disc behind each
 * icon is gone, as on the tenant dashboard: it carried nothing, and repeated
 * nine times it made the panel read as a template. The first figure, the
 * recurring revenue, is set large.
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
  description?: React.ReactNode;
  href?: string;
  featured?: boolean;
}) {
  const locale = useLocale();
  const body = (
    <CardContent className={featured ? "py-6" : "py-4"}>
      <p className="flex items-center gap-1.5 text-sm font-medium text-(--color-text-secondary)">
        <Icon className="h-4 w-4 shrink-0 text-(--color-text-tertiary)" />
        <span className="truncate">{title}</span>
      </p>
      <p
        className={
          featured
            ? "mt-2 font-mono text-3xl font-semibold tabular-nums text-(--color-text-primary) sm:text-4xl"
            : "mt-1.5 font-mono text-xl font-semibold tabular-nums text-(--color-text-primary)"
        }
      >
        <FitAmount>{value}</FitAmount>
      </p>
      {description && <div className="mt-1 text-xs text-(--color-text-tertiary)">{description}</div>}
    </CardContent>
  );
  if (!href) return <Card className="h-full">{body}</Card>;
  return (
    <Link
      href={localizePath(href, locale)}
      className="block h-full rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
    >
      <Card className="h-full transition-colors hover:border-(--color-border-secondary)">{body}</Card>
    </Link>
  );
}

/** "+12 %" against last month to date, coloured by direction. */
function Change({ current, previous, label }: { current: number; previous: number; label: string }) {
  if (previous <= 0) return null;
  const change = Math.round(((current - previous) / previous) * 100);
  const up = change >= 0;
  return (
    <span className="flex flex-wrap items-center gap-x-1">
      <span className={up ? "font-medium text-green-700 dark:text-green-400" : "font-medium text-red-600 dark:text-red-400"}>
        {`${up ? "+" : ""}${change} %`}
      </span>
      <span>{label}</span>
    </span>
  );
}

/** Ratio (0 to 1) as "34 %", or a dash when there is nothing to divide. */
function formatRate(rate: unknown): string {
  return typeof rate === "number"
    ? new Intl.NumberFormat(getLocale(), { style: "percent", maximumFractionDigits: 1 }).format(rate)
    : "-";
}

/** How many plans the "by plan" card lists before "show all". */
const PLAN_ROWS_SHOWN = 8;

/** Chart range presets, in months, ending with the current month. */
const RANGE_PRESETS = [3, 6, 12, 24] as const;

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
          // "janv.", "févr." in the app's language rather than "01", "02".
          const [y, m] = entry.month.split("-").map(Number);
          const monthLabel = new Intl.DateTimeFormat(getLocale(), { month: "short" })
            .format(new Date(y, m - 1, 1))
            .replace(".", "");

          // The bar's percentage height needs a parent with a height of its own:
          // set on a plain flex column it resolved to 0 px and every chart
          // drew only its labels. The column fills the row, and the bar sits
          // in the space its two labels leave.
          return (
            <div
              key={entry.month}
              className="flex-1 h-full min-w-0 flex flex-col items-center gap-1"
            >
              <span className="text-[10px] text-gray-500 dark:text-gray-400 truncate max-w-full">
                {displayVal}
              </span>
              <div className="flex-1 min-h-0 w-full flex items-end">
                <div
                  className="w-full bg-primary-500 dark:bg-primary-400 rounded-t transition-all"
                  style={{ height: `${heightPct}%` }}
                  title={`${entry.month}: ${displayVal}`}
                />
              </div>
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
      className={`flex items-center gap-3 rounded-lg border p-4 text-start transition-colors ${
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
  const [allPlans, setAllPlans] = useState(false);
  const [preset, setPreset] = useState<number | null>(12);
  const applyPreset = (months: number) => {
    const now = new Date();
    const from = new Date(now.getFullYear(), now.getMonth() - months + 1, 1);
    const iso = (d: Date) =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    setPreset(months);
    // Twelve months is the API's own default: no dates sent.
    setStartDate(months === 12 ? "" : iso(from));
    setEndDate(months === 12 ? "" : iso(now));
  };
  const { data: overview, isLoading: overviewLoading } = useAdminOverview();
  const { data: signups } = useAdminSignups(startDate || undefined, endDate || undefined);
  const { data: revenue } = useAdminRevenue(startDate || undefined, endDate || undefined);
  const { data: subscriptionMix } = useAdminSubscriptionAnalytics();

  const handleResetRange = () => applyPreset(12);

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

      {/* Stat Cards: the recurring revenue leads, the rest open their lists. */}
      <div className="space-y-4">
        <StatCard
          featured
          title={t("dashboard.mrr")}
          value={formatMoneyByCurrency((stats.mrr as MoneyByCurrency) || [])}
          icon={TrendingUp}
          description={t("dashboard.mrr_desc")}
          href="/admin/subscriptions?status=active"
        />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          <StatCard
            title={t("dashboard.total_tenants")}
            value={Number(stats.total_tenants ?? 0)}
            icon={Building2}
            href="/admin/tenants"
          />
          <StatCard
            title={t("dashboard.active_tenants")}
            value={Number(stats.active_tenants ?? 0)}
            icon={Activity}
            href="/admin/tenants?status=active"
          />
          <StatCard
            title={t("dashboard.total_users")}
            value={Number(stats.total_users ?? 0)}
            icon={Users}
            href="/admin/users"
          />
          <StatCard
            title={t("dashboard.total_revenue")}
            value={formatMoneyByCurrency((stats.total_revenue as MoneyByCurrency) || [])}
            icon={DollarSign}
            description={t("dashboard.total_revenue_desc")}
            href="/admin/subscription-invoices?status=paid"
          />
          <StatCard
            title={t("dashboard.new_signups")}
            value={Number(stats.new_signups_this_month ?? 0)}
            icon={UserPlus}
            description={
              Number(stats.new_signups_last_month_to_date ?? 0) === 0 ? t("dashboard.new_signups_desc") : <Change
                current={Number(stats.new_signups_this_month ?? 0)}
                previous={Number(stats.new_signups_last_month_to_date ?? 0)}
                label={t("dashboard.vs_last_month", { count: Number(stats.new_signups_last_month_to_date ?? 0) })}
              />
            }
            href="/admin/tenants"
          />
          <StatCard
            title={t("dashboard.trials_running")}
            value={Number(stats.trials_running ?? 0)}
            icon={Gift}
            description={t("dashboard.trials_running_desc", {
              count: Number(stats.trials_ending_soon ?? 0),
            })}
            href="/admin/tenants?trial=active"
          />
          <StatCard
            title={t("dashboard.trial_conversion")}
            value={formatRate(stats.trial_conversion_rate)}
            icon={Percent}
            description={t("dashboard.trial_conversion_desc", { count: Number(stats.trials_converted ?? 0) })}
            href="/admin/tenants?trial=expired"
          />
          <StatCard
            title={t("dashboard.churn")}
            value={formatRate(stats.churn_rate_30d)}
            icon={TrendingDown}
            description={t("dashboard.churn_desc", { count: Number(stats.churned_last_30_days ?? 0) })}
            href="/admin/subscriptions?status=cancelled"
          />
        </div>
      </div>

      {/* Subscription Breakdown */}
      <Card>
        <CardHeader>
          <CardTitle>{t("dashboard.subscription_breakdown")}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-3">
            {Object.entries(breakdown).map(([status, count]) => (
              <button
                key={status}
                type="button"
                onClick={() => router.push(`/admin/subscriptions?status=${status}`)}
                className="flex min-h-10 items-center gap-2 rounded-md px-1.5 hover:bg-(--color-bg-secondary)"
              >
                <Badge variant={STATUS_COLORS[status] || "default"}>
                  {t(`dashboard.status_${status}`, status)}
                </Badge>
                <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                  {count}
                </span>
              </button>
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
              {(allPlans ? planRows : planRows.slice(0, PLAN_ROWS_SHOWN)).map((row) => (
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
              {planRows.length > PLAN_ROWS_SHOWN && (
                <button
                  type="button"
                  onClick={() => setAllPlans(!allPlans)}
                  className="min-h-10 text-sm font-medium text-primary-600 hover:text-primary-700 dark:text-primary-400"
                >
                  {allPlans
                    ? t("dashboard.show_fewer_plans")
                    : t("dashboard.show_all_plans", { count: planRows.length })}
                </button>
              )}
            </div>
          ) : (
            <p className="text-gray-500 dark:text-gray-400">{t("dashboard.no_subscriptions")}</p>
          )}
        </CardContent>
      </Card>

      {/* Date range for charts: presets first, exact dates when needed. */}
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
        <div className="flex flex-wrap gap-1.5" role="group" aria-label={t("dashboard.range")}>
          {RANGE_PRESETS.map((months) => (
            <Button
              key={months}
              size="sm"
              variant={preset === months ? "primary" : "secondary"}
              aria-pressed={preset === months}
              onClick={() => applyPreset(months)}
            >
              {t("dashboard.range_months", { count: months })}
            </Button>
          ))}
        </div>
        {/* The field sits in its own box: Input fills its parent, so two
            bare fields each took a whole row. */}
        <div className="w-full sm:w-44">
        <Input
          name="analytics-start-date"
          type="date"
          label={t("dashboard.from")}
          value={startDate}
          onChange={(e) => {
            setStartDate(e.target.value);
            setPreset(null);
          }}
        />
        </div>
        {/* The field sits in its own box: Input fills its parent, so two
            bare fields each took a whole row. */}
        <div className="w-full sm:w-44">
        <Input
          name="analytics-end-date"
          type="date"
          label={t("dashboard.to")}
          value={endDate}
          onChange={(e) => {
            setEndDate(e.target.value);
            setPreset(null);
          }}
        />
        </div>
        {preset === null && (
          <Button variant="ghost" size="sm" onClick={handleResetRange}>
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
