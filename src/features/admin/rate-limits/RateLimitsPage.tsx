"use client";

import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import {
  Card,
  CardContent,
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

type RateLimitGroup = {
  tenant_id: string;
  tenant_name: string | null;
  tenant_slug: string | null;
  endpoints: Record<string, unknown>[];
};

export function RateLimitsPage() {
  const { t } = useTranslation("admin");
  const { data, isLoading } = useQuery({
    queryKey: ["admin-rate-limits"],
    queryFn: adminRateLimitsApi.getAll,
  });

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
      <div>
        <h1 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-gray-100">
          {t("rate_limits.title")}
        </h1>
        <p className="text-sm sm:text-base text-gray-500 dark:text-gray-400">
          {t("rate_limits.description")}
        </p>
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
                  </TableRow>
                ))}
                {groups.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={3} className="text-center text-gray-500 dark:text-gray-400 py-8">
                      {t("rate_limits.empty")}
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
