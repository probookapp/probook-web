"use client";

import { useState } from "react";
import { useRouter } from "@/lib/navigation";
import { useTranslation } from "react-i18next";
import { ArrowLeft, Pause, Play, Trash2, Gift, CalendarX, Power, KeyRound } from "lucide-react";
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Modal,
  Badge,
  Input,
} from "@/components/ui";
import {
  useAdminTenant,
  useSuspendTenant,
  useActivateTenant,
  useDeleteTenant,
  useGrantTrial,
  useEndTrial,
} from "./hooks/useTenants";
import { TenantFeaturesTab } from "./components/TenantFeaturesTab";
import {
  useDisableUser,
  useResetUserPassword,
} from "@/features/admin/users/hooks/useAdminUsers";
import { useSuperAdminOnly } from "@/features/admin/hooks/useSuperAdmin";
import { useAdminSubscriptionInvoices } from "@/features/admin/subscription-invoices/hooks/useSubscriptionInvoices";

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
  const superOnly = useSuperAdminOnly();
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<
    "info" | "subscription" | "invoices" | "users" | "onboarding" | "features"
  >("info");
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [trialModalOpen, setTrialModalOpen] = useState(false);
  const [endTrialConfirmOpen, setEndTrialConfirmOpen] = useState(false);
  const [trialDays, setTrialDays] = useState("10");
  const [resetUser, setResetUser] = useState<Record<string, unknown> | null>(null);
  const [newPassword, setNewPassword] = useState("");

  const { data, isLoading } = useAdminTenant(tenantId);
  const suspendTenant = useSuspendTenant();
  const activateTenant = useActivateTenant();
  const deleteTenant = useDeleteTenant();
  const grantTrial = useGrantTrial();
  const endTrial = useEndTrial();
  const { data: invoicesData } = useAdminSubscriptionInvoices(
    { tenantId },
    { enabled: activeTab === "invoices" }
  );
  const invoices = (invoicesData || []) as Record<string, unknown>[];
  const toggleUser = useDisableUser();
  const resetPassword = useResetUserPassword();

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetUser) return;
    await resetPassword.mutateAsync({
      id: String(resetUser.id),
      input: { new_password: newPassword },
    });
    setResetUser(null);
    setNewPassword("");
  };

  const tenant = data as TenantDetail | undefined;

  const handleGrantTrial = async () => {
    const days = parseInt(trialDays, 10);
    if (!Number.isFinite(days) || days < 1) return;
    await grantTrial.mutateAsync({ id: tenantId, days });
    setTrialModalOpen(false);
  };

  const handleEndTrial = async () => {
    await endTrial.mutateAsync(tenantId);
    setEndTrialConfirmOpen(false);
  };

  const trialEndsAt = tenant?.trial_ends_at ? new Date(String(tenant.trial_ends_at)) : null;
  const trialActive = !!trialEndsAt && trialEndsAt.getTime() > new Date().getTime();

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
    { key: "invoices" as const, label: t("tenants.detail.invoices") },
    { key: "users" as const, label: t("tenants.detail.users") },
    { key: "onboarding" as const, label: t("tenants.detail.onboarding") },
    { key: "features" as const, label: t("tenants.detail.features") },
  ];

  // The route returns `subscriptions` (newest first), not a `subscription`
  // singular — reading the singular made this tab always say "no subscription".
  const subscriptions = (tenant.subscriptions || []) as Record<string, unknown>[];
  const subscription = subscriptions[0];
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
            className="p-1 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
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
            onClick={() => setTrialModalOpen(true)}
          >
            <Gift className="h-4 w-4 me-2" />
            {trialActive ? t("tenants.trial.extend") : t("tenants.trial.grant")}
          </Button>
          {trialActive && (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setEndTrialConfirmOpen(true)}
            >
              <CalendarX className="h-4 w-4 me-2" />
              {t("tenants.trial.endNow")}
            </Button>
          )}
          <Button
            variant="secondary"
            size="sm"
            onClick={handleToggleStatus}
            isLoading={suspendTenant.isPending || activateTenant.isPending}
          >
            {tenant.status === "suspended" ? (
              <><Play className="h-4 w-4 me-2" />{t("tenants.activate")}</>
            ) : (
              <><Pause className="h-4 w-4 me-2" />{t("tenants.suspend")}</>
            )}
          </Button>
          <Button variant="danger" size="sm" onClick={() => setDeleteConfirmOpen(true)}>
            <Trash2 className="h-4 w-4 me-2" />
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
              <div>
                <p className="text-sm text-gray-500 dark:text-gray-400">{t("tenants.trial.label")}</p>
                {trialEndsAt ? (
                  <p className="font-medium text-gray-900 dark:text-gray-100">
                    <Badge variant={trialActive ? "success" : "default"}>
                      {trialActive ? t("tenants.trial.activeUntil", { date: trialEndsAt.toLocaleDateString() }) : t("tenants.trial.ended", { date: trialEndsAt.toLocaleDateString() })}
                    </Badge>
                  </p>
                ) : (
                  <p className="font-medium text-gray-900 dark:text-gray-100">{t("tenants.trial.none")}</p>
                )}
              </div>
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
                <InfoField
                  label={t("tenants.detail.plan")}
                  value={String(
                    (subscription.plan as Record<string, unknown> | undefined)?.name ||
                      subscription.plan_name ||
                      "-"
                  )}
                />
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
                    subscription.price_at_purchase != null
                      ? (Number(subscription.price_at_purchase) / 100).toLocaleString() +
                        " " +
                        String(subscription.currency || "")
                      : "-"
                  }
                />
                <InfoField
                  label={t("tenants.detail.periodStart")}
                  value={
                    subscription.current_period_start
                      ? new Date(String(subscription.current_period_start)).toLocaleDateString()
                      : "-"
                  }
                />
                <InfoField
                  label={t("tenants.detail.periodEnd")}
                  value={
                    subscription.current_period_end
                      ? new Date(String(subscription.current_period_end)).toLocaleDateString()
                      : "-"
                  }
                />
                <InfoField
                  label={t("tenants.detail.created")}
                  value={subscription.created_at ? new Date(String(subscription.created_at)).toLocaleString() : "-"}
                />
              </div>
            ) : (
              <p className="text-gray-500 dark:text-gray-400">{t("tenants.detail.noSubscription")}</p>
            )}

            {/* Everything before the current one: a cancelled or expired row is
                often what explains the tenant's present state. */}
            {subscriptions.length > 1 && (
              <div className="mt-6 pt-4 border-t border-gray-200 dark:border-gray-700">
                <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
                  {t("tenants.detail.subscriptionHistory")}
                </p>
                <div className="space-y-2">
                  {subscriptions.slice(1).map((sub) => (
                    <div
                      key={String(sub.id)}
                      className="flex flex-wrap items-center justify-between gap-2 p-3 rounded-lg border border-gray-200 dark:border-gray-700 text-sm"
                    >
                      <span className="font-medium text-gray-900 dark:text-gray-100">
                        {String((sub.plan as Record<string, unknown> | undefined)?.name || "-")}
                      </span>
                      <span className="text-gray-500 dark:text-gray-400">
                        {sub.current_period_start && sub.current_period_end
                          ? `${new Date(String(sub.current_period_start)).toLocaleDateString()} – ${new Date(String(sub.current_period_end)).toLocaleDateString()}`
                          : "-"}
                      </span>
                      <Badge variant={getStatusVariant(String(sub.status || ""))}>
                        {String(sub.status || "-")}
                      </Badge>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {activeTab === "invoices" && (
        <Card>
          <CardHeader>
            <CardTitle>
              {t("tenants.detail.invoices")} ({invoices.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            {invoices.length > 0 ? (
              <div className="space-y-2">
                {invoices.map((invoice) => (
                  <div
                    key={String(invoice.id)}
                    className="flex flex-wrap items-center justify-between gap-2 p-3 rounded-lg border border-gray-200 dark:border-gray-700 text-sm"
                  >
                    <span className="font-mono text-gray-900 dark:text-gray-100">
                      {String(invoice.invoice_number || "-")}
                    </span>
                    <span className="text-gray-500 dark:text-gray-400">
                      {invoice.period_start && invoice.period_end
                        ? `${new Date(String(invoice.period_start)).toLocaleDateString()} – ${new Date(String(invoice.period_end)).toLocaleDateString()}`
                        : "-"}
                    </span>
                    <span className="text-gray-900 dark:text-gray-100">
                      {(Number(invoice.amount || 0) / 100).toLocaleString()}{" "}
                      {String(invoice.currency || "")}
                    </span>
                    <Badge
                      variant={
                        invoice.status === "paid"
                          ? "success"
                          : invoice.status === "refunded"
                            ? "danger"
                            : "warning"
                      }
                    >
                      {String(invoice.status || "-")}
                    </Badge>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-gray-500 dark:text-gray-400">{t("tenants.detail.noInvoices")}</p>
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
                    className="flex flex-wrap items-center justify-between gap-3 p-3 rounded-lg border border-gray-200 dark:border-gray-700"
                  >
                    <div className="min-w-0">
                      <p className="font-medium text-gray-900 dark:text-gray-100">
                        {String(user.display_name || user.name || user.username || "-")}
                      </p>
                      <p className="text-sm text-gray-500 dark:text-gray-400">
                        {String(user.username || user.email || "-")}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant={user.is_active === false ? "danger" : "default"}>
                        {user.is_active === false
                          ? t("tenants.detail.userDisabled")
                          : t("tenants.detail.userActive")}
                      </Badge>
                      <Badge variant={user.role === "admin" ? "info" : "default"}>
                        {String(user.role || "user")}
                      </Badge>
                      {/* The same two actions the Users page offers, where you
                          actually go looking for them: on the tenant. */}
                      <Button
                        {...superOnly.button}
                        variant={user.is_active === false ? "primary" : "danger"}
                        size="sm"
                        onClick={() => toggleUser.mutateAsync(String(user.id))}
                        isLoading={toggleUser.isPending}
                      >
                        <Power className="h-4 w-4 me-1" />
                        {user.is_active === false
                          ? t("tenants.detail.enableUser")
                          : t("tenants.detail.disableUser")}
                      </Button>
                      <Button
                        {...superOnly.button}
                        variant="secondary"
                        size="sm"
                        onClick={() => {
                          setResetUser(user);
                          setNewPassword("");
                        }}
                      >
                        <KeyRound className="h-4 w-4 me-1" />
                        {t("tenants.detail.resetPassword")}
                      </Button>
                    </div>
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

      {activeTab === "features" && <TenantFeaturesTab tenantId={tenantId} />}

      {/* Grant / Extend Trial Modal */}
      <Modal
        isOpen={trialModalOpen}
        onClose={() => setTrialModalOpen(false)}
        title={trialActive ? t("tenants.trial.extend") : t("tenants.trial.grant")}
        size="sm"
      >
        <div className="space-y-4">
          <p className="text-sm text-gray-600 dark:text-gray-400">
            {t("tenants.trial.description")}
          </p>
          {subscriptions.some((s) => s.status === "active") && (
            <p className="text-sm text-amber-600 dark:text-amber-400">
              {t("tenants.trial.activeSubWarning")}
            </p>
          )}
          <Input
            type="number"
            min={1}
            max={365}
            label={t("tenants.trial.daysLabel")}
            value={trialDays}
            onChange={(e) => setTrialDays(e.target.value)}
          />
        </div>
        <div className="flex justify-end gap-3 mt-6">
          <Button variant="secondary" onClick={() => setTrialModalOpen(false)}>
            {t("tenants.cancel")}
          </Button>
          <Button
  {...superOnly.button} onClick={handleGrantTrial} isLoading={grantTrial.isPending}>
            {t("tenants.trial.confirm")}
          </Button>
        </div>
      </Modal>

      {/* Reset a tenant user's password */}
      <Modal
        isOpen={!!resetUser}
        onClose={() => setResetUser(null)}
        title={t("tenants.detail.resetPassword")}
        size="sm"
      >
        <form onSubmit={handleResetPassword} className="space-y-4">
          <p className="text-sm text-gray-600 dark:text-gray-400">
            {t("tenants.detail.resetPasswordFor", {
              username: String(resetUser?.username || resetUser?.display_name || ""),
            })}
          </p>
          <Input
            name="tenant-user-new-password"
            type="password"
            label={t("tenants.detail.newPassword")}
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            required
            minLength={8}
          />
          <div className="flex justify-end gap-3">
            <Button variant="secondary" type="button" onClick={() => setResetUser(null)}>
              {t("tenants.cancel")}
            </Button>
            <Button {...superOnly.button} type="submit" isLoading={resetPassword.isPending}>
              {t("tenants.detail.resetPassword")}
            </Button>
          </div>
        </form>
      </Modal>

      {/* End Trial Confirmation */}
      <Modal
        isOpen={endTrialConfirmOpen}
        onClose={() => setEndTrialConfirmOpen(false)}
        title={t("tenants.trial.endTitle")}
        size="sm"
      >
        <p className="text-gray-600 dark:text-gray-400 mb-6">
          {t("tenants.trial.endMessage")}
        </p>
        <div className="flex justify-end gap-3">
          <Button variant="secondary" onClick={() => setEndTrialConfirmOpen(false)}>
            {t("tenants.cancel")}
          </Button>
          <Button
  {...superOnly.button} variant="danger" onClick={handleEndTrial} isLoading={endTrial.isPending}>
            {t("tenants.trial.endNow")}
          </Button>
        </div>
      </Modal>

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
            {...superOnly.button}
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
