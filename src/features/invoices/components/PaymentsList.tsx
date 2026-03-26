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

  const totalPaid = invoice.payments?.reduce((sum, p) => sum + p.amount, 0) || 0;
  const remaining = invoice.total - totalPaid;

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
    await createPayment.mutateAsync({
      invoice_id: invoice.id,
      amount: data.amount,
      payment_date: data.payment_date,
      payment_method: data.payment_method,
      reference: data.reference || null,
      notes: data.notes || null,
    });
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
        <div className="grid grid-cols-3 gap-4 p-4 bg-gray-50 dark:bg-gray-800 rounded-lg mb-4">
          <div>
            <p className="text-sm text-gray-500 dark:text-gray-400">{t("payments.invoiceTotal")}</p>
            <p className="font-semibold">{formatCurrency(invoice.total)}</p>
          </div>
          <div>
            <p className="text-sm text-gray-500 dark:text-gray-400">{t("payments.totalPaid")}</p>
            <p className="font-semibold text-green-600">
              {formatCurrency(totalPaid)}
            </p>
          </div>
          <div>
            <p className="text-sm text-gray-500 dark:text-gray-400">{t("payments.remaining")}</p>
            <p className={`font-semibold ${remaining > 0 ? "text-orange-600" : "text-green-600"}`}>
              {formatCurrency(remaining)}
            </p>
          </div>
        </div>

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
