"use client";

import { useState } from "react";
import { useTranslation } from "react-i18next";
import { CheckCircle } from "lucide-react";
import {
  Button,
  Card,
  CardContent,
  Modal,
  Badge,
  Select,
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui";
import {
  useAdminSubscriptionInvoices,
  useMarkInvoicePaid,
} from "./hooks/useSubscriptionInvoices";

type Invoice = Record<string, unknown>;
type Subscription = Record<string, unknown>;

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

  const filters = statusFilter ? { status: statusFilter } : undefined;
  const { data: invoices, isLoading } = useAdminSubscriptionInvoices(filters);
  const markPaid = useMarkInvoicePaid();

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
            ]}
          />
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
                        <Badge variant={isPaid ? "success" : "warning"}>
                          {isPaid
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
                        {!isPaid && (
                          <Button
                            variant="primary"
                            size="sm"
                            onClick={() => handleOpenMarkPaid(invoice)}
                          >
                            <CheckCircle className="h-4 w-4 mr-1" />
                            {t("subscriptionInvoices.markPaid")}
                          </Button>
                        )}
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
    </div>
  );
}
