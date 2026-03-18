import { useState } from "react";
import { useTranslation } from "react-i18next";
import { X, AlertCircle, CheckCircle2 } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { useSettingsStore } from "@/stores/useSettingsStore";
import { useSessionSummary } from "../hooks/usePosSession";

const formatAmount = formatCurrency;

interface CloseSessionModalProps {
  open: boolean;
  onClose: () => void;
  onConfirm: (actualCash: number, notes?: string) => void;
  sessionId: string;
  isLoading: boolean;
}

export function CloseSessionModal({
  open,
  onClose,
  onConfirm,
  sessionId,
  isLoading,
}: CloseSessionModalProps) {
  const { t } = useTranslation("pos");
  const currency = useSettingsStore((state) => state.currency);
  const [actualCash, setActualCash] = useState<string>("");
  const [notes, setNotes] = useState<string>("");

  const {
    data: summary,
    isLoading: summaryLoading,
    isError: summaryError,
  } = useSessionSummary(open ? sessionId : undefined);

  if (!open) return null;

  const handleConfirm = () => {
    const amount = parseFloat(actualCash) || 0;
    onConfirm(amount, notes || undefined);
  };

  const expectedCash = summary
    ? summary.session.opening_float +
      summary.cash_sales +
      summary.net_cash_movement
    : 0;

  const actualAmount = parseFloat(actualCash) || 0;
  const difference = actualAmount - expectedCash;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-(--color-bg-primary) rounded-xl shadow-xl w-full max-w-lg mx-4 max-h-[90vh] overflow-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-(--color-border-primary) sticky top-0 bg-(--color-bg-primary)">
          <h2 className="text-xl font-bold">{t("closeSession")}</h2>
          <button
            onClick={onClose}
            className="p-1 hover:bg-(--color-bg-secondary) rounded"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 space-y-6">
          {summaryLoading ? (
            <div className="text-center py-8 text-(--color-text-secondary)">
              {t("loading")}
            </div>
          ) : (
            <>
              {/* Session summary - only if available */}
              {summary && !summaryError && (
                <div className="space-y-2 text-sm">
                  <h3 className="font-bold text-lg">{t("sessionSummary")}</h3>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="p-3 bg-(--color-bg-secondary) rounded-lg">
                      <p className="text-(--color-text-secondary)">
                        {t("transactions")}
                      </p>
                      <p className="text-2xl font-bold">
                        {summary.transaction_count}
                      </p>
                    </div>
                    <div className="p-3 bg-(--color-bg-secondary) rounded-lg">
                      <p className="text-(--color-text-secondary)">
                        {t("totalSales")}
                      </p>
                      <p className="text-2xl font-bold">
                        {formatAmount(summary.total_sales)}
                      </p>
                    </div>
                    <div className="p-3 bg-(--color-bg-secondary) rounded-lg">
                      <p className="text-(--color-text-secondary)">
                        {t("cashSales")}
                      </p>
                      <p className="text-xl font-bold">
                        {formatAmount(summary.cash_sales)}
                      </p>
                    </div>
                    <div className="p-3 bg-(--color-bg-secondary) rounded-lg">
                      <p className="text-(--color-text-secondary)">
                        {t("cardSales")}
                      </p>
                      <p className="text-xl font-bold">
                        {formatAmount(summary.card_sales)}
                      </p>
                    </div>
                  </div>

                  {/* Expected cash breakdown */}
                  <div className="mt-4 p-3 border border-(--color-border-primary) rounded-lg space-y-1">
                    <div className="flex justify-between">
                      <span>{t("openingFloat")}</span>
                      <span>
                        {formatAmount(summary.session.opening_float)}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span>{t("cashSales")}</span>
                      <span>+{formatAmount(summary.cash_sales)}</span>
                    </div>
                    {summary.net_cash_movement !== 0 && (
                      <div className="flex justify-between">
                        <span>{t("cashMovements")}</span>
                        <span>
                          {summary.net_cash_movement >= 0 ? "+" : ""}
                          {formatAmount(summary.net_cash_movement)}
                        </span>
                      </div>
                    )}
                    <div className="flex justify-between font-bold border-t border-(--color-border-primary) pt-1">
                      <span>{t("expectedCash")}</span>
                      <span>{formatAmount(expectedCash)}</span>
                    </div>
                  </div>
                </div>
              )}

              {/* Error notice */}
              {summaryError && (
                <div className="p-3 bg-orange-100 dark:bg-orange-900/30 rounded-lg text-sm text-orange-700 dark:text-orange-300">
                  {t("summaryUnavailable")}
                </div>
              )}

              {/* Cash count */}
              <div>
                <label className="block text-sm font-medium mb-1">
                  {t("actualCash")} ({currency})
                </label>
                <input
                  type="number"
                  value={actualCash}
                  onChange={(e) => setActualCash(e.target.value)}
                  className="w-full px-4 py-3 border border-(--color-border-input) rounded-lg text-2xl text-center font-bold bg-(--color-bg-input) focus:outline-none focus:ring-2 focus:ring-primary-500"
                  placeholder="0.00"
                  min="0"
                  step="0.01"
                  autoFocus
                />
              </div>

              {/* Difference - only show when summary is available */}
              {actualCash && summary && (
                <div
                  className={`p-4 rounded-lg ${
                    Math.abs(difference) < 0.01
                      ? "bg-green-100 dark:bg-green-900/30"
                      : difference < 0
                        ? "bg-red-100 dark:bg-red-900/30"
                        : "bg-orange-100 dark:bg-orange-900/30"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    {Math.abs(difference) < 0.01 ? (
                      <CheckCircle2 className="h-5 w-5 shrink-0 text-green-600 dark:text-green-400" />
                    ) : (
                      <AlertCircle className="h-5 w-5 shrink-0" />
                    )}
                    <div>
                      <p className="text-sm font-medium">
                        {Math.abs(difference) < 0.01
                          ? t("cashBalanced")
                          : difference < 0
                            ? t("cashShort")
                            : t("cashOver")}
                      </p>
                      {Math.abs(difference) >= 0.01 && (
                        <p className="text-2xl font-bold">
                          {formatAmount(Math.abs(difference))}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* Notes */}
              <div>
                <label className="block text-sm font-medium mb-1">
                  {t("notes")} ({t("optional")})
                </label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="w-full px-3 py-2 border border-(--color-border-input) rounded-lg bg-(--color-bg-input) focus:outline-none focus:ring-2 focus:ring-primary-500"
                  rows={2}
                  placeholder={t("closeNotesPlaceholder")}
                />
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-(--color-border-primary) flex gap-3 sticky bottom-0 bg-(--color-bg-primary)">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-3 border border-(--color-border-primary) rounded-lg hover:bg-(--color-bg-secondary) font-medium transition-colors"
          >
            {t("cancel")}
          </button>
          <button
            onClick={handleConfirm}
            disabled={isLoading || !actualCash || summaryLoading}
            className="flex-1 px-4 py-3 bg-primary-600 hover:bg-primary-700 text-white rounded-lg font-bold disabled:opacity-50 transition-colors"
          >
            {isLoading ? t("loading") : t("closeSession")}
          </button>
        </div>
      </div>
    </div>
  );
}
