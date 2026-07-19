"use client";

import { useState, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { CheckCircle, Plus, Pencil, RotateCcw } from "lucide-react";
import {
  Button,
  Card,
  CardContent,
  Modal,
  Input,
  Badge,
  Select,
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui";
import { LoadMoreSentinel } from "@/components/shared/LoadMoreSentinel";
import {
  useAdminSubscriptionInvoicesInfinite,
  useMarkInvoicePaid,
  useCreateSubscriptionInvoice,
  useUpdateSubscriptionInvoice,
} from "./hooks/useSubscriptionInvoices";
import { useAdminSubscriptions } from "@/features/admin/subscriptions/hooks/useSubscriptions";

type Invoice = Record<string, unknown>;
type Subscription = Record<string, unknown>;

const emptyCreate = {
  subscription_id: "",
  amount: "",
  currency: "DZD",
  status: "unpaid",
  period_start: "",
  period_end: "",
};

function formatAmount(amount: number, currency: string): string {
  return (
    (amount / 100).toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }) +
    " " +
    currency
  );
}

function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return "-";
  return new Date(dateStr).toLocaleDateString();
}

export function SubscriptionInvoicesPage() {
  const { t } = useTranslation("admin");
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [markPaidModal, setMarkPaidModal] = useState<Invoice | null>(null);
  const [paymentMethod, setPaymentMethod] = useState("cash");
  const [createForm, setCreateForm] = useState(emptyCreate);
  const [createOpen, setCreateOpen] = useState(false);
  const [editInvoice, setEditInvoice] = useState<Invoice | null>(null);
  const [editForm, setEditForm] = useState({ amount: "", currency: "DZD", status: "unpaid" });
  const [refundTarget, setRefundTarget] = useState<Invoice | null>(null);

  // Status is forwarded to the route's server-side filter.
  const filters = statusFilter ? { status: statusFilter } : undefined;
  const {
    data: invoicePages,
    isLoading,
    hasNextPage,
    isFetchingNextPage,
    fetchNextPage,
  } = useAdminSubscriptionInvoicesInfinite(filters);
  const invoices = useMemo(
    () => invoicePages?.pages.flatMap((page) => page.data),
    [invoicePages]
  );
  // The create-invoice dropdown needs every subscription — keep the legacy
  // full-list fetch here.
  const { data: subsData } = useAdminSubscriptions();
  const subscriptions = (subsData || []) as Subscription[];
  const markPaid = useMarkInvoicePaid();
  const createInvoice = useCreateSubscriptionInvoice();
  const updateInvoice = useUpdateSubscriptionInvoice();

  const handleCreate = async () => {
    if (!createForm.subscription_id || !createForm.amount) return;
    await createInvoice.mutateAsync({
      subscription_id: createForm.subscription_id,
      amount: Math.round(parseFloat(createForm.amount) * 100),
      currency: createForm.currency,
      status: createForm.status,
      period_start: createForm.period_start || undefined,
      period_end: createForm.period_end || undefined,
    });
    setCreateOpen(false);
    setCreateForm(emptyCreate);
  };

  const handleOpenEdit = (invoice: Invoice) => {
    setEditInvoice(invoice);
    setEditForm({
      amount: String(Number(invoice.amount || 0) / 100),
      currency: String(invoice.currency || "DZD"),
      status: String(invoice.status || "unpaid"),
    });
  };

  const handleSaveEdit = async () => {
    if (!editInvoice) return;
    await updateInvoice.mutateAsync({
      id: String(editInvoice.id),
      input: {
        amount: Math.round(parseFloat(editForm.amount || "0") * 100),
        currency: editForm.currency,
        status: editForm.status,
      },
    });
    setEditInvoice(null);
  };

  const handleRefund = async () => {
    if (!refundTarget) return;
    await updateInvoice.mutateAsync({ id: String(refundTarget.id), input: { status: "refunded" } });
    setRefundTarget(null);
  };

  const handleOpenMarkPaid = (invoice: Invoice) => {
    setMarkPaidModal(invoice);
    setPaymentMethod("cash");
  };

  const handleCloseMarkPaid = () => {
    setMarkPaidModal(null);
    setPaymentMethod("cash");
  };

  const handleSubmitMarkPaid = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!markPaidModal) return;
    await markPaid.mutateAsync({
      id: String(markPaidModal.id),
      payment_method: paymentMethod,
    });
    handleCloseMarkPaid();
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600" />
      </div>
    );
  }

  const invoiceList = (invoices || []) as Invoice[];

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-gray-100">
            {t("subscriptionInvoices.title")}
          </h1>
          <p className="text-sm sm:text-base text-gray-500 dark:text-gray-400">
            {t("subscriptionInvoices.subtitle")}
          </p>
        </div>
        <div className="flex items-end gap-3">
          <div className="w-48">
            <Select
              name="status-filter"
              label={t("subscriptionInvoices.statusFilter")}
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              options={[
                { value: "", label: t("subscriptionInvoices.allStatuses") },
                { value: "unpaid", label: t("subscriptionInvoices.unpaid") },
                { value: "paid", label: t("subscriptionInvoices.paid") },
                { value: "refunded", label: t("subscriptionInvoices.refunded") },
              ]}
            />
          </div>
          <Button size="sm" onClick={() => { setCreateForm(emptyCreate); setCreateOpen(true); }}>
            <Plus className="h-4 w-4 mr-2" />
            {t("subscriptionInvoices.newInvoice")}
          </Button>
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("subscriptionInvoices.invoiceNumber")}</TableHead>
                  <TableHead>{t("subscriptionInvoices.tenant")}</TableHead>
                  <TableHead>{t("subscriptionInvoices.plan")}</TableHead>
                  <TableHead>{t("subscriptionInvoices.amount")}</TableHead>
                  <TableHead>{t("subscriptionInvoices.status")}</TableHead>
                  <TableHead>{t("subscriptionInvoices.paymentMethod")}</TableHead>
                  <TableHead>{t("subscriptionInvoices.paidAt")}</TableHead>
                  <TableHead>{t("subscriptionInvoices.period")}</TableHead>
                  <TableHead>{t("subscriptionInvoices.actions")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {invoiceList.map((invoice) => {
                  const subscription = (invoice.subscription || {}) as Subscription;
                  const plan = (subscription.plan || {}) as Record<string, unknown>;
                  const tenant = (subscription.tenant || {}) as Record<string, unknown>;
                  const isPaid = invoice.status === "paid";
                  const isRefunded = invoice.status === "refunded";

                  return (
                    <TableRow key={String(invoice.id)}>
                      <TableCell className="font-mono font-semibold">
                        {String(invoice.invoice_number || "-")}
                      </TableCell>
                      <TableCell>{String(tenant.name || "-")}</TableCell>
                      <TableCell>{String(plan.name || "-")}</TableCell>
                      <TableCell>
                        {formatAmount(
                          Number(invoice.amount || 0),
                          String(invoice.currency || "DZD")
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant={isRefunded ? "danger" : isPaid ? "success" : "warning"}>
                          {isRefunded
                            ? t("subscriptionInvoices.refunded")
                            : isPaid
                              ? t("subscriptionInvoices.paid")
                              : t("subscriptionInvoices.unpaid")}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {invoice.payment_method
                          ? t(`subscriptionInvoices.method.${invoice.payment_method}`)
                          : "-"}
                      </TableCell>
                      <TableCell>
                        {formatDate(invoice.paid_at as string | null)}
                      </TableCell>
                      <TableCell className="text-sm">
                        {formatDate(invoice.period_start as string | null)}
                        {" - "}
                        {formatDate(invoice.period_end as string | null)}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          {!isPaid && !isRefunded && (
                            <Button
                              variant="primary"
                              size="sm"
                              onClick={() => handleOpenMarkPaid(invoice)}
                            >
                              <CheckCircle className="h-4 w-4 mr-1" />
                              {t("subscriptionInvoices.markPaid")}
                            </Button>
                          )}
                          {isPaid && (
                            <Button
                              variant="secondary"
                              size="sm"
                              onClick={() => setRefundTarget(invoice)}
                              title={t("subscriptionInvoices.refund")}
                            >
                              <RotateCcw className="h-4 w-4 mr-1" />
                              {t("subscriptionInvoices.refund")}
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleOpenEdit(invoice)}
                            aria-label={t("subscriptionInvoices.edit")}
                            title={t("subscriptionInvoices.edit")}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
                {invoiceList.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center py-12 text-gray-500 dark:text-gray-400">
                      {t("subscriptionInvoices.empty")}
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
            loadedCount={invoiceList.length}
          />
        </CardContent>
      </Card>

      {/* Mark Paid Modal */}
      <Modal
        isOpen={!!markPaidModal}
        onClose={handleCloseMarkPaid}
        title={t("subscriptionInvoices.markPaidTitle")}
      >
        <form onSubmit={handleSubmitMarkPaid} className="space-y-4">
          <p className="text-sm text-gray-600 dark:text-gray-400">
            {t("subscriptionInvoices.markPaidDescription", {
              invoiceNumber: markPaidModal?.invoice_number || "",
            })}
          </p>

          <Select
            name="payment-method"
            label={t("subscriptionInvoices.paymentMethodLabel")}
            value={paymentMethod}
            onChange={(e) => setPaymentMethod(e.target.value)}
            options={[
              { value: "cash", label: t("subscriptionInvoices.method.cash") },
              { value: "bank_transfer", label: t("subscriptionInvoices.method.bank_transfer") },
            ]}
          />

          <div className="flex justify-end gap-3 pt-4 border-t border-gray-200 dark:border-gray-700">
            <Button
              variant="secondary"
              type="button"
              onClick={handleCloseMarkPaid}
            >
              {t("subscriptionInvoices.cancel")}
            </Button>
            <Button type="submit" isLoading={markPaid.isPending}>
              {t("subscriptionInvoices.confirmMarkPaid")}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Create Invoice Modal */}
      <Modal isOpen={createOpen} onClose={() => setCreateOpen(false)} title={t("subscriptionInvoices.newInvoice")}>
        <div className="space-y-4">
          <Select
            name="create-subscription"
            label={t("subscriptionInvoices.subscription")}
            value={createForm.subscription_id}
            onChange={(e) => setCreateForm((p) => ({ ...p, subscription_id: e.target.value }))}
            required
            options={[
              { value: "", label: t("subscriptionInvoices.selectSubscription") },
              ...subscriptions.map((s) => {
                const tn = (s.tenant as Record<string, unknown>)?.name || s.tenant_name || s.id;
                const pl = (s.plan as Record<string, unknown>)?.name || s.plan_name || "";
                return { value: String(s.id), label: `${String(tn)}${pl ? ` — ${String(pl)}` : ""}` };
              }),
            ]}
          />
          <div className="grid grid-cols-2 gap-3">
            <Input
              name="create-amount"
              type="number"
              step="0.01"
              min="0"
              label={t("subscriptionInvoices.amountMajor")}
              value={createForm.amount}
              onChange={(e) => setCreateForm((p) => ({ ...p, amount: e.target.value }))}
            />
            <Input
              name="create-currency"
              label={t("subscriptionInvoices.currency")}
              value={createForm.currency}
              onChange={(e) => setCreateForm((p) => ({ ...p, currency: e.target.value.toUpperCase() }))}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Input
              name="create-period-start"
              type="date"
              label={t("subscriptionInvoices.periodStart")}
              value={createForm.period_start}
              onChange={(e) => setCreateForm((p) => ({ ...p, period_start: e.target.value }))}
            />
            <Input
              name="create-period-end"
              type="date"
              label={t("subscriptionInvoices.periodEnd")}
              value={createForm.period_end}
              onChange={(e) => setCreateForm((p) => ({ ...p, period_end: e.target.value }))}
            />
          </div>
          <Select
            name="create-status"
            label={t("subscriptionInvoices.status")}
            value={createForm.status}
            onChange={(e) => setCreateForm((p) => ({ ...p, status: e.target.value }))}
            options={[
              { value: "unpaid", label: t("subscriptionInvoices.unpaid") },
              { value: "paid", label: t("subscriptionInvoices.paid") },
            ]}
          />
          <div className="flex justify-end gap-3 pt-2">
            <Button variant="secondary" onClick={() => setCreateOpen(false)}>
              {t("subscriptionInvoices.cancel")}
            </Button>
            <Button onClick={handleCreate} isLoading={createInvoice.isPending} disabled={!createForm.subscription_id || !createForm.amount}>
              {t("subscriptionInvoices.create")}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Edit Invoice Modal */}
      <Modal isOpen={!!editInvoice} onClose={() => setEditInvoice(null)} title={t("subscriptionInvoices.editTitle")}>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Input
              name="edit-amount"
              type="number"
              step="0.01"
              min="0"
              label={t("subscriptionInvoices.amountMajor")}
              value={editForm.amount}
              onChange={(e) => setEditForm((p) => ({ ...p, amount: e.target.value }))}
            />
            <Input
              name="edit-currency"
              label={t("subscriptionInvoices.currency")}
              value={editForm.currency}
              onChange={(e) => setEditForm((p) => ({ ...p, currency: e.target.value.toUpperCase() }))}
            />
          </div>
          <Select
            name="edit-status"
            label={t("subscriptionInvoices.status")}
            value={editForm.status}
            onChange={(e) => setEditForm((p) => ({ ...p, status: e.target.value }))}
            options={[
              { value: "unpaid", label: t("subscriptionInvoices.unpaid") },
              { value: "paid", label: t("subscriptionInvoices.paid") },
              { value: "refunded", label: t("subscriptionInvoices.refunded") },
            ]}
          />
          <div className="flex justify-end gap-3 pt-2">
            <Button variant="secondary" onClick={() => setEditInvoice(null)}>
              {t("subscriptionInvoices.cancel")}
            </Button>
            <Button onClick={handleSaveEdit} isLoading={updateInvoice.isPending}>
              {t("subscriptionInvoices.save")}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Refund Confirmation */}
      <Modal isOpen={!!refundTarget} onClose={() => setRefundTarget(null)} title={t("subscriptionInvoices.refund")} size="sm">
        <p className="text-gray-600 dark:text-gray-400 mb-6">
          {t("subscriptionInvoices.refundConfirm", { invoiceNumber: String(refundTarget?.invoice_number || "") })}
        </p>
        <div className="flex justify-end gap-3">
          <Button variant="secondary" onClick={() => setRefundTarget(null)}>
            {t("subscriptionInvoices.cancel")}
          </Button>
          <Button variant="danger" onClick={handleRefund} isLoading={updateInvoice.isPending}>
            {t("subscriptionInvoices.refund")}
          </Button>
        </div>
      </Modal>
    </div>
  );
}
