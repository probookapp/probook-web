import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button, Input, Modal, ModalFooter } from "@/components/ui";
import { formatDateISO } from "@/lib/utils";
import { toast } from "@/stores/useToastStore";
import { getApiErrorMessage } from "@/lib/api-adapter";
import { useUpdateCashJournalOpening } from "../hooks/useReports";
import type { CashJournal } from "@/types";

/**
 * "Where do I start from?" — the day the business begins following its money
 * here, and what it held that day. Set once so the balances start right;
 * nothing dated before that day is counted again.
 */
export function CashJournalOpeningModal({
  open,
  onClose,
  journal,
}: {
  open: boolean;
  onClose: () => void;
  journal: CashJournal | undefined;
}) {
  const { t } = useTranslation(["reports", "common"]);
  const save = useUpdateCashJournalOpening();
  // The figures already declared, when there are some, so a correction starts
  // from them rather than from zeros.
  const declared = journal?.start ? journal : null;
  const [start, setStart] = useState(declared?.start ?? formatDateISO(new Date()));
  const [cash, setCash] = useState(String(declared ? openingOf(declared, "cash") : 0));
  const [cheque, setCheque] = useState(String(declared ? openingOf(declared, "cheque") : 0));
  const [bank, setBank] = useState(String(declared ? openingOf(declared, "bank") : 0));

  const submit = async () => {
    try {
      await save.mutateAsync({ start, cash: Number(cash) || 0, cheque: Number(cheque) || 0, bank: Number(bank) || 0 });
      toast.success(t("reports:cashJournal.openingSaved"));
      onClose();
    } catch (err) {
      toast.error(getApiErrorMessage(err, t("common:messages.error")));
    }
  };

  return (
    <Modal isOpen={open} onClose={onClose} title={t("reports:cashJournal.openingTitle")} size="md">
      <div className="space-y-4">
        <p className="text-sm text-(--color-text-secondary)">{t("reports:cashJournal.openingHint")}</p>
        <Input
          label={t("reports:cashJournal.openingDate")}
          type="date"
          value={start}
          onChange={(e) => setStart(e.target.value)}
        />
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Input
            label={t("reports:cashJournal.buckets.cash")}
            type="number"
            step="0.01"
            min={0}
            value={cash}
            onChange={(e) => setCash(e.target.value)}
          />
          <Input
            label={t("reports:cashJournal.buckets.cheque")}
            type="number"
            step="0.01"
            min={0}
            value={cheque}
            onChange={(e) => setCheque(e.target.value)}
          />
          <Input
            label={t("reports:cashJournal.buckets.bank")}
            type="number"
            step="0.01"
            value={bank}
            onChange={(e) => setBank(e.target.value)}
          />
        </div>
        <ModalFooter>
          <Button variant="secondary" onClick={onClose}>
            {t("common:buttons.cancel")}
          </Button>
          <Button onClick={submit} isLoading={save.isPending} disabled={!start}>
            {t("common:buttons.save")}
          </Button>
        </ModalFooter>
      </div>
    </Modal>
  );
}

/**
 * The declared opening of a bucket. The journal reports the balance the
 * PERIOD opens on, which includes movements since the start; when the period
 * begins on the start day the two are the same, otherwise the settings hold it.
 */
function openingOf(journal: CashJournal, bucket: "cash" | "cheque" | "bank"): number {
  return journal.declared?.[bucket] ?? journal.buckets[bucket].opening;
}
