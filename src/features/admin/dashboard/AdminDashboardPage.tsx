"use client";

import { useTranslation } from "react-i18next";
import {
  Building2,
  Users,
  TrendingUp,
  DollarSign,
  UserPlus,
  Activity,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, Badge } from "@/components/ui";
import {
  useAdminOverview,
  useAdminSignups,
  useAdminRevenue,
} from "./hooks/useAdminAnalytics";

type OverviewData = Record<string, unknown>;
type SignupEntry = { month: string; count: number };
type RevenueEntry = { month: string; revenue: number };

function formatCentimes(amount: number): string {
  return (amount / 100).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
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

const STATUS_COLORS: Record<string, "success" | "warning" | "danger" | "default"> = {
  active: "success",
  pending: "warning",
  expired: "danger",
  suspended: "danger",
  cancelled: "default",
};

export function AdminDashboardPage() {
  const { t } = useTranslation("admin");
  const { data: overview, isLoading: overviewLoading } = useAdminOverview();
  const { data: signups } = useAdminSignups();
  const { data: revenue } = useAdminRevenue();

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
  const breakdown = (stats.subscription_breakdown || {}) as Record<string, number>;

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
          value={formatCentimes(Number(stats.mrr ?? 0))}
          icon={TrendingUp}
          description={t("dashboard.mrr_desc")}
        />
        <StatCard
          title={t("dashboard.total_revenue")}
          value={formatCentimes(Number(stats.total_revenue ?? 0))}
          icon={DollarSign}
          description={t("dashboard.total_revenue_desc")}
        />
        <StatCard
          title={t("dashboard.new_signups")}
          value={Number(stats.new_signups_this_month ?? 0)}
          icon={UserPlus}
          description={t("dashboard.new_signups_desc")}
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
          <CardContent>
            <BarChart
              data={revenueData}
              valueKey="revenue"
              label={t("dashboard.revenue_per_month")}
              formatValue={(v) => formatCentimes(v)}
            />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
