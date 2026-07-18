import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Modal, Button, Input } from "@/components/ui";
import { formatCurrency } from "@/lib/utils";
import { toast } from "@/stores/useToastStore";
import { useDemoMode } from "@/components/providers/DemoModeProvider";
import type { PosTransaction } from "@/types";
import { useCreatePosRefund } from "../hooks/usePosTransaction";

interface RefundModalProps {
  transaction: PosTransaction;
  /** The cashier's currently open session — the drawer the refund is paid from. */
  sessionId: string;
  isOpen: boolean;
  onClose: () => void;
}

export function RefundModal({ transaction, sessionId, isOpen, onClose }: RefundModalProps) {
  const { t } = useTranslation("pos");
  const { isDemoMode, showSubscribePrompt } = useDemoMode();
  const createRefund = useCreatePosRefund();

  const [reason, setReason] = useState("");
  const [restock, setRestock] = useState(false);
  const [quantities, setQuantities] = useState<Record<string, number>>(() =>
    Object.fromEntries(transaction.lines.map((l) => [l.id, l.quantity]))
  );

  // Effective per-unit price (excl. tax) the customer actually paid: line price
  // after its own discount, scaled by the transaction-level discount ratio
  // (final_amount / total) so a discounted sale isn't over-refunded.
  const discountRatio =
    transaction.total > 0 ? transaction.final_amount / transaction.total : 1;
  const unitPriceOf = (line: PosTransaction["lines"][number]) =>
    (line.quantity > 0 ? line.subtotal / line.quantity : line.unit_price) * discountRatio;

  const selectedLines = transaction.lines
    .filter((l) => (quantities[l.id] ?? 0) > 0)
    .map((l) => ({
      product_id: l.product_id,
      variant_id: l.variant_id,
      description: l.designation,
      quantity: quantities[l.id] ?? 0,
      unit_price: unitPriceOf(l),
      tax_rate: l.tax_rate,
    }));

  const total = selectedLines.reduce((sum, l) => {
    const sub = l.quantity * l.unit_price;
    return sum + sub + sub * (l.tax_rate / 100);
  }, 0);

  const setQty = (id: string, value: number, max: number) => {
    setQuantities((prev) => ({ ...prev, [id]: Math.max(0, Math.min(value, max)) }));
  };

  const handleSubmit = async () => {
    if (isDemoMode) {
      showSubscribePrompt();
      return;
    }
    if (selectedLines.length === 0) {
      toast.error(t("refund.noItems"));
      return;
    }
    try {
      await createRefund.mutateAsync({
        transaction_id: transaction.id,
        session_id: sessionId,
        reason: reason || null,
        restock,
        lines: selectedLines,
      });
      toast.success(t("refund.success"));
      onClose();
    } catch {
      toast.error(t("refund.failed"));
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={t("refund.title")} size="lg">
      <div className="space-y-4">
        <p className="text-sm text-(--color-text-secondary)">
          {t("refund.subtitle", { ticket: transaction.ticket_number })}
        </p>

        <div className="space-y-2">
          {transaction.lines.map((line) => {
            const qty = quantities[line.id] ?? 0;
            return (
              <div
                key={line.id}
                className="flex items-center justify-between gap-3 border border-(--color-border-primary) rounded-lg p-2"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium truncate">{line.designation}</p>
                  <p className="text-xs text-(--color-text-secondary)">
                    {formatCurrency(unitPriceOf(line))} · {line.quantity} {t("refund.sold")}
                  </p>
                </div>
                <div className="w-24 shrink-0">
                  <Input
                    type="number"
                    min={0}
                    max={line.quantity}
                    step="any"
                    value={qty}
                    onChange={(e) => setQty(line.id, Number(e.target.value), line.quantity)}
                    className="text-center"
                  />
                </div>
              </div>
            );
          })}
        </div>

        <Input
          label={t("refund.reason")}
          placeholder={t("refund.reasonPlaceholder")}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />

        <label className="flex items-center gap-2 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={restock}
            onChange={(e) => setRestock(e.target.checked)}
            className="h-4 w-4 text-primary-600 border-gray-300 rounded focus:ring-primary-500"
          />
          <span className="text-sm text-(--color-text-primary)">{t("refund.restock")}</span>
        </label>

        <div className="flex items-center justify-between border-t border-(--color-border-primary) pt-3">
          <span className="font-medium">{t("refund.totalToRefund")}</span>
          <span className="text-lg font-bold">{formatCurrency(total)}</span>
        </div>

        <div className="flex justify-end gap-3">
          <Button variant="secondary" onClick={onClose}>
            {t("cancel")}
          </Button>
          <Button onClick={handleSubmit} isLoading={createRefund.isPending}>
            {t("refund.confirm")}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
