import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ArrowDownCircle, ArrowUpCircle } from "lucide-react";
import { Modal, ModalFooter, useModalDirty } from "@/components/ui";
import { formatCurrency } from "@/lib/utils";
import { useSettingsStore } from "@/stores/useSettingsStore";
import {
  useCreateCashMovement,
  useSessionCashMovements,
} from "../hooks/usePosTransaction";
import { useDemoMode } from "@/components/providers/DemoModeProvider";
import { toast } from "@/stores/useToastStore";
import type { CashMovementType } from "@/types";

const formatAmount = formatCurrency;

interface CashMovementModalProps {
  open: boolean;
  onClose: () => void;
  sessionId: string;
}

export function CashMovementModal({
  open,
  onClose,
  sessionId,
}: CashMovementModalProps) {
  const { t } = useTranslation("pos");

  return (
    <Modal isOpen={open} onClose={onClose} title={t("cashMovement")} size="md">
      <CashMovementForm onClose={onClose} sessionId={sessionId} />
    </Modal>
  );
}

// Inside the dialog, so an amount typed and then dismissed does not wait in
// the box for the next movement.
function CashMovementForm({
  onClose,
  sessionId,
}: Omit<CashMovementModalProps, "open">) {
  const { t } = useTranslation("pos");
  const { isDemoMode, showSubscribePrompt } = useDemoMode();
  const currency = useSettingsStore((state) => state.currency);
  const [movementType, setMovementType] = useState<CashMovementType>("IN");
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");

  const createMovement = useCreateCashMovement();
  const { data: movements, isLoading: movementsLoading } =
    useSessionCashMovements(sessionId);

  // Only what is typed and not yet added: the listed movements are saved.
  useModalDirty(amount !== "" || reason !== "");

  const handleSubmit = async () => {
    const parsedAmount = parseFloat(amount);
    if (!parsedAmount || parsedAmount <= 0 || !reason.trim()) return;
    if (isDemoMode) { showSubscribePrompt(); return; }

    try {
      await createMovement.mutateAsync({
        session_id: sessionId,
        movement_type: movementType,
        amount: parsedAmount,
        reason: reason.trim(),
      });
      setAmount("");
      setReason("");
      toast.success(t("cashMovementCreated"));
    } catch {
      toast.error(t("errors.cashMovementFailed"));
    }
  };

  const totalIn =
    movements
      ?.filter((m) => m.movement_type === "IN")
      .reduce((sum, m) => sum + m.amount, 0) ?? 0;

  const totalOut =
    movements
      ?.filter((m) => m.movement_type !== "IN")
      .reduce((sum, m) => sum + m.amount, 0) ?? 0;

  return (
    <div className="space-y-4">
      {/* Movement type */}
      <div className="grid grid-cols-2 gap-3">
        <button
          onClick={() => setMovementType("IN")}
          className={`min-w-0 p-3 rounded-lg border-2 flex items-center gap-2 transition-colors ${
            movementType === "IN"
              ? "border-green-500 bg-green-50 dark:bg-green-900/20"
              : "border-(--color-border-primary) hover:border-(--color-border-secondary)"
          }`}
        >
          <ArrowDownCircle
            className={`h-5 w-5 shrink-0 ${
              movementType === "IN"
                ? "text-green-600"
                : "text-(--color-text-secondary)"
            }`}
          />
          <span className="min-w-0 wrap-anywhere text-start font-medium text-sm">{t("cashIn")}</span>
        </button>
        <button
          onClick={() => setMovementType("OUT")}
          className={`min-w-0 p-3 rounded-lg border-2 flex items-center gap-2 transition-colors ${
            movementType === "OUT"
              ? "border-red-500 bg-red-50 dark:bg-red-900/20"
              : "border-(--color-border-primary) hover:border-(--color-border-secondary)"
          }`}
        >
          <ArrowUpCircle
            className={`h-5 w-5 shrink-0 ${
              movementType === "OUT"
                ? "text-red-600"
                : "text-(--color-text-secondary)"
            }`}
          />
          <span className="min-w-0 wrap-anywhere text-start font-medium text-sm">{t("cashOut")}</span>
        </button>
      </div>

      {/* Amount */}
      <div>
        <label htmlFor="pos-movement-amount" className="block text-sm font-medium mb-1 wrap-anywhere">
          {t("amount")} ({currency})
        </label>
        <input
          id="pos-movement-amount"
          type="number"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          className="w-full px-4 py-3 border border-(--color-border-input) rounded-lg text-xl text-center font-bold tabular-nums bg-(--color-bg-input) focus:outline-none focus:ring-2 focus:ring-primary-500"
          placeholder="0.00"
          min="0"
          step="0.01"
          autoFocus
        />
      </div>

      {/* Reason */}
      <div>
        <label htmlFor="pos-movement-reason" className="block text-sm font-medium mb-1">
          {t("reason")}
        </label>
        <input
          id="pos-movement-reason"
          type="text"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          className="w-full px-3 py-2.5 border border-(--color-border-input) rounded-lg bg-(--color-bg-input) focus:outline-none focus:ring-2 focus:ring-primary-500"
          placeholder={t("reasonPlaceholder")}
          onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
        />
      </div>

      {/* Submit. In the body, not the footer: adding a movement keeps the
          dialog open for the next one, the footer only closes it. */}
      <button
        onClick={handleSubmit}
        disabled={
          !amount ||
          parseFloat(amount) <= 0 ||
          !reason.trim() ||
          createMovement.isPending
        }
        className={`w-full px-4 py-3 rounded-lg font-bold text-white disabled:opacity-50 transition-colors ${
          movementType === "IN"
            ? "bg-green-600 hover:bg-green-700"
            : "bg-red-600 hover:bg-red-700"
        }`}
      >
        {createMovement.isPending
          ? t("loading")
          : movementType === "IN"
            ? t("addCashIn")
            : t("addCashOut")}
      </button>

      {/* History */}
      {!movementsLoading && movements && movements.length > 0 && (
        <div className="border-t border-(--color-border-primary) pt-4">
          {/* The two totals wrap under the heading on a phone rather than
              squeezing it to a letter per line. */}
          <div className="flex flex-wrap justify-between gap-x-4 gap-y-1 text-sm font-medium mb-2">
            <span className="min-w-0 wrap-anywhere">{t("recentMovements")}</span>
            <span className="ms-auto text-(--color-text-secondary) tabular-nums">
              <span className="whitespace-nowrap">{t("cashIn")}: {formatAmount(totalIn)}</span>
              {" | "}
              <span className="whitespace-nowrap">{t("cashOut")}: {formatAmount(totalOut)}</span>
            </span>
          </div>
          <div className="space-y-1 max-h-40 overflow-auto">
            {movements.map((m) => {
              const isIn = m.movement_type === "IN";
              const time = new Date(m.created_at).toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
              });
              return (
                <div
                  key={m.id}
                  className="flex flex-wrap items-center justify-between gap-x-2 text-sm p-2 rounded bg-(--color-bg-secondary)"
                >
                  {/* The reason is what tells two movements apart: wrapped
                      in full, never cut to an ellipsis. */}
                  <div className="flex items-center gap-2 min-w-0">
                    {isIn ? (
                      <ArrowDownCircle className="h-3.5 w-3.5 text-green-600 shrink-0" />
                    ) : (
                      <ArrowUpCircle className="h-3.5 w-3.5 text-red-600 shrink-0" />
                    )}
                    <span className="min-w-0 wrap-anywhere">{m.reason}</span>
                    <span className="text-xs text-(--color-text-secondary) shrink-0">
                      {time}
                    </span>
                  </div>
                  <span
                    className={`ms-auto font-medium shrink-0 tabular-nums whitespace-nowrap ${
                      isIn
                        ? "text-green-600 dark:text-green-400"
                        : "text-red-600 dark:text-red-400"
                    }`}
                  >
                    {isIn ? "+" : "-"}
                    {formatAmount(m.amount)}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <ModalFooter>
        <button
          onClick={onClose}
          className="w-full px-4 py-3 border border-(--color-border-primary) rounded-lg hover:bg-(--color-bg-secondary) font-medium transition-colors"
        >
          {t("close")}
        </button>
      </ModalFooter>
    </div>
  );
}
