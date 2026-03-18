"use client";

import { useTranslation } from "react-i18next";
import {
  Database,
  Clock,
  Building2,
  Users,
  Receipt,
  Package,
  AlertTriangle,
} from "lucide-react";
import { Card, CardContent, Badge } from "@/components/ui";
import { useSystemHealth } from "./hooks/useSystemHealth";

type HealthData = Record<string, unknown>;

function formatUptime(seconds: number): string {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);

  const parts: string[] = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  parts.push(`${minutes}m`);

  return parts.join(" ");
}

function StatusCard({
  title,
  value,
  icon: Icon,
  status,
}: {
  title: string;
  value: string | number;
  icon: React.ElementType;
  status?: "success" | "danger";
}) {
  const bgColor =
    status === "success"
      ? "bg-green-100 dark:bg-green-900/30"
      : status === "danger"
        ? "bg-red-100 dark:bg-red-900/30"
        : "bg-primary-100 dark:bg-primary-900/30";
  const iconColor =
    status === "success"
      ? "text-green-600 dark:text-green-400"
      : status === "danger"
        ? "text-red-600 dark:text-red-400"
        : "text-primary-600 dark:text-primary-400";

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
          </div>
          <div className={`p-3 ${bgColor} rounded-full`}>
            <Icon className={`h-6 w-6 ${iconColor}`} />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export function SystemHealthPage() {
  const { t } = useTranslation("admin");
  const { data, isLoading } = useSystemHealth();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600" />
      </div>
    );
  }

  const health = (data || {}) as HealthData;
  const dbConnected = Boolean(health.db_connected);
  const uptime = Number(health.uptime || 0);
  const recentErrors = Number(health.recent_errors || 0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-gray-100">
          {t("system.title")}
        </h1>
        <p className="text-sm sm:text-base text-gray-500 dark:text-gray-400">
          {t("system.subtitle")}
        </p>
      </div>

      {/* Status Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <StatusCard
          title={t("system.db_connection")}
          value={
            dbConnected
              ? t("system.connected")
              : t("system.disconnected")
          }
          icon={Database}
          status={dbConnected ? "success" : "danger"}
        />
        <StatusCard
          title={t("system.uptime")}
          value={formatUptime(uptime)}
          icon={Clock}
        />
      </div>

      {/* Count Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatusCard
          title={t("system.tenants")}
          value={Number(health.total_tenants ?? 0)}
          icon={Building2}
        />
        <StatusCard
          title={t("system.users")}
          value={Number(health.total_users ?? 0)}
          icon={Users}
        />
        <StatusCard
          title={t("system.invoices")}
          value={Number(health.total_invoices ?? 0)}
          icon={Receipt}
        />
        <StatusCard
          title={t("system.products")}
          value={Number(health.total_products ?? 0)}
          icon={Package}
        />
      </div>

      {/* Recent Errors */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div
                className={`p-3 rounded-full ${
                  recentErrors > 0
                    ? "bg-red-100 dark:bg-red-900/30"
                    : "bg-green-100 dark:bg-green-900/30"
                }`}
              >
                <AlertTriangle
                  className={`h-6 w-6 ${
                    recentErrors > 0
                      ? "text-red-600 dark:text-red-400"
                      : "text-green-600 dark:text-green-400"
                  }`}
                />
              </div>
              <div>
                <p className="text-sm font-medium text-gray-500 dark:text-gray-400">
                  {t("system.recent_errors")}
                </p>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  {t("system.recent_errors_desc")}
                </p>
              </div>
            </div>
            <Badge variant={recentErrors > 0 ? "danger" : "success"}>
              {recentErrors}
            </Badge>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
