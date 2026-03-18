"use client";

import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
  Input,
  Select,
} from "@/components/ui";
import { useAdminAuditLogs } from "./hooks/useAuditLogs";

type AuditLog = Record<string, unknown>;

export function AuditLogsPage() {
  const { t } = useTranslation("admin");
  const [actionFilter, setActionFilter] = useState("");
  const [tenantSearch, setTenantSearch] = useState("");

  const { data, isLoading } = useAdminAuditLogs({
    action: actionFilter || undefined,
    tenantId: tenantSearch || undefined,
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600" />
      </div>
    );
  }

  // Data may be paginated { data: [], total: n } or a plain array
  const rawData = data as { data?: unknown[]; logs?: unknown[] } | unknown[];
  const logList: AuditLog[] = Array.isArray(rawData)
    ? (rawData as AuditLog[])
    : ((rawData?.data || rawData?.logs || []) as AuditLog[]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-gray-100">{t("auditLogs.title")}</h1>
          <p className="text-sm sm:text-base text-gray-500 dark:text-gray-400">{t("auditLogs.subtitle")}</p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <CardTitle>{t("auditLogs.list")}</CardTitle>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <Select
                name="action-filter"
                value={actionFilter}
                onChange={(e) => setActionFilter(e.target.value)}
                className="w-full sm:w-44"
                options={[
                  { value: "", label: t("auditLogs.allActions") },
                  { value: "login", label: t("auditLogs.login") },
                  { value: "logout", label: t("auditLogs.logout") },
                  { value: "create", label: t("auditLogs.create") },
                  { value: "update", label: t("auditLogs.update") },
                  { value: "delete", label: t("auditLogs.delete") },
                  { value: "suspend", label: t("auditLogs.suspend") },
                  { value: "activate", label: t("auditLogs.activate") },
                  { value: "approve", label: t("auditLogs.approve") },
                  { value: "reject", label: t("auditLogs.reject") },
                ]}
              />
              <Input
                name="tenant-search"
                placeholder={t("auditLogs.filterByTenant")}
                value={tenantSearch}
                onChange={(e) => setTenantSearch(e.target.value)}
                autoComplete="off"
                className="w-full sm:w-56"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {/* Mobile card view */}
          <div className="md:hidden divide-y divide-gray-200 dark:divide-gray-700">
            {logList.length > 0 ? (
              logList.map((log, idx) => (
                <div key={String(log.id || idx)} className="p-4 space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-gray-900 dark:text-gray-100">
                      {String(log.action || "-")}
                    </span>
                    <span className="text-sm text-gray-500 dark:text-gray-400">
                      {log.created_at || log.timestamp
                        ? new Date(String(log.created_at || log.timestamp)).toLocaleString()
                        : "-"}
                    </span>
                  </div>
                  <div className="text-sm text-gray-900 dark:text-gray-100">
                    {String(log.actor_name || log.admin_name || log.actor || "-")}
                  </div>
                  <div className="text-sm text-gray-500 dark:text-gray-400">
                    {String(log.target || log.target_type || "-")}
                    {log.target_id ? ` (${String(log.target_id).slice(0, 8)}...)` : ""}
                    {" · "}
                    {String(log.tenant_name || log.tenant || "-")}
                  </div>
                  {!!(log.ip_address || log.ip) && (
                    <div className="text-xs text-gray-400 dark:text-gray-500">
                      {String(log.ip_address || log.ip)}
                    </div>
                  )}
                </div>
              ))
            ) : (
              <div className="py-8 text-center text-gray-500 dark:text-gray-400">{t("auditLogs.noLogs")}</div>
            )}
          </div>
          {/* Desktop table view */}
          <div className="hidden md:block overflow-x-auto">
            <Table className="min-w-[800px]">
              <TableHeader>
                <TableRow>
                  <TableHead>{t("auditLogs.dateTime")}</TableHead>
                  <TableHead>{t("auditLogs.actor")}</TableHead>
                  <TableHead>{t("auditLogs.action")}</TableHead>
                  <TableHead>{t("auditLogs.target")}</TableHead>
                  <TableHead>{t("auditLogs.tenant")}</TableHead>
                  <TableHead>{t("auditLogs.ip")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {logList.length > 0 ? (
                  logList.map((log, idx) => (
                    <TableRow key={String(log.id || idx)}>
                      <TableCell className="text-gray-600 dark:text-gray-400 whitespace-nowrap">
                        {log.created_at || log.timestamp
                          ? new Date(String(log.created_at || log.timestamp)).toLocaleString()
                          : "-"}
                      </TableCell>
                      <TableCell className="font-medium text-gray-900 dark:text-gray-100">
                        {String(log.actor_name || log.admin_name || log.actor || "-")}
                      </TableCell>
                      <TableCell className="text-gray-600 dark:text-gray-400">
                        {String(log.action || "-")}
                      </TableCell>
                      <TableCell className="text-gray-600 dark:text-gray-400">
                        {String(log.target || log.target_type || "-")}
                        {log.target_id ? ` (${String(log.target_id).slice(0, 8)}...)` : ""}
                      </TableCell>
                      <TableCell className="text-gray-600 dark:text-gray-400">
                        {String(log.tenant_name || log.tenant || "-")}
                      </TableCell>
                      <TableCell className="text-gray-600 dark:text-gray-400">
                        {String(log.ip_address || log.ip || "-")}
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-gray-500 dark:text-gray-400 py-8">
                      {t("auditLogs.noLogs")}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
