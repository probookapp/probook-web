import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Button,
  Input,
  Modal,
} from "@/components/ui";
import { supplierCreditApi } from "@/lib/api";
import { useToastStore } from "@/stores/useToastStore";
import { formatDateISO } from "@/lib/utils";
import type { PurchaseOrder, CreateSupplierPaymentInput } from "@/types";

interface SupplierPaymentModalProps {
  open: boolean;
  onClose: () => void;
  supplierId: string;
  unpaidOrders: PurchaseOrder[];
}

const PAYMENT_METHODS = ["CASH", "BANK_TRANSFER", "CHECK", "OTHER"] as const;

export function SupplierPaymentModal({
  open,
  onClose,
  supplierId,
  unpaidOrders,
}: SupplierPaymentModalProps) {
  const { t } = useTranslation("suppliers");
  const { t: tCommon } = useTranslation("common");
  const addToast = useToastStore((state) => state.addToast);
  const queryClient = useQueryClient();

  const [amount, setAmount] = useState("");
  const [paymentDate, setPaymentDate] = useState(formatDateISO(new Date()));
  const [paymentMethod, setPaymentMethod] = useState<string>("CASH");
  const [purchaseOrderId, setPurchaseOrderId] = useState("");
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");

  const createPayment = useMutation({
    mutationFn: (input: CreateSupplierPaymentInput) =>
      supplierCreditApi.createPayment(supplierId, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["supplier-credits", supplierId] });
      queryClient.invalidateQueries({ queryKey: ["supplier-payments", supplierId] });
      queryClient.invalidateQueries({ queryKey: ["purchases"] });
      addToast({ type: "success", message: t("credits.paymentRecorded") });
      handleClose();
    },
    onError: () => {
      addToast({ type: "error", message: t("credits.paymentError") });
    },
  });

  const handleClose = () => {
    setAmount("");
    setPaymentDate(formatDateISO(new Date()));
    setPaymentMethod("CASH");
    setPurchaseOrderId("");
    setReference("");
    setNotes("");
    onClose();
  };

  const handleSubmit = () => {
    const parsedAmount = parseFloat(amount);
    if (!parsedAmount || parsedAmount <= 0 || !paymentDate) return;

    const input: CreateSupplierPaymentInput = {
      amount: parsedAmount,
      payment_date: paymentDate,
      payment_method: paymentMethod,
      purchase_order_id: purchaseOrderId || null,
      reference: reference || null,
      notes: notes || null,
    };

    createPayment.mutate(input);
  };

  return (
    <Modal
      isOpen={open}
      onClose={handleClose}
      title={t("credits.recordPayment")}
      size="lg"
    >
      <div className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Input
            label={t("credits.paymentAmount")}
            type="number"
            step="0.01"
            min="0"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            required
            autoComplete="off"
          />
          <Input
            label={t("credits.paymentDate")}
            type="date"
            value={paymentDate}
            onChange={(e) => setPaymentDate(e.target.value)}
            required
            autoComplete="off"
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label
              htmlFor="payment-method"
              className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
            >
              {t("credits.paymentMethod")}
            </label>
            <select
              id="payment-method"
              value={paymentMethod}
              onChange={(e) => setPaymentMethod(e.target.value)}
              className="w-full px-3 py-2 border rounded-lg shadow-sm transition-colors bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 border-gray-300 dark:border-gray-600"
            >
              {PAYMENT_METHODS.map((method) => (
                <option key={method} value={method}>
                  {t(`credits.methods.${method}`)}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label
              htmlFor="link-order"
              className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
            >
              {t("credits.linkToOrder")}
            </label>
            <select
              id="link-order"
              value={purchaseOrderId}
              onChange={(e) => setPurchaseOrderId(e.target.value)}
              className="w-full px-3 py-2 border rounded-lg shadow-sm transition-colors bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 border-gray-300 dark:border-gray-600"
            >
              <option value="">{t("credits.noLink")}</option>
              {unpaidOrders.map((order) => (
                <option key={order.id} value={order.id}>
                  {order.order_number} - {order.total.toFixed(2)}
                </option>
              ))}
            </select>
          </div>
        </div>

        <Input
          label={t("credits.paymentReference")}
          value={reference}
          onChange={(e) => setReference(e.target.value)}
          autoComplete="off"
        />

        <div>
          <label
            htmlFor="payment-notes"
            className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
          >
            {t("credits.paymentNotes")}
          </label>
          <textarea
            id="payment-notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            className="w-full px-3 py-2 border rounded-lg shadow-sm transition-colors bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 border-gray-300 dark:border-gray-600 resize-none"
          />
        </div>

        <div className="flex justify-end gap-3 pt-2">
          <Button variant="secondary" onClick={handleClose}>
            {tCommon("buttons.cancel")}
          </Button>
          <Button
            onClick={handleSubmit}
            isLoading={createPayment.isPending}
            disabled={!(parseFloat(amount) > 0) || !paymentDate}
          >
            {t("credits.recordPayment")}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
