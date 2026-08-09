"use client";

import { useState, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Search, RefreshCw, XCircle, Pencil, Download, Plus } from "lucide-react";
import { exportToCsv } from "@/lib/csv-export";
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
  SearchableSelect,
} from "@/components/ui";
import { LoadMoreSentinel } from "@/components/shared/LoadMoreSentinel";
import {
  useAdminSubscriptionsInfinite,
  useRenewSubscription,
  useCancelSubscription,
  useUpdateSubscription,
  useCreateSubscription,
} from "./hooks/useSubscriptions";
import { useAdminPlans } from "@/features/admin/plans/hooks/usePlans";
import { useAdminTenants } from "@/features/admin/tenants/hooks/useTenants";

type Subscription = Record<string, unknown>;
type PlanPrice = { currency: string; monthly_price: number; yearly_price: number };
type PlanOption = {
  id: string;
  name?: string;
  slug?: string;
  currency?: string;
  monthly_price?: number;
  yearly_price?: number;
  prices?: PlanPrice[];
};
type TenantOption = { id: string; name?: string; slug?: string };

const EMPTY_CREATE_FORM = {
  tenant_id: "",
  plan_id: "",
  billing_cycle: "yearly",
  currency: "",
  price: "",
  current_period_end: "",
  create_invoice: true,
};

// The list route returns Prisma rows (snake-cased): the plan is a nested object
// and the period/price columns live under current_period_* / price_at_purchase.
// Reading `plan`/`period_*`/`price` directly printed "[object Object]" and "-".
function planNameOf(sub: Subscription): string {
  const plan = sub.plan as Record<string, unknown> | undefined;
  return String(plan?.name || sub.plan_name || "-");
}
function periodStartOf(sub: Subscription) {
  return sub.current_period_start ?? sub.period_start;
}
function periodEndOf(sub: Subscription) {
  return sub.current_period_end ?? sub.period_end;
}
function priceOf(sub: Subscription) {
  return sub.price_at_purchase ?? sub.price;
}

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
  const [editSub, setEditSub] = useState<Subscription | null>(null);
  const [editForm, setEditForm] = useState({ plan_id: "", billing_cycle: "yearly", status: "active", current_period_end: "" });
  const [createOpen, setCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState(EMPTY_CREATE_FORM);

  // Status is forwarded to the route's server-side filter; the route has no
  // search filter, so the search box filters client-side over loaded pages.
  const {
    data: subscriptionPages,
    isLoading,
    hasNextPage,
    isFetchingNextPage,
    fetchNextPage,
  } = useAdminSubscriptionsInfinite(statusFilter || undefined);
  const subscriptions = useMemo(() => {
    const rows = subscriptionPages?.pages.flatMap((page) => page.data);
    if (!rows || !searchQuery) return rows;
    const search = searchQuery.toLowerCase();
    return rows.filter((s) => {
      const tenantName = String(
        (s.tenant as Record<string, unknown>)?.name || s.tenant_name || ""
      ).toLowerCase();
      return tenantName.includes(search);
    });
  }, [subscriptionPages, searchQuery]);
  const loadedCount = subscriptionPages?.pages.reduce((sum, page) => sum + page.data.length, 0) ?? 0;
  const { data: plansData } = useAdminPlans();
  const plans = (plansData || []) as unknown as PlanOption[];
  // Only fetched once the create modal opens — the picker is its only consumer.
  const { data: tenantsData } = useAdminTenants(undefined, { enabled: createOpen });
  const tenants = (tenantsData || []) as unknown as TenantOption[];
  const renewSubscription = useRenewSubscription();
  const cancelSubscription = useCancelSubscription();
  const updateSubscription = useUpdateSubscription();
  const createSubscription = useCreateSubscription();

  const createPlan = plans.find((p) => p.id === createForm.plan_id);
  // Currencies the selected plan can be sold in: its own plus any per-currency
  // price rows.
  const createCurrencies: string[] = createPlan
    ? [
        ...new Set(
          [
            createPlan.currency,
            ...(createPlan.prices || []).map((p) => p.currency),
          ].filter(Boolean) as string[]
        ),
      ]
    : [];
  // List price for the current plan/cycle/currency, shown as the placeholder so
  // leaving the override empty is visibly "charge the list price".
  const createPriceRow = (createPlan?.prices || []).find(
    (p) => p.currency === createForm.currency
  );
  const createListCentimes =
    createForm.billing_cycle === "monthly"
      ? createPriceRow?.monthly_price ?? createPlan?.monthly_price
      : createPriceRow?.yearly_price ?? createPlan?.yearly_price;
  const createListPrice = createListCentimes == null ? null : createListCentimes / 100;

  const handleRenew = async (id: string) => {
    await renewSubscription.mutateAsync({ id, input: {} });
    setRenewConfirmId(null);
  };

  const handleCancel = async (id: string) => {
    await cancelSubscription.mutateAsync(id);
    setCancelConfirmId(null);
  };

  const handleOpenEdit = (sub: Subscription) => {
    setEditSub(sub);
    setEditForm({
      plan_id: String(sub.plan_id || ""),
      billing_cycle: String(sub.billing_cycle || "yearly"),
      status: String(sub.status || "active"),
      current_period_end: periodEndOf(sub)
        ? new Date(String(periodEndOf(sub))).toISOString().slice(0, 10)
        : "",
    });
  };

  const handleSaveEdit = async () => {
    if (!editSub) return;
    await updateSubscription.mutateAsync({
      id: String(editSub.id),
      input: {
        plan_id: editForm.plan_id || undefined,
        billing_cycle: editForm.billing_cycle,
        status: editForm.status,
        current_period_end: editForm.current_period_end || undefined,
      },
    });
    setEditSub(null);
  };

  const handleOpenCreate = () => {
    setCreateForm(EMPTY_CREATE_FORM);
    createSubscription.reset();
    setCreateOpen(true);
  };

  const handleSelectCreatePlan = (planId: string) => {
    const plan = plans.find((p) => p.id === planId);
    setCreateForm((prev) => ({
      ...prev,
      plan_id: planId,
      // Reset the currency to the plan's own whenever the plan changes, so the
      // price we resolve server-side always has a matching price row.
      currency: plan?.currency || "",
    }));
  };

  const handleCreate = async () => {
    if (!createForm.tenant_id || !createForm.plan_id) return;
    const priceOverride = createForm.price.trim();
    try {
      await createSubscription.mutateAsync({
        tenant_id: createForm.tenant_id,
        plan_id: createForm.plan_id,
        billing_cycle: createForm.billing_cycle,
        currency: createForm.currency || undefined,
        // Entered in currency units, stored in centimes like every other price.
        price: priceOverride ? Math.round(Number(priceOverride) * 100) : undefined,
        current_period_end: createForm.current_period_end || undefined,
        create_invoice: createForm.create_invoice,
      });
      setCreateOpen(false);
    } catch {
      // Message is rendered from the mutation's error state; keep the form open.
    }
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
        <div className="flex gap-2 self-start sm:self-auto">
          <Button size="sm" onClick={handleOpenCreate}>
            <Plus className="h-4 w-4 mr-2" />
            {t("subscriptions.create")}
          </Button>
          <Button
            variant="secondary"
            size="sm"
            disabled={subList.length === 0}
            onClick={() =>
              exportToCsv(
                subList,
                [
                  { header: t("subscriptions.tenant"), accessor: (r) => String((r.tenant as Record<string, unknown>)?.name ?? r.tenant_name ?? "") },
                  { header: t("subscriptions.plan"), accessor: (r) => planNameOf(r) },
                  { header: t("subscriptions.status"), accessor: (r) => String(r.status ?? "") },
                  { header: t("subscriptions.billingCycle"), accessor: (r) => String(r.billing_cycle ?? "") },
                  { header: t("subscriptions.price"), accessor: (r) => (priceOf(r) != null ? Number(priceOf(r)) / 100 : "") },
                ],
                "subscriptions"
              )
            }
          >
            <Download className="h-4 w-4 mr-2" />
            {t("subscriptions.exportCsv")}
          </Button>
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
                        onClick={() => handleOpenEdit(sub)}
                        className="p-1 text-gray-500 hover:text-primary-600 dark:hover:text-primary-400 transition-colors"
                        title={t("subscriptions.edit")}
                        aria-label={t("subscriptions.edit")}
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
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
                      {planNameOf(sub)}
                    </span>
                    <Badge variant={getStatusVariant(String(sub.status || ""))}>
                      {String(sub.status || "-")}
                    </Badge>
                  </div>
                  <div className="flex items-center justify-between text-sm text-gray-500">
                    <span>{String(sub.billing_cycle || "-")}</span>
                    <span>
                      {priceOf(sub) != null
                        ? (Number(priceOf(sub)) / 100).toLocaleString() + " " + String(sub.currency || "")
                        : "-"}
                    </span>
                  </div>
                  <div className="text-sm text-gray-500">
                    {periodStartOf(sub) && periodEndOf(sub)
                      ? `${new Date(String(periodStartOf(sub))).toLocaleDateString()} - ${new Date(String(periodEndOf(sub))).toLocaleDateString()}`
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
            <Table className="min-w-225">
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
                        {planNameOf(sub)}
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
                        {periodStartOf(sub) && periodEndOf(sub)
                          ? `${new Date(String(periodStartOf(sub))).toLocaleDateString()} - ${new Date(String(periodEndOf(sub))).toLocaleDateString()}`
                          : "-"}
                      </TableCell>
                      <TableCell className="text-gray-600 dark:text-gray-400">
                        {priceOf(sub) != null
                          ? (Number(priceOf(sub)) / 100).toLocaleString() + " " + String(sub.currency || "")
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
          <LoadMoreSentinel
            hasNextPage={!!hasNextPage}
            isFetchingNextPage={isFetchingNextPage}
            fetchNextPage={fetchNextPage}
            loadedCount={loadedCount}
          />
        </CardContent>
      </Card>

      {/* Create Subscription (no tenant request needed) */}
      <Modal
        isOpen={createOpen}
        onClose={() => setCreateOpen(false)}
        title={t("subscriptions.createTitle")}
        size="sm"
      >
        <div className="space-y-4">
          <p className="text-sm text-gray-600 dark:text-gray-400">
            {t("subscriptions.createDescription")}
          </p>
          <SearchableSelect
            label={t("subscriptions.tenant")}
            placeholder={t("subscriptions.selectTenant")}
            value={createForm.tenant_id}
            onChange={(value) => setCreateForm((p) => ({ ...p, tenant_id: value }))}
            options={tenants.map((tn) => ({
              value: tn.id,
              label: String(tn.name || tn.slug || tn.id),
            }))}
          />
          <Select
            name="create-plan"
            label={t("subscriptions.plan")}
            value={createForm.plan_id}
            onChange={(e) => handleSelectCreatePlan(e.target.value)}
            options={[
              { value: "", label: t("subscriptions.selectPlan") },
              ...plans.map((pl) => ({ value: pl.id, label: String(pl.name || pl.slug || pl.id) })),
            ]}
          />
          <Select
            name="create-cycle"
            label={t("subscriptions.billingCycle")}
            value={createForm.billing_cycle}
            onChange={(e) => setCreateForm((p) => ({ ...p, billing_cycle: e.target.value }))}
            options={[
              { value: "monthly", label: t("subscriptions.monthly") },
              { value: "yearly", label: t("subscriptions.yearly") },
            ]}
          />
          {createCurrencies.length > 1 && (
            <Select
              name="create-currency"
              label={t("subscriptions.currency")}
              value={createForm.currency}
              onChange={(e) => setCreateForm((p) => ({ ...p, currency: e.target.value }))}
              options={createCurrencies.map((c) => ({ value: c, label: c }))}
            />
          )}
          <Input
            name="create-price"
            type="number"
            min={0}
            step="0.01"
            label={t("subscriptions.priceOverride")}
            placeholder={
              createListPrice != null
                ? `${createListPrice.toLocaleString()} ${createForm.currency || ""}`.trim()
                : undefined
            }
            value={createForm.price}
            onChange={(e) => setCreateForm((p) => ({ ...p, price: e.target.value }))}
          />
          <Input
            name="create-period-end"
            type="date"
            label={t("subscriptions.periodEndOptional")}
            value={createForm.current_period_end}
            onChange={(e) => setCreateForm((p) => ({ ...p, current_period_end: e.target.value }))}
          />
          <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
            <input
              type="checkbox"
              name="create-invoice"
              className="h-4 w-4 rounded border-gray-300 text-primary-600"
              checked={createForm.create_invoice}
              onChange={(e) => setCreateForm((p) => ({ ...p, create_invoice: e.target.checked }))}
            />
            {t("subscriptions.createInvoice")}
          </label>
          {createSubscription.isError && (
            <p className="text-sm text-red-600 dark:text-red-400">
              {t("subscriptions.createError")}
            </p>
          )}
          <div className="flex justify-end gap-3 pt-2">
            <Button variant="secondary" onClick={() => setCreateOpen(false)}>
              {t("subscriptions.cancel")}
            </Button>
            <Button
              onClick={handleCreate}
              disabled={!createForm.tenant_id || !createForm.plan_id}
              isLoading={createSubscription.isPending}
            >
              {t("subscriptions.createConfirm")}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Edit Subscription */}
      <Modal
        isOpen={!!editSub}
        onClose={() => setEditSub(null)}
        title={t("subscriptions.editTitle")}
        size="sm"
      >
        <div className="space-y-4">
          <Select
            name="edit-plan"
            label={t("subscriptions.plan")}
            value={editForm.plan_id}
            onChange={(e) => setEditForm((p) => ({ ...p, plan_id: e.target.value }))}
            options={plans.map((pl) => ({ value: pl.id, label: String(pl.name || pl.slug || pl.id) }))}
          />
          <Select
            name="edit-cycle"
            label={t("subscriptions.billingCycle")}
            value={editForm.billing_cycle}
            onChange={(e) => setEditForm((p) => ({ ...p, billing_cycle: e.target.value }))}
            options={[
              { value: "monthly", label: t("subscriptions.monthly") },
              { value: "yearly", label: t("subscriptions.yearly") },
            ]}
          />
          <Select
            name="edit-status"
            label={t("subscriptions.status")}
            value={editForm.status}
            onChange={(e) => setEditForm((p) => ({ ...p, status: e.target.value }))}
            options={[
              { value: "active", label: t("subscriptions.active") },
              { value: "pending", label: t("subscriptions.pending") },
              { value: "expired", label: t("subscriptions.expired") },
              { value: "suspended", label: t("subscriptions.suspended") },
              { value: "cancelled", label: t("subscriptions.cancelled") },
            ]}
          />
          <Input
            name="edit-period-end"
            type="date"
            label={t("subscriptions.periodEnd")}
            value={editForm.current_period_end}
            onChange={(e) => setEditForm((p) => ({ ...p, current_period_end: e.target.value }))}
          />
          <div className="flex justify-end gap-3 pt-2">
            <Button variant="secondary" onClick={() => setEditSub(null)}>
              {t("subscriptions.cancel")}
            </Button>
            <Button onClick={handleSaveEdit} isLoading={updateSubscription.isPending}>
              {t("subscriptions.save")}
            </Button>
          </div>
        </div>
      </Modal>

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
