import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button, Input, Modal, ModalFooter, Select, Textarea } from "@/components/ui";
import { formatDateISO } from "@/lib/utils";
import { useCreateSupplierAdjustment } from "../hooks/useSupplierAccount";

interface SupplierAdjustmentModalProps {
  open: boolean;
  onClose: () => void;
  supplierId: string;
}

type Direction = "increase" | "decrease";

/**
 * A hand correction to the supplier's balance: a discount agreed by phone, an
 * error on an invoice, a debt settled outside any order. Entered as an amount
 * and a direction rather than a signed number, and always with a reason.
 */
export function SupplierAdjustmentModal({ open, onClose, supplierId }: SupplierAdjustmentModalProps) {
  const { t } = useTranslation("suppliers");
  const { t: tCommon } = useTranslation("common");
  const createAdjustment = useCreateSupplierAdjustment(supplierId);

  const today = formatDateISO(new Date());
  const [direction, setDirection] = useState<Direction>("decrease");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(today);
  const [reason, setReason] = useState("");
  const [reasonError, setReasonError] = useState<string | undefined>();

  const handleClose = () => {
    setDirection("decrease");
    setAmount("");
    setDate(today);
    setReason("");
    setReasonError(undefined);
    onClose();
  };

  const parsed = parseFloat(amount);
  const canSubmit = parsed > 0 && !!date;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    if (!reason.trim()) {
      setReasonError(t("adjustment.reasonRequired"));
      return;
    }
    try {
      await createAdjustment.mutateAsync({
        amount: direction === "increase" ? parsed : -parsed,
        adjustment_date: date,
        reason: reason.trim(),
      });
      handleClose();
    } catch {
      // Toasted by the mutation; the form keeps what was typed.
    }
  };

  const isDirty = amount !== "" || reason !== "" || date !== today || direction !== "decrease";

  return (
    <Modal isOpen={open} onClose={handleClose} title={t("adjustment.title")} size="md" isDirty={isDirty}>
      <div className="space-y-4">
        <Select
          label={t("adjustment.direction")}
          name="adjustment-direction"
          value={direction}
          onChange={(e) => setDirection(e.target.value as Direction)}
          options={[
            { value: "decrease", label: t("adjustment.decrease") },
            { value: "increase", label: t("adjustment.increase") },
          ]}
        />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Input
            label={t("adjustment.amount")}
            name="adjustment-amount"
            type="number"
            step="0.01"
            min="0"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            required
            autoComplete="off"
          />
          <Input
            label={t("adjustment.date")}
            name="adjustment-date"
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            required
            autoComplete="off"
          />
        </div>
        <Textarea
          label={t("adjustment.reason")}
          name="adjustment-reason"
          value={reason}
          onChange={(e) => {
            setReason(e.target.value);
            if (reasonError) setReasonError(undefined);
          }}
          placeholder={t("adjustment.reasonPlaceholder")}
          rows={2}
          maxLength={500}
          error={reasonError}
        />
        <ModalFooter>
          <Button variant="secondary" onClick={handleClose}>
            {tCommon("buttons.cancel")}
          </Button>
          <Button onClick={handleSubmit} disabled={!canSubmit} isLoading={createAdjustment.isPending}>
            {t("adjustment.save")}
          </Button>
        </ModalFooter>
      </div>
    </Modal>
  );
}
