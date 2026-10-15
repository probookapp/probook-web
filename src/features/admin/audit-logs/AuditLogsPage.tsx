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
  PageHeader,
  ColumnPicker,
} from "@/components/ui";
import { useTableColumns } from "@/hooks/useTableColumns";
import { useAdminAuditLogs } from "./hooks/useAuditLogs";
import { useAdminTenants } from "@/features/admin/tenants/hooks/useTenants";
import { MobileCard, MobileCardList } from "@/features/admin/components/MobileCard";

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

  // Data may be paginated { data: [], total: n } or a plain array
  const rawData = data as { data?: unknown[]; logs?: unknown[]; total?: number } | unknown[];
  const logList: AuditLog[] = Array.isArray(rawData)
    ? (rawData as AuditLog[])
    : ((rawData?.data || rawData?.logs || []) as AuditLog[]);
  const total = Array.isArray(rawData) ? logList.length : Number(rawData?.total ?? logList.length);
  const firstRow = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const lastRow = (page - 1) * PAGE_SIZE + logList.length;
  const hasNextPage = lastRow < total;

  const columns = useTableColumns<AuditLog>(
    "admin-audit-logs",
    [
      { key: "dateTime", label: t("auditLogs.dateTime"), hideable: false },
      { key: "actor", label: t("auditLogs.actor") },
      { key: "action", label: t("auditLogs.action") },
      { key: "target", label: t("auditLogs.target") },
      { key: "tenant", label: t("auditLogs.tenant"), isEmpty: (l) => !(l.tenant_name || l.tenant) },
      { key: "ip", label: t("auditLogs.ip"), isEmpty: (l) => !(l.ip_address || l.ip) },
    ],
    logList
  );

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("auditLogs.title")}
        subtitle={t("auditLogs.subtitle")}
        secondaryActions={[
          {
            key: "export",
            label: t("auditLogs.exportCsv"),
            icon: Download,
            disabled: logList.length === 0,
            onSelect: () =>
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
              ),
          },
        ]}
      />

      <Card>
        <CardHeader>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <CardTitle>{t("auditLogs.list")}</CardTitle>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <ColumnPicker columns={columns} />
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
          <MobileCardList isEmpty={logList.length === 0} emptyLabel={t("auditLogs.noLogs")}>
            {logList.map((log, idx) => (
              <MobileCard
                key={String(log.id || idx)}
                title={String(log.action || "-")}
                subtitle={String(log.actor_name || log.admin_name || log.actor || "-")}
                badges={
                  <span className="text-xs text-gray-500 dark:text-gray-400">
                    {log.created_at || log.timestamp
                      ? new Date(String(log.created_at || log.timestamp)).toLocaleString()
                      : "-"}
                  </span>
                }
                fields={[
                  {
                    label: t("auditLogs.target"),
                    value: `${String(log.target || log.target_type || "-")}${
                      log.target_id ? ` (${String(log.target_id).slice(0, 8)}...)` : ""
                    }`,
                  },
                  { label: t("auditLogs.tenant"), value: String(log.tenant_name || log.tenant || "-") },
                  {
                    label: t("auditLogs.ip"),
                    value: log.ip_address || log.ip ? String(log.ip_address || log.ip) : null,
                  },
                ]}
              />
            ))}
          </MobileCardList>
          {/* Desktop table view */}
          <div className="hidden md:block overflow-x-auto">
            <Table className="min-w-200">
              <TableHeader>
                <TableRow>
                  <TableHead>{t("auditLogs.dateTime")}</TableHead>
                  {columns.show("actor") && <TableHead>{t("auditLogs.actor")}</TableHead>}
                  {columns.show("action") && <TableHead>{t("auditLogs.action")}</TableHead>}
                  {columns.show("target") && <TableHead>{t("auditLogs.target")}</TableHead>}
                  {columns.show("tenant") && <TableHead>{t("auditLogs.tenant")}</TableHead>}
                  {columns.show("ip") && <TableHead>{t("auditLogs.ip")}</TableHead>}
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
                      {columns.show("actor") && (
                        <TableCell className="font-medium text-gray-900 dark:text-gray-100">
                          {String(log.actor_name || log.admin_name || log.actor || "-")}
                        </TableCell>
                      )}
                      {columns.show("action") && (
                        <TableCell className="text-gray-600 dark:text-gray-400">
                          {String(log.action || "-")}
                        </TableCell>
                      )}
                      {columns.show("target") && (
                        <TableCell className="text-gray-600 dark:text-gray-400">
                          {String(log.target || log.target_type || "-")}
                          {log.target_id ? ` (${String(log.target_id).slice(0, 8)}...)` : ""}
                        </TableCell>
                      )}
                      {columns.show("tenant") && (
                        <TableCell className="text-gray-600 dark:text-gray-400">
                          {String(log.tenant_name || log.tenant || "-")}
                        </TableCell>
                      )}
                      {columns.show("ip") && (
                        <TableCell className="text-gray-600 dark:text-gray-400">
                          {String(log.ip_address || log.ip || "-")}
                        </TableCell>
                      )}
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={columns.visibleCount} className="text-center text-gray-500 dark:text-gray-400 py-8">
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
