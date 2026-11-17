import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Plus, Trash2, Wallet } from "lucide-react";
import { Badge, Button, Card, CardContent, CardHeader, CardTitle, Modal } from "@/components/ui";
import { PaymentForm, type PaymentFormData } from "@/features/invoices/components/PaymentForm";
import { useDemoMode } from "@/components/providers/DemoModeProvider";
import { useAuthStore } from "@/stores/useAuthStore";
import { useCreateQuoteDeposit, useDeleteQuoteDeposit } from "../hooks/useQuotes";
import { formatCurrency, formatDate } from "@/lib/utils";
import { paymentMethodLabelKey } from "@/lib/payment-methods";
import { toast } from "@/stores/useToastStore";
import { getApiErrorMessage } from "@/lib/api-adapter";
import type { Quote } from "@/types";

/**
 * Deposits the client paid on the quote, before any invoice exists: dated,
 * with their method, so the cash journal sees the money the day it arrives.
 * On conversion they move to the invoice and count against its balance.
 *
 * Once the quote is invoiced the card only lists them: money from then on is
 * recorded on the invoice, where the balance is kept.
 */
export function QuoteDepositsCard({ quote }: { quote: Quote }) {
  const { t } = useTranslation(["quotes", "common"]);
  const { isDemoMode, showSubscribePrompt } = useDemoMode();
  const canEdit = useAuthStore((s) => s.hasPermission("quotes", "edit"));
  const [showAdd, setShowAdd] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const createDeposit = useCreateQuoteDeposit(quote.id);
  const deleteDeposit = useDeleteQuoteDeposit(quote.id);

  const deposits = quote.deposits ?? [];
  const invoiced = (quote.invoices?.length ?? 0) > 0;
  const paid = deposits.reduce((sum, d) => sum + d.amount, 0);
  const remaining = Math.max(0, quote.total - paid);
  const canAdd = canEdit && !invoiced && quote.status !== "REFUSED" && remaining > 0.005;

  const handleAdd = async (data: PaymentFormData) => {
    if (isDemoMode) { showSubscribePrompt(); return; }
    try {
      await createDeposit.mutateAsync({
        amount: data.amount,
        payment_date: data.payment_date,
        payment_method: data.payment_method,
        reference: data.reference || null,
        cheque_date: data.cheque_date || null,
        cheque_number: data.cheque_number || null,
        cheque_bank: data.cheque_bank || null,
        notes: data.notes || null,
        idempotency_key: crypto.randomUUID(),
      });
      toast.success(t("quotes:deposits.added"));
      setShowAdd(false);
    } catch (err) {
      toast.error(getApiErrorMessage(err, t("common:messages.error")));
    }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    if (isDemoMode) { showSubscribePrompt(); return; }
    try {
      await deleteDeposit.mutateAsync(deleteId);
    } catch (err) {
      toast.error(getApiErrorMessage(err, t("common:messages.error")));
    }
    setDeleteId(null);
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-base">{t("quotes:deposits.title")}</CardTitle>
          {canAdd && (
            <Button size="sm" onClick={() => (isDemoMode ? showSubscribePrompt() : setShowAdd(true))}>
              <Plus className="h-4 w-4 me-1" />
              {t("quotes:deposits.add")}
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="pt-0 space-y-3">
        <dl className="p-3 bg-(--color-bg-secondary) rounded-lg divide-y divide-(--color-border-primary) text-sm">
          <div className="flex items-baseline justify-between gap-3 pb-2">
            <dt className="text-(--color-text-secondary)">{t("quotes:deposits.quoteTotal")}</dt>
            <dd className="font-mono font-semibold tabular-nums">{formatCurrency(quote.total)}</dd>
          </div>
          <div className="flex items-baseline justify-between gap-3 py-2">
            <dt className="text-(--color-text-secondary)">{t("quotes:deposits.paid")}</dt>
            <dd className="font-mono font-semibold tabular-nums text-success-600 dark:text-success-400">
              {formatCurrency(paid)}
            </dd>
          </div>
          <div className="flex items-baseline justify-between gap-3 pt-2">
            <dt className="text-(--color-text-secondary)">{t("quotes:deposits.remaining")}</dt>
            <dd
              className={`font-mono font-semibold tabular-nums ${
                remaining > 0 ? "text-danger-600 dark:text-danger-400" : "text-success-600 dark:text-success-400"
              }`}
            >
              {formatCurrency(remaining)}
            </dd>
          </div>
        </dl>

        {deposits.length > 0 ? (
          <ul className="space-y-2">
            {deposits.map((d) => (
              <li
                key={d.id}
                className="flex items-center justify-between gap-2 p-2.5 border border-(--color-border-primary) rounded-lg"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="p-1.5 bg-success-50 dark:bg-success-950 rounded-md shrink-0">
                    <Wallet className="h-4 w-4 text-success-600 dark:text-success-400" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span className="font-medium font-mono tabular-nums whitespace-nowrap">
                        {formatCurrency(d.amount)}
                      </span>
                      <Badge variant="default">{t(`common:${paymentMethodLabelKey(d.payment_method)}`)}</Badge>
                    </div>
                    <p className="text-xs text-(--color-text-secondary) wrap-break-word">
                      {formatDate(d.payment_date)}
                      {d.reference && ` · ${d.reference}`}
                    </p>
                  </div>
                </div>
                {canEdit && !d.invoice_id && (
                  <button
                    onClick={() => setDeleteId(d.id)}
                    aria-label={t("common:buttons.delete")}
                    title={t("common:buttons.delete")}
                    className="shrink-0 -me-1 p-2 rounded-md text-(--color-text-tertiary) hover:text-danger-600 dark:hover:text-danger-400 transition-colors"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-(--color-text-secondary)">{t("quotes:deposits.none")}</p>
        )}

        {invoiced && deposits.length > 0 && (
          <p className="text-xs text-(--color-text-secondary)">{t("quotes:deposits.onInvoice")}</p>
        )}
      </CardContent>

      <Modal isOpen={showAdd} onClose={() => setShowAdd(false)} title={t("quotes:deposits.record")} size="md">
        <PaymentForm
          maxAmount={remaining}
          onSubmit={handleAdd}
          onCancel={() => setShowAdd(false)}
          isLoading={createDeposit.isPending}
        />
      </Modal>

      <Modal isOpen={!!deleteId} onClose={() => setDeleteId(null)} title={t("quotes:deposits.delete")} size="sm">
        <p className="text-(--color-text-secondary) mb-6">{t("quotes:deposits.deleteConfirm")}</p>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setDeleteId(null)}>
            {t("common:buttons.cancel")}
          </Button>
          <Button variant="danger" onClick={handleDelete} isLoading={deleteDeposit.isPending}>
            {t("common:buttons.delete")}
          </Button>
        </div>
      </Modal>
    </Card>
  );
}
