"use client";

import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, Eraser } from "lucide-react";
import { exportToCsv } from "@/lib/csv-export";
import {
  Button,
  Card,
  CardContent,
  Modal,
  Badge,
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui";
import { adminRateLimitsApi } from "@/lib/admin-api";
import { MobileCard, MobileCardList } from "@/features/admin/components/MobileCard";
import { useSuperAdminOnly } from "@/features/admin/hooks/useSuperAdmin";

type RateLimitGroup = {
  tenant_id: string;
  tenant_name: string | null;
  tenant_slug: string | null;
  endpoints: Record<string, unknown>[];
};

export function RateLimitsPage() {
  const { t } = useTranslation("admin");
  const superOnly = useSuperAdminOnly();
  const queryClient = useQueryClient();
  const [clearing, setClearing] = useState<RateLimitGroup | null>(null);
  const { data, isLoading } = useQuery({
    queryKey: ["admin-rate-limits"],
    queryFn: adminRateLimitsApi.getAll,
  });

  // Acknowledging an incident: the rows are unflagged, never deleted.
  const clearFlags = useMutation({
    mutationFn: (tenantId: string) => adminRateLimitsApi.clear(tenantId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-rate-limits"] });
    },
  });

  const handleClear = async () => {
    if (!clearing) return;
    await clearFlags.mutateAsync(clearing.tenant_id);
    setClearing(null);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600" />
      </div>
    );
  }

  const groups = (data || []) as unknown as RateLimitGroup[];

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-gray-100">
            {t("rate_limits.title")}
          </h1>
          <p className="text-sm sm:text-base text-gray-500 dark:text-gray-400">
            {t("rate_limits.description")}
          </p>
        </div>
        <Button
          variant="secondary"
          size="sm"
          disabled={groups.length === 0}
          onClick={() =>
            exportToCsv(
              groups as unknown as Record<string, unknown>[],
              [
                { header: t("rate_limits.tenant"), accessor: (r) => String(r.tenant_name ?? "") },
                { header: "tenant_id", accessor: (r) => String(r.tenant_id ?? "") },
                {
                  header: t("rate_limits.flagged_endpoints"),
                  accessor: (r) => (r.endpoints as unknown[]).length,
                },
              ],
              "rate-limits"
            )
          }
        >
          <Download className="h-4 w-4 me-2" />
          {t("rate_limits.exportCsv")}
        </Button>
      </div>

      <Card>
        <CardContent className="p-0">
          <MobileCardList isEmpty={groups.length === 0} emptyLabel={t("rate_limits.empty")}>
            {groups.map((group) => (
              <MobileCard
                key={group.tenant_id}
                title={group.tenant_name || t("rate_limits.unknownTenant")}
                subtitle={<span className="font-mono text-xs">{group.tenant_id}</span>}
                badges={<Badge variant="danger">{t("rate_limits.flagged")}</Badge>}
                fields={[
                  {
                    label: t("rate_limits.flagged_endpoints"),
                    value: `${group.endpoints.length} ${t("rate_limits.endpoints")}`,
                  },
                ]}
                actions={
                  <Button
                    {...superOnly.button}
                    variant="secondary"
                    size="sm"
                    onClick={() => setClearing(group)}
                  >
                    <Eraser className="h-4 w-4 me-1" />
                    {t("rate_limits.clear")}
                  </Button>
                }
              />
            ))}
          </MobileCardList>
          <div className="hidden md:block overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("rate_limits.tenant")}</TableHead>
                  <TableHead>{t("rate_limits.flagged_endpoints")}</TableHead>
                  <TableHead>{t("rate_limits.status")}</TableHead>
                  <TableHead className="w-28">{t("rate_limits.actions")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {groups.map((group) => (
                  <TableRow key={group.tenant_id}>
                    <TableCell className="text-gray-900 dark:text-gray-100">
                      <span className="font-medium">{group.tenant_name || t("rate_limits.unknownTenant")}</span>
                      <span className="block font-mono text-xs text-gray-400">{group.tenant_id}</span>
                    </TableCell>
                    <TableCell className="text-gray-600 dark:text-gray-400">
                      {group.endpoints.length} {t("rate_limits.endpoints")}
                    </TableCell>
                    <TableCell>
                      <Badge variant="danger">
                        {t("rate_limits.flagged")}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Button
                        {...superOnly.button}
                        variant="secondary"
                        size="sm"
                        onClick={() => setClearing(group)}
                      >
                        <Eraser className="h-4 w-4 me-1" />
                        {t("rate_limits.clear")}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
                {groups.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center text-gray-500 dark:text-gray-400 py-8">
                      {t("rate_limits.empty")}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Modal
        isOpen={!!clearing}
        onClose={() => setClearing(null)}
        title={t("rate_limits.clearTitle")}
        size="sm"
      >
        <p className="text-gray-600 dark:text-gray-400 mb-6">
          {t("rate_limits.clearConfirm", {
            tenant: clearing?.tenant_name || clearing?.tenant_id || "",
          })}
        </p>
        <div className="flex justify-end gap-3">
          <Button variant="secondary" onClick={() => setClearing(null)}>
            {t("rate_limits.cancel")}
          </Button>
          <Button {...superOnly.button} onClick={handleClear} isLoading={clearFlags.isPending}>
            {t("rate_limits.clear")}
          </Button>
        </div>
      </Modal>
    </div>
  );
}
