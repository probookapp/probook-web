"use client";

import { useTranslation } from "react-i18next";
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
import { useAdminReferrals } from "./hooks/useReferrals";

type ReferralCode = Record<string, unknown>;

export function ReferralsPage() {
  const { t } = useTranslation("admin");
  const { data: referrals, isLoading } = useAdminReferrals();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600" />
      </div>
    );
  }

  const list = (referrals || []) as ReferralCode[];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-gray-100">
          {t("referrals.title")}
        </h1>
        <p className="text-sm sm:text-base text-gray-500 dark:text-gray-400">
          {t("referrals.description")}
        </p>
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("referrals.tenant")}</TableHead>
                  <TableHead>{t("referrals.code")}</TableHead>
                  <TableHead>{t("referrals.active")}</TableHead>
                  <TableHead>{t("referrals.referrals_count")}</TableHead>
                  <TableHead>{t("referrals.converted_count")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {list.map((rc) => {
                  const tenant = rc.tenant as Record<string, unknown> | undefined;
                  return (
                    <TableRow key={String(rc.id)}>
                      <TableCell className="font-medium text-gray-900 dark:text-gray-100">
                        {tenant ? String(tenant.name || "-") : "-"}
                      </TableCell>
                      <TableCell className="font-mono text-gray-600 dark:text-gray-400">
                        {String(rc.code || "-")}
                      </TableCell>
                      <TableCell>
                        <Badge variant={rc.is_active ? "success" : "default"}>
                          {rc.is_active ? t("common.yes") : t("common.no")}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-gray-900 dark:text-gray-100">
                        {String(rc.referrals_count ?? 0)}
                      </TableCell>
                      <TableCell className="text-gray-900 dark:text-gray-100">
                        {String(rc.converted_count ?? 0)}
                      </TableCell>
                    </TableRow>
                  );
                })}
                {list.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-gray-500 dark:text-gray-400 py-8">
                      {t("referrals.empty")}
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
