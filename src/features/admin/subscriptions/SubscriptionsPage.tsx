"use client";

import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Search, RefreshCw, XCircle } from "lucide-react";
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Modal,
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
  Input,
  Badge,
  Select,
} from "@/components/ui";
import {
  useAdminSubscriptions,
  useRenewSubscription,
  useCancelSubscription,
} from "./hooks/useSubscriptions";

type Subscription = Record<string, unknown>;

function getStatusVariant(status: string): "success" | "warning" | "danger" | "default" {
  switch (status) {
    case "active":
      return "success";
    case "pending":
      return "warning";
    case "expired":
    case "suspended":
      return "danger";
    case "cancelled":
      return "default";
    default:
      return "default";
  }
}

export function SubscriptionsPage() {
  const { t } = useTranslation("admin");
  const [statusFilter, setStatusFilter] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [renewConfirmId, setRenewConfirmId] = useState<string | null>(null);
  const [cancelConfirmId, setCancelConfirmId] = useState<string | null>(null);

  const { data: subscriptions, isLoading } = useAdminSubscriptions({
    status: statusFilter || undefined,
    search: searchQuery || undefined,
  });
  const renewSubscription = useRenewSubscription();
  const cancelSubscription = useCancelSubscription();

  const handleRenew = async (id: string) => {
    await renewSubscription.mutateAsync({ id, input: {} });
    setRenewConfirmId(null);
  };

  const handleCancel = async (id: string) => {
    await cancelSubscription.mutateAsync(id);
    setCancelConfirmId(null);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600" />
      </div>
    );
  }

  const subList = (subscriptions || []) as Subscription[];

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-gray-100">{t("subscriptions.title")}</h1>
          <p className="text-sm sm:text-base text-gray-500 dark:text-gray-400">{t("subscriptions.subtitle")}</p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <CardTitle>{t("subscriptions.list")}</CardTitle>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <Select
                name="status-filter"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="w-full sm:w-40"
                options={[
                  { value: "", label: t("subscriptions.allStatuses") },
                  { value: "active", label: t("subscriptions.active") },
                  { value: "pending", label: t("subscriptions.pending") },
                  { value: "expired", label: t("subscriptions.expired") },
                  { value: "suspended", label: t("subscriptions.suspended") },
                  { value: "cancelled", label: t("subscriptions.cancelled") },
                ]}
              />
              <div className="relative w-full sm:w-56">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                <Input
                  name="subscription-search"
                  placeholder={t("subscriptions.searchPlaceholder")}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  autoComplete="off"
                  className="pl-9"
                />
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {/* Mobile card view */}
          <div className="md:hidden divide-y">
            {subList.length > 0 ? (
              subList.map((sub) => (
                <div key={String(sub.id)} className="p-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-gray-900 dark:text-gray-100">
                      {String(
                        (sub.tenant as Record<string, unknown>)?.name ||
                        sub.tenant_name ||
                        "-"
                      )}
                    </span>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setRenewConfirmId(String(sub.id))}
                        className="p-1 text-gray-500 hover:text-primary-600 dark:hover:text-primary-400 transition-colors"
                        title={t("subscriptions.renew")}
                        aria-label={t("subscriptions.renew")}
                      >
                        <RefreshCw className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => setCancelConfirmId(String(sub.id))}
                        className="p-1 text-gray-500 hover:text-red-600 transition-colors"
                        title={t("subscriptions.cancel")}
                        aria-label={t("subscriptions.cancel")}
                      >
                        <XCircle className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-gray-600 dark:text-gray-400">
                      {String(sub.plan_name || sub.plan || "-")}
                    </span>
                    <Badge variant={getStatusVariant(String(sub.status || ""))}>
                      {String(sub.status || "-")}
                    </Badge>
                  </div>
                  <div className="flex items-center justify-between text-sm text-gray-500">
                    <span>{String(sub.billing_cycle || "-")}</span>
                    <span>
                      {sub.price != null
                        ? (Number(sub.price) / 100).toLocaleString() + " " + String(sub.currency || "")
                        : "-"}
                    </span>
                  </div>
                  <div className="text-sm text-gray-500">
                    {sub.period_start && sub.period_end
                      ? `${new Date(String(sub.period_start)).toLocaleDateString()} - ${new Date(String(sub.period_end)).toLocaleDateString()}`
                      : "-"}
                  </div>
                </div>
              ))
            ) : (
              <div className="text-center text-gray-500 dark:text-gray-400 py-8">
                {t("subscriptions.noSubscriptions")}
              </div>
            )}
          </div>

          {/* Desktop table view */}
          <div className="hidden md:block overflow-x-auto">
            <Table className="min-w-[900px]">
              <TableHeader>
                <TableRow>
                  <TableHead>{t("subscriptions.tenant")}</TableHead>
                  <TableHead>{t("subscriptions.plan")}</TableHead>
                  <TableHead>{t("subscriptions.status")}</TableHead>
                  <TableHead>{t("subscriptions.billingCycle")}</TableHead>
                  <TableHead>{t("subscriptions.period")}</TableHead>
                  <TableHead>{t("subscriptions.price")}</TableHead>
                  <TableHead className="w-28">{t("subscriptions.actions")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {subList.length > 0 ? (
                  subList.map((sub) => (
                    <TableRow key={String(sub.id)}>
                      <TableCell className="font-medium text-gray-900 dark:text-gray-100">
                        {String(
                          (sub.tenant as Record<string, unknown>)?.name ||
                          sub.tenant_name ||
                          "-"
                        )}
                      </TableCell>
                      <TableCell className="text-gray-600 dark:text-gray-400">
                        {String(sub.plan_name || sub.plan || "-")}
                      </TableCell>
                      <TableCell>
                        <Badge variant={getStatusVariant(String(sub.status || ""))}>
                          {String(sub.status || "-")}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-gray-600 dark:text-gray-400">
                        {String(sub.billing_cycle || "-")}
                      </TableCell>
                      <TableCell className="text-gray-600 dark:text-gray-400">
                        {sub.period_start && sub.period_end
                          ? `${new Date(String(sub.period_start)).toLocaleDateString()} - ${new Date(String(sub.period_end)).toLocaleDateString()}`
                          : "-"}
                      </TableCell>
                      <TableCell className="text-gray-600 dark:text-gray-400">
                        {sub.price != null
                          ? (Number(sub.price) / 100).toLocaleString() + " " + String(sub.currency || "")
                          : "-"}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => setRenewConfirmId(String(sub.id))}
                            className="p-1 text-gray-500 hover:text-primary-600 dark:hover:text-primary-400 transition-colors"
                            title={t("subscriptions.renew")}
                            aria-label={t("subscriptions.renew")}
                          >
                            <RefreshCw className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => setCancelConfirmId(String(sub.id))}
                            className="p-1 text-gray-500 hover:text-red-600 transition-colors"
                            title={t("subscriptions.cancel")}
                            aria-label={t("subscriptions.cancel")}
                          >
                            <XCircle className="h-4 w-4" />
                          </button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-gray-500 dark:text-gray-400 py-8">
                      {t("subscriptions.noSubscriptions")}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Renew Confirmation */}
      <Modal
        isOpen={!!renewConfirmId}
        onClose={() => setRenewConfirmId(null)}
        title={t("subscriptions.confirmRenewalTitle")}
        size="sm"
      >
        <p className="text-gray-600 dark:text-gray-400 mb-6">
          {t("subscriptions.confirmRenewalMessage")}
        </p>
        <div className="flex justify-end gap-3">
          <Button variant="secondary" onClick={() => setRenewConfirmId(null)}>
            {t("subscriptions.cancel")}
          </Button>
          <Button
            onClick={() => renewConfirmId && handleRenew(renewConfirmId)}
            isLoading={renewSubscription.isPending}
          >
            {t("subscriptions.renew")}
          </Button>
        </div>
      </Modal>

      {/* Cancel Confirmation */}
      <Modal
        isOpen={!!cancelConfirmId}
        onClose={() => setCancelConfirmId(null)}
        title={t("subscriptions.confirmCancellationTitle")}
        size="sm"
      >
        <p className="text-gray-600 dark:text-gray-400 mb-6">
          {t("subscriptions.confirmCancellationMessage")}
        </p>
        <div className="flex justify-end gap-3">
          <Button variant="secondary" onClick={() => setCancelConfirmId(null)}>
            {t("subscriptions.keepActive")}
          </Button>
          <Button
            variant="danger"
            onClick={() => cancelConfirmId && handleCancel(cancelConfirmId)}
            isLoading={cancelSubscription.isPending}
          >
            {t("subscriptions.cancelSubscription")}
          </Button>
        </div>
      </Modal>
    </div>
  );
}
