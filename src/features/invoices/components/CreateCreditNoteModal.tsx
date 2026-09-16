import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Modal, Button, Input } from "@/components/ui";
import { formatCurrency, formatDateISO } from "@/lib/utils";
import { toast } from "@/stores/useToastStore";
import { useDemoMode } from "@/components/providers/DemoModeProvider";
import { useRouter } from "@/lib/navigation";
import type { Invoice } from "@/types";
import { useCreateCreditNote } from "../hooks/useCreditNotes";
import { NUMERIC_CELL } from "@/components/ui";

interface CreateCreditNoteModalProps {
  invoice: Invoice;
  isOpen: boolean;
  onClose: () => void;
}

interface DraftLine {
  product_id: string | null;
  variant_id: string | null;
  description: string;
  quantity: number;
  unit_price: number;
  tax_rate: number;
}

export function CreateCreditNoteModal({ invoice, isOpen, onClose }: CreateCreditNoteModalProps) {
  const { t } = useTranslation(["invoices", "common"]);
  const router = useRouter();
  const { isDemoMode, showSubscribePrompt } = useDemoMode();
  const createCreditNote = useCreateCreditNote();

  const refundableLines = useMemo(
    () => invoice.lines.filter((l) => !l.is_subtotal_line),
    [invoice.lines]
  );

  const [issueDate, setIssueDate] = useState(formatDateISO(new Date()));
  const [reason, setReason] = useState("");
  const [restock, setRestock] = useState(false);
  // Quantity to refund per invoice-line id (defaults to the full invoiced qty).
  const [quantities, setQuantities] = useState<Record<string, number>>(() =>
    Object.fromEntries(refundableLines.map((l) => [l.id, l.quantity]))
  );

  const draftLines: DraftLine[] = refundableLines
    .filter((l) => (quantities[l.id] ?? 0) > 0)
    .map((l) => ({
      product_id: l.product_id,
      // Restocking puts the goods back on the variant they were sold from.
      variant_id: l.variant_id ?? null,
      description: l.description,
      quantity: quantities[l.id] ?? 0,
      unit_price: l.unit_price,
      tax_rate: l.tax_rate,
    }));

  const totals = draftLines.reduce(
    (acc, l) => {
      const sub = l.quantity * l.unit_price;
      acc.subtotal += sub;
      acc.tax += sub * (l.tax_rate / 100);
      return acc;
    },
    { subtotal: 0, tax: 0 }
  );
  const total = totals.subtotal + totals.tax;

  const setQty = (id: string, value: number, max: number) => {
    const clamped = Math.max(0, Math.min(value, max));
    setQuantities((prev) => ({ ...prev, [id]: clamped }));
  };

  const handleSubmit = async () => {
    if (isDemoMode) {
      showSubscribePrompt();
      return;
    }
    if (draftLines.length === 0) {
      toast.error(t("invoices:creditNotes.noLinesSelected"));
      return;
    }
    try {
      const creditNote = await createCreditNote.mutateAsync({
        client_id: invoice.client_id,
        invoice_id: invoice.id,
        issue_date: issueDate,
        reason: reason || null,
        restock,
        lines: draftLines.map((l) => ({
          product_id: l.product_id,
          variant_id: l.variant_id,
          description: l.description,
          quantity: l.quantity,
          unit_price: l.unit_price,
          tax_rate: l.tax_rate,
        })),
      });
      toast.success(t("invoices:creditNotes.created"));
      onClose();
      router.push(`/invoices/credit-notes/${creditNote.id}`);
    } catch {
      toast.error(t("invoices:creditNotes.createFailed"));
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={t("invoices:creditNotes.createTitle")} size="xl">
      <div className="space-y-4">
        <p className="text-sm text-(--color-text-secondary)">
          {t("invoices:creditNotes.createSubtitle", { number: invoice.invoice_number })}
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Input
            label={t("invoices:fields.issueDate")}
            type="date"
            value={issueDate}
            onChange={(e) => setIssueDate(e.target.value)}
          />
          <Input
            label={t("invoices:creditNotes.reason")}
            placeholder={t("invoices:creditNotes.reasonPlaceholder")}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        </div>

        {/* One row per line that re-flows rather than a table that scrolls: in
            a phone-width dialog a 500px table hid the quantity to refund, the
            one thing to fill in, off to the side. */}
        <div className="border border-(--color-border-primary) rounded-lg divide-y divide-(--color-border-primary)">
          <div className="hidden sm:grid grid-cols-[1fr_6rem_7rem_7rem] gap-3 bg-(--color-bg-secondary) px-3 py-2 text-sm font-medium text-(--color-text-secondary) rounded-t-lg">
            <span className="text-start">{t("invoices:lines.description")}</span>
            <span className="text-end">{t("invoices:lines.unitPriceHt")}</span>
            <span className="text-center">{t("invoices:creditNotes.quantityToRefund")}</span>
            <span className="text-end">{t("invoices:lines.totalTtc")}</span>
          </div>
          {refundableLines.map((line) => {
            const qty = quantities[line.id] ?? 0;
            const lineSub = qty * line.unit_price;
            const lineTotal = lineSub + lineSub * (line.tax_rate / 100);
            return (
              <div
                key={line.id}
                className="grid grid-cols-[1fr_7rem] sm:grid-cols-[1fr_6rem_7rem_7rem] items-center gap-x-3 gap-y-1 px-3 py-2"
              >
                <span className="col-span-2 sm:col-span-1 text-sm">{line.description}</span>
                <span className={`hidden sm:block text-sm ${NUMERIC_CELL}`}>{formatCurrency(line.unit_price)}</span>
                <label className="block">
                  <span className="sm:hidden block text-xs text-(--color-text-secondary)">
                    {t("invoices:creditNotes.quantityToRefund")}
                  </span>
                  <input
                    type="number"
                    min={0}
                    max={line.quantity}
                    step="any"
                    inputMode="decimal"
                    value={qty}
                    onChange={(e) => setQty(line.id, Number(e.target.value), line.quantity)}
                    className="w-full h-10 sm:h-8 text-center rounded-md border border-(--color-border-primary) bg-(--color-bg-primary) px-2 text-base sm:text-sm"
                  />
                  <span className="block text-center text-xs text-(--color-text-secondary) mt-0.5">
                    / {line.quantity}
                  </span>
                </label>
                <span className={`text-sm font-medium ${NUMERIC_CELL}`}>{formatCurrency(lineTotal)}</span>
              </div>
            );
          })}
        </div>

        <label className="flex items-center gap-2 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={restock}
            onChange={(e) => setRestock(e.target.checked)}
            className="h-4 w-4 text-primary-600 border-gray-300 rounded focus:ring-primary-500"
          />
          <span className="text-sm text-(--color-text-primary)">{t("invoices:creditNotes.restock")}</span>
        </label>

        <div className="flex justify-end">
          <div className="w-full sm:w-64 space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-(--color-text-secondary)">{t("invoices:fields.totalHt")}</span>
              <span>{formatCurrency(totals.subtotal)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-(--color-text-secondary)">{t("common:labels.vat")}</span>
              <span>{formatCurrency(totals.tax)}</span>
            </div>
            <div className="flex justify-between text-base font-bold border-t pt-2">
              <span>{t("invoices:fields.totalTtc")}</span>
              <span>{formatCurrency(total)}</span>
            </div>
          </div>
        </div>

        <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:justify-end sm:gap-3">
          <Button variant="secondary" onClick={onClose}>
            {t("common:buttons.cancel")}
          </Button>
          <Button onClick={handleSubmit} isLoading={createCreditNote.isPending}>
            {t("invoices:creditNotes.create")}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
