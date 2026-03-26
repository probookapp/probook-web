import { useState } from "react";
import { useTranslation } from "react-i18next";
import { X, ArrowDownCircle, ArrowUpCircle } from "lucide-react";
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
  const { isDemoMode, showSubscribePrompt } = useDemoMode();
  const currency = useSettingsStore((state) => state.currency);
  const [movementType, setMovementType] = useState<CashMovementType>("CASH_IN");
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");

  const createMovement = useCreateCashMovement();
  const { data: movements, isLoading: movementsLoading } =
    useSessionCashMovements(open ? sessionId : undefined);

  if (!open) return null;

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
      ?.filter((m) => m.movement_type === "CASH_IN")
      .reduce((sum, m) => sum + m.amount, 0) ?? 0;

  const totalOut =
    movements
      ?.filter((m) => m.movement_type !== "CASH_IN")
      .reduce((sum, m) => sum + m.amount, 0) ?? 0;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-(--color-bg-primary) rounded-xl shadow-xl w-full max-w-md mx-4 max-h-[90vh] overflow-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-(--color-border-primary)">
          <h2 className="text-xl font-bold">{t("cashMovement")}</h2>
          <button
            onClick={onClose}
            className="p-1 hover:bg-(--color-bg-secondary) rounded"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 space-y-4">
          {/* Movement type */}
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={() => setMovementType("CASH_IN")}
              className={`p-3 rounded-lg border-2 flex items-center gap-2 transition-colors ${
                movementType === "CASH_IN"
                  ? "border-green-500 bg-green-50 dark:bg-green-900/20"
                  : "border-(--color-border-primary) hover:border-(--color-border-secondary)"
              }`}
            >
              <ArrowDownCircle
                className={`h-5 w-5 ${
                  movementType === "CASH_IN"
                    ? "text-green-600"
                    : "text-(--color-text-secondary)"
                }`}
              />
              <span className="font-medium text-sm">{t("cashIn")}</span>
            </button>
            <button
              onClick={() => setMovementType("CASH_OUT")}
              className={`p-3 rounded-lg border-2 flex items-center gap-2 transition-colors ${
                movementType === "CASH_OUT"
                  ? "border-red-500 bg-red-50 dark:bg-red-900/20"
                  : "border-(--color-border-primary) hover:border-(--color-border-secondary)"
              }`}
            >
              <ArrowUpCircle
                className={`h-5 w-5 ${
                  movementType === "CASH_OUT"
                    ? "text-red-600"
                    : "text-(--color-text-secondary)"
                }`}
              />
              <span className="font-medium text-sm">{t("cashOut")}</span>
            </button>
          </div>

          {/* Amount */}
          <div>
            <label className="block text-sm font-medium mb-1">
              {t("amount")} ({currency})
            </label>
            <input
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="w-full px-4 py-3 border border-(--color-border-input) rounded-lg text-xl text-center font-bold bg-(--color-bg-input) focus:outline-none focus:ring-2 focus:ring-primary-500"
              placeholder="0.00"
              min="0"
              step="0.01"
              autoFocus
            />
          </div>

          {/* Reason */}
          <div>
            <label className="block text-sm font-medium mb-1">
              {t("reason")}
            </label>
            <input
              type="text"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="w-full px-3 py-2.5 border border-(--color-border-input) rounded-lg bg-(--color-bg-input) focus:outline-none focus:ring-2 focus:ring-primary-500"
              placeholder={t("reasonPlaceholder")}
              onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
            />
          </div>

          {/* Submit */}
          <button
            onClick={handleSubmit}
            disabled={
              !amount ||
              parseFloat(amount) <= 0 ||
              !reason.trim() ||
              createMovement.isPending
            }
            className={`w-full px-4 py-3 rounded-lg font-bold text-white disabled:opacity-50 transition-colors ${
              movementType === "CASH_IN"
                ? "bg-green-600 hover:bg-green-700"
                : "bg-red-600 hover:bg-red-700"
            }`}
          >
            {createMovement.isPending
              ? t("loading")
              : movementType === "CASH_IN"
                ? t("addCashIn")
                : t("addCashOut")}
          </button>

          {/* History */}
          {!movementsLoading && movements && movements.length > 0 && (
            <div className="border-t border-(--color-border-primary) pt-4">
              <div className="flex justify-between text-sm font-medium mb-2">
                <span>{t("recentMovements")}</span>
                <span className="text-(--color-text-secondary)">
                  {t("cashIn")}: {formatAmount(totalIn)} | {t("cashOut")}:{" "}
                  {formatAmount(totalOut)}
                </span>
              </div>
              <div className="space-y-1 max-h-40 overflow-auto">
                {movements.map((m) => {
                  const isIn = m.movement_type === "CASH_IN";
                  const time = new Date(m.created_at).toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                  });
                  return (
                    <div
                      key={m.id}
                      className="flex items-center justify-between text-sm p-2 rounded bg-(--color-bg-secondary)"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        {isIn ? (
                          <ArrowDownCircle className="h-3.5 w-3.5 text-green-600 shrink-0" />
                        ) : (
                          <ArrowUpCircle className="h-3.5 w-3.5 text-red-600 shrink-0" />
                        )}
                        <span className="truncate">{m.reason}</span>
                        <span className="text-xs text-(--color-text-secondary) shrink-0">
                          {time}
                        </span>
                      </div>
                      <span
                        className={`font-medium shrink-0 ml-2 ${
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
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-(--color-border-primary)">
          <button
            onClick={onClose}
            className="w-full px-4 py-3 border border-(--color-border-primary) rounded-lg hover:bg-(--color-bg-secondary) font-medium transition-colors"
          >
            {t("close")}
          </button>
        </div>
      </div>
    </div>
  );
}
