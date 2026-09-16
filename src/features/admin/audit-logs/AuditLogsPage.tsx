"use client";

import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ChevronLeft, ChevronRight, Download } from "lucide-react";
import { exportToCsv } from "@/lib/csv-export";
import {
  Button,
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
import { useAdminTenants } from "@/features/admin/tenants/hooks/useTenants";

type AuditLog = Record<string, unknown>;
type TenantOption = { id: string; name: string };

const PAGE_SIZE = 50;

export function AuditLogsPage() {
  const { t } = useTranslation("admin");
  const [actionFilter, setActionFilter] = useState("");
  const [tenantId, setTenantId] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [page, setPage] = useState(1);

  const { data: tenantsData } = useAdminTenants();
  const tenants = (tenantsData || []) as unknown as TenantOption[];

  // Any filter change restarts at page 1 — otherwise a narrower filter can
  // leave you stranded on a page that no longer exists.
  const applyFilter = <T,>(set: (value: T) => void) => (value: T) => {
    set(value);
    setPage(1);
  };

  const { data, isLoading } = useAdminAuditLogs({
    action: actionFilter || undefined,
    tenantId: tenantId || undefined,
    from: fromDate || undefined,
    to: toDate || undefined,
    page,
    limit: PAGE_SIZE,
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600" />
      </div>
    );
  }

  // Data may be paginated { data: [], total: n } or a plain array
  const rawData = data as { data?: unknown[]; logs?: unknown[]; total?: number } | unknown[];
  const logList: AuditLog[] = Array.isArray(rawData)
    ? (rawData as AuditLog[])
    : ((rawData?.data || rawData?.logs || []) as AuditLog[]);
  const total = Array.isArray(rawData) ? logList.length : Number(rawData?.total ?? logList.length);
  const firstRow = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const lastRow = (page - 1) * PAGE_SIZE + logList.length;
  const hasNextPage = lastRow < total;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-gray-100">{t("auditLogs.title")}</h1>
          <p className="text-sm sm:text-base text-gray-500 dark:text-gray-400">{t("auditLogs.subtitle")}</p>
        </div>
        <Button
          variant="secondary"
          size="sm"
          disabled={logList.length === 0}
          onClick={() =>
            exportToCsv(
              logList,
              [
                {
                  header: t("auditLogs.dateTime"),
                  accessor: (r) => (r.created_at ? new Date(String(r.created_at)).toISOString() : ""),
                },
                { header: t("auditLogs.actor"), accessor: (r) => String(r.actor_name ?? "") },
                { header: t("auditLogs.action"), accessor: (r) => String(r.action ?? "") },
                { header: t("auditLogs.target"), accessor: (r) => `${String(r.target_type ?? "")} ${String(r.target_id ?? "")}`.trim() },
                { header: t("auditLogs.tenant"), accessor: (r) => String(r.tenant_name ?? "") },
                { header: t("auditLogs.ip"), accessor: (r) => String(r.ip_address ?? "") },
              ],
              "audit-logs"
            )
          }
        >
          <Download className="h-4 w-4 me-2" />
          {t("auditLogs.exportCsv")}
        </Button>
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <CardTitle>{t("auditLogs.list")}</CardTitle>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <Select
                name="action-filter"
                value={actionFilter}
                onChange={(e) => applyFilter(setActionFilter)(e.target.value)}
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
              <Select
                name="tenant-filter"
                value={tenantId}
                onChange={(e) => applyFilter(setTenantId)(e.target.value)}
                className="w-full sm:w-56"
                options={[
                  { value: "", label: t("auditLogs.allTenants") },
                  ...tenants.map((tenant) => ({
                    value: tenant.id,
                    label: tenant.name,
                  })),
                ]}
              />
              <Input
                name="audit-from"
                type="date"
                value={fromDate}
                onChange={(e) => applyFilter(setFromDate)(e.target.value)}
                className="w-full sm:w-40"
                aria-label={t("auditLogs.from")}
              />
              <Input
                name="audit-to"
                type="date"
                value={toDate}
                onChange={(e) => applyFilter(setToDate)(e.target.value)}
                className="w-full sm:w-40"
                aria-label={t("auditLogs.to")}
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
            <Table className="min-w-200">
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
          {/* Page navigation: the route caps each response, so without this the
              log was silently truncated to its first page. */}
          <div className="flex items-center justify-between gap-3 px-4 py-3 border-t border-gray-200 dark:border-gray-700">
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {t("auditLogs.range", { first: firstRow, last: lastRow, total })}
            </p>
            <div className="flex items-center gap-2">
              <Button
                variant="secondary"
                size="sm"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                aria-label={t("auditLogs.previous")}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button
                variant="secondary"
                size="sm"
                disabled={!hasNextPage}
                onClick={() => setPage((p) => p + 1)}
                aria-label={t("auditLogs.next")}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
