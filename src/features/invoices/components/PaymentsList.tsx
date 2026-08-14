import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Plus, Trash2, CreditCard } from "lucide-react";
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Modal,
  Badge,
} from "@/components/ui";
import { PaymentForm, type PaymentFormData } from "./PaymentForm";
import { useDemoMode } from "@/components/providers/DemoModeProvider";
import { useCreatePayment, useDeletePayment } from "../hooks/useInvoices";
import { formatCurrency, formatDate } from "@/lib/utils";
import { toast } from "@/stores/useToastStore";
import { isOfflineQueuedError } from "@/lib/offline-errors";
import { getApiErrorMessage } from "@/lib/api-adapter";
import type { Invoice } from "@/types";

interface PaymentsListProps {
  invoice: Invoice;
}

export function PaymentsList({ invoice }: PaymentsListProps) {
  const { t } = useTranslation("common");
  const { isDemoMode, showSubscribePrompt } = useDemoMode();
  const [showAddModal, setShowAddModal] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  const createPayment = useCreatePayment();
  const deletePayment = useDeletePayment();

  const stampDuty = invoice.stamp_duty || 0;
  // The client owes the TTC total plus the stamp duty (droit de timbre) snapshot.
  const amountOwed = invoice.total + stampDuty;
  const totalPaid = invoice.payments?.reduce((sum, p) => sum + p.amount, 0) || 0;
  const remaining = amountOwed - totalPaid;

  const getPaymentMethodLabel = (method: string) => {
    const methodMap: Record<string, string> = {
      virement: t("payments.methods.transfer"),
      cheque: t("payments.methods.check"),
      carte: t("payments.methods.card"),
      especes: t("payments.methods.cash"),
      prelevement: t("payments.methods.directDebit"),
      autre: t("payments.methods.other"),
    };
    return methodMap[method] || method;
  };

  const handleAddPayment = async (data: PaymentFormData) => {
    if (isDemoMode) { showSubscribePrompt(); return; }
    // Minted per submit (not per render) so an offline replay of this exact
    // request dedupes server-side instead of recording the payment twice.
    const payload = {
      invoice_id: invoice.id,
      amount: data.amount,
      payment_date: data.payment_date,
      payment_method: data.payment_method,
      reference: data.reference || null,
      notes: data.notes || null,
      idempotency_key: crypto.randomUUID(),
    };
    try {
      await createPayment.mutateAsync(payload);
    } catch (err) {
      // Saved to the offline queue: treat as success, it syncs later.
      if (!isOfflineQueuedError(err)) {
        toast.error(getApiErrorMessage(err, t("common:messages.error")));
        return;
      }
      toast.info(t("offline.saved_offline"));
    }
    setShowAddModal(false);
  };

  const handleDeletePayment = async (id: string) => {
    if (isDemoMode) { showSubscribePrompt(); return; }
    await deletePayment.mutateAsync(id);
    setDeleteConfirmId(null);
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>{t("payments.title")}</CardTitle>
          {invoice.status !== "PAID" && remaining > 0 && (
            <Button size="sm" onClick={() => setShowAddModal(true)}>
              <Plus className="h-4 w-4 mr-1" />
              {t("buttons.add")}
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {/* Summary */}
        {/* One figure per row, label left and amount right.
            Three columns in this card gave each amount about 85 px, and a total
            needs closer to 110 — so they ran into one another and read as
            "178 166,80DZDDZD". A narrow card wants a list, not a grid. */}
        <dl className="p-4 bg-(--color-bg-secondary) rounded-lg mb-4 divide-y divide-(--color-border-primary)">
          <div className="flex items-baseline justify-between gap-3 pb-2">
            <dt className="text-sm text-(--color-text-secondary)">{t("payments.invoiceTotal")}</dt>
            <dd className="font-mono font-semibold tabular-nums">{formatCurrency(amountOwed)}</dd>
          </div>
          <div className="flex items-baseline justify-between gap-3 py-2">
            <dt className="text-sm text-(--color-text-secondary)">{t("payments.totalPaid")}</dt>
            <dd className="font-mono font-semibold tabular-nums text-success-600">
              {formatCurrency(totalPaid)}
            </dd>
          </div>
          <div className="flex items-baseline justify-between gap-3 pt-2">
            <dt className="text-sm text-(--color-text-secondary)">{t("payments.remaining")}</dt>
            <dd
              className={`font-mono font-semibold tabular-nums ${
                remaining > 0 ? "text-warning-600" : "text-success-600"
              }`}
            >
              {formatCurrency(remaining)}
            </dd>
          </div>
        </dl>

        {/* Payments List */}
        {invoice.payments && invoice.payments.length > 0 ? (
          <div className="space-y-2">
            {invoice.payments.map((payment) => (
              <div
                key={payment.id}
                className="flex items-center justify-between p-3 border rounded-lg"
              >
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-green-100 dark:bg-green-900/30 rounded-lg">
                    <CreditCard className="h-4 w-4 text-green-600" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-medium">
                        {formatCurrency(payment.amount)}
                      </span>
                      <Badge variant="default">
                        {getPaymentMethodLabel(payment.payment_method)}
                      </Badge>
                    </div>
                    <p className="text-sm text-gray-500">
                      {formatDate(payment.payment_date)}
                      {payment.reference && ` - ${t("payments.ref")} ${payment.reference}`}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setDeleteConfirmId(payment.id)}
                  aria-label={t("buttons.delete")}
                  className="p-2 text-gray-400 hover:text-red-600 transition-colors"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-center text-gray-500 py-4">{t("payments.noPayments")}</p>
        )}
      </CardContent>

      {/* Add Payment Modal */}
      <Modal
        isOpen={showAddModal}
        onClose={() => setShowAddModal(false)}
        title={t("payments.recordPayment")}
        size="md"
      >
        <PaymentForm
          maxAmount={remaining}
          onSubmit={handleAddPayment}
          onCancel={() => setShowAddModal(false)}
          isLoading={createPayment.isPending}
        />
      </Modal>

      {/* Delete Confirmation Modal */}
      <Modal
        isOpen={!!deleteConfirmId}
        onClose={() => setDeleteConfirmId(null)}
        title={t("payments.deletePayment")}
        size="sm"
      >
        <p className="text-gray-600 dark:text-gray-400 mb-6">
          {t("payments.deleteConfirm")}
        </p>
        <div className="flex justify-end gap-3">
          <Button variant="secondary" onClick={() => setDeleteConfirmId(null)}>
            {t("buttons.cancel")}
          </Button>
          <Button
            variant="danger"
            onClick={() => deleteConfirmId && handleDeletePayment(deleteConfirmId)}
            isLoading={deletePayment.isPending}
          >
            {t("buttons.delete")}
          </Button>
        </div>
      </Modal>
    </Card>
  );
}
