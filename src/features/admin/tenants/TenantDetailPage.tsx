"use client";

import { useState } from "react";
import { useRouter } from "@/lib/navigation";
import { useTranslation } from "react-i18next";
import { ArrowLeft, Pause, Play, Trash2 } from "lucide-react";
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Modal,
  Badge,
} from "@/components/ui";
import {
  useAdminTenant,
  useSuspendTenant,
  useActivateTenant,
  useDeleteTenant,
} from "./hooks/useTenants";

type TenantDetail = Record<string, unknown>;

function getStatusVariant(status: string): "success" | "warning" | "danger" | "default" {
  switch (status) {
    case "active":
      return "success";
    case "pending":
      return "warning";
    case "expired":
    case "suspended":
      return "danger";
    default:
      return "default";
  }
}

function InfoField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-sm text-gray-500 dark:text-gray-400">{label}</p>
      <p className="font-medium text-gray-900 dark:text-gray-100">{value}</p>
    </div>
  );
}

export function TenantDetailPage({ tenantId }: { tenantId: string }) {
  const { t } = useTranslation("admin");
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<"info" | "subscription" | "users" | "onboarding">("info");
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);

  const { data, isLoading } = useAdminTenant(tenantId);
  const suspendTenant = useSuspendTenant();
  const activateTenant = useActivateTenant();
  const deleteTenant = useDeleteTenant();

  const tenant = data as TenantDetail | undefined;

  const handleToggleStatus = async () => {
    if (!tenant) return;
    if (tenant.status === "suspended") {
      await activateTenant.mutateAsync(tenantId);
    } else {
      await suspendTenant.mutateAsync(tenantId);
    }
  };

  const handleDelete = async () => {
    await deleteTenant.mutateAsync(tenantId);
    router.push("/admin/tenants");
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600" />
      </div>
    );
  }

  if (!tenant) {
    return (
      <div className="text-center py-12 text-gray-500 dark:text-gray-400">
        {t("tenants.notFound")}
      </div>
    );
  }

  const tabs = [
    { key: "info" as const, label: t("tenants.detail.info") },
    { key: "subscription" as const, label: t("tenants.detail.subscription") },
    { key: "users" as const, label: t("tenants.detail.users") },
    { key: "onboarding" as const, label: t("tenants.detail.onboarding") },
  ];

  const subscription = tenant.subscription as Record<string, unknown> | undefined;
  const users = (tenant.users || []) as Record<string, unknown>[];
  const onboarding = tenant.onboarding as Record<string, unknown> | undefined;
  const onboardingSteps = (onboarding?.steps || []) as Record<string, unknown>[];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.push("/admin/tenants")}
            className="p-1 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 transition-colors"
            aria-label={t("tenants.backToTenants")}
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-gray-100">
                {String(tenant.name || t("tenants.unnamedTenant"))}
              </h1>
              <Badge variant={getStatusVariant(String(tenant.status || ""))}>
                {String(tenant.status || "-")}
              </Badge>
            </div>
            <p className="text-sm text-gray-500 dark:text-gray-400">{String(tenant.slug || "")}</p>
          </div>
        </div>
        <div className="flex gap-2 self-start sm:self-auto">
          <Button
            variant="secondary"
            size="sm"
            onClick={handleToggleStatus}
            isLoading={suspendTenant.isPending || activateTenant.isPending}
          >
            {tenant.status === "suspended" ? (
              <><Play className="h-4 w-4 mr-2" />{t("tenants.activate")}</>
            ) : (
              <><Pause className="h-4 w-4 mr-2" />{t("tenants.suspend")}</>
            )}
          </Button>
          <Button variant="danger" size="sm" onClick={() => setDeleteConfirmOpen(true)}>
            <Trash2 className="h-4 w-4 mr-2" />
            {t("tenants.delete")}
          </Button>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200 dark:border-gray-700">
        <nav className="flex gap-4 -mb-px">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`pb-3 px-1 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tab.key
                  ? "border-primary-600 text-primary-600 dark:text-primary-400"
                  : "border-transparent text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 hover:border-gray-300"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Tab Content */}
      {activeTab === "info" && (
        <Card>
          <CardHeader>
            <CardTitle>{t("tenants.detail.tenantInformation")}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <InfoField label={t("tenants.detail.name")} value={String(tenant.name || "-")} />
              <InfoField label={t("tenants.detail.slug")} value={String(tenant.slug || "-")} />
              <InfoField label={t("tenants.detail.status")} value={String(tenant.status || "-")} />
              <InfoField
                label={t("tenants.detail.created")}
                value={tenant.created_at ? new Date(String(tenant.created_at)).toLocaleString() : "-"}
              />
              <InfoField
                label={t("tenants.detail.lastActive")}
                value={tenant.last_active_at ? new Date(String(tenant.last_active_at)).toLocaleString() : "-"}
              />
              <InfoField label={t("tenants.detail.userCount")} value={String(tenant.user_count ?? tenant.users_count ?? "-")} />
            </div>
          </CardContent>
        </Card>
      )}

      {activeTab === "subscription" && (
        <Card>
          <CardHeader>
            <CardTitle>{t("tenants.detail.subscriptionDetails")}</CardTitle>
          </CardHeader>
          <CardContent>
            {subscription ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <InfoField label={t("tenants.detail.plan")} value={String(subscription.plan_name || subscription.plan || "-")} />
                <div>
                  <p className="text-sm text-gray-500 dark:text-gray-400">{t("tenants.detail.status")}</p>
                  <Badge variant={getStatusVariant(String(subscription.status || ""))}>
                    {String(subscription.status || "-")}
                  </Badge>
                </div>
                <InfoField label={t("tenants.detail.billingCycle")} value={String(subscription.billing_cycle || "-")} />
                <InfoField
                  label={t("tenants.detail.price")}
                  value={
                    subscription.price != null
                      ? (Number(subscription.price) / 100).toLocaleString() + " " + String(subscription.currency || "")
                      : "-"
                  }
                />
                <InfoField
                  label={t("tenants.detail.periodStart")}
                  value={subscription.period_start ? new Date(String(subscription.period_start)).toLocaleDateString() : "-"}
                />
                <InfoField
                  label={t("tenants.detail.periodEnd")}
                  value={subscription.period_end ? new Date(String(subscription.period_end)).toLocaleDateString() : "-"}
                />
                <InfoField
                  label={t("tenants.detail.created")}
                  value={subscription.created_at ? new Date(String(subscription.created_at)).toLocaleString() : "-"}
                />
              </div>
            ) : (
              <p className="text-gray-500 dark:text-gray-400">{t("tenants.detail.noSubscription")}</p>
            )}
          </CardContent>
        </Card>
      )}

      {activeTab === "users" && (
        <Card>
          <CardHeader>
            <CardTitle>{t("tenants.detail.users")} ({users.length})</CardTitle>
          </CardHeader>
          <CardContent>
            {users.length > 0 ? (
              <div className="space-y-3">
                {users.map((user) => (
                  <div
                    key={String(user.id)}
                    className="flex items-center justify-between p-3 rounded-lg border border-gray-200 dark:border-gray-700"
                  >
                    <div>
                      <p className="font-medium text-gray-900 dark:text-gray-100">
                        {String(user.display_name || user.name || user.username || "-")}
                      </p>
                      <p className="text-sm text-gray-500 dark:text-gray-400">
                        {String(user.email || "-")}
                      </p>
                    </div>
                    <Badge variant={user.role === "admin" ? "info" : "default"}>
                      {String(user.role || "user")}
                    </Badge>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-gray-500 dark:text-gray-400">{t("tenants.detail.noUsers")}</p>
            )}
          </CardContent>
        </Card>
      )}

      {activeTab === "onboarding" && (
        <Card>
          <CardHeader>
            <CardTitle>{t("tenants.detail.onboardingStatus")}</CardTitle>
          </CardHeader>
          <CardContent>
            {onboardingSteps.length > 0 ? (
              <div className="space-y-3">
                {onboardingSteps.map((step, idx) => (
                  <div
                    key={idx}
                    className="flex items-center justify-between p-3 rounded-lg border border-gray-200 dark:border-gray-700"
                  >
                    <div>
                      <p className="font-medium text-gray-900 dark:text-gray-100">
                        {String(step.name || step.step || `Step ${idx + 1}`)}
                      </p>
                      {step.description ? (
                        <p className="text-sm text-gray-500 dark:text-gray-400">
                          {String(step.description)}
                        </p>
                      ) : null}
                    </div>
                    <Badge variant={step.completed ? "success" : "default"}>
                      {step.completed ? t("tenants.detail.completed") : t("tenants.pending")}
                    </Badge>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-gray-500 dark:text-gray-400">{t("tenants.detail.noOnboarding")}</p>
            )}
          </CardContent>
        </Card>
      )}

      {/* Delete Confirmation Modal */}
      <Modal
        isOpen={deleteConfirmOpen}
        onClose={() => setDeleteConfirmOpen(false)}
        title={t("tenants.confirmDeleteTitle")}
        size="sm"
      >
        <p className="text-gray-600 dark:text-gray-400 mb-6">
          {t("tenants.detail.confirmDeleteMessage", { name: String(tenant.name) })}
        </p>
        <div className="flex justify-end gap-3">
          <Button variant="secondary" onClick={() => setDeleteConfirmOpen(false)}>
            {t("tenants.cancel")}
          </Button>
          <Button
            variant="danger"
            onClick={handleDelete}
            isLoading={deleteTenant.isPending}
          >
            {t("tenants.delete")}
          </Button>
        </div>
      </Modal>
    </div>
  );
}
