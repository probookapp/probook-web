import { useState } from "react";
import { useTranslation } from "react-i18next";
import { AlertCircle, CheckCircle2 } from "lucide-react";
import { FitAmount, Modal, ModalFooter, useModalDirty } from "@/components/ui";
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

  return (
    <Modal isOpen={open} onClose={onClose} title={t("closeSession")} size="lg">
      <CloseSessionForm
        onClose={onClose}
        onConfirm={onConfirm}
        sessionId={sessionId}
        isLoading={isLoading}
      />
    </Modal>
  );
}

// A line of the expected-cash breakdown. Wraps under its label rather than
// running off a phone when the figure is as wide as the row.
function BreakdownRow({ label, amount, className }: { label: string; amount: string; className?: string }) {
  return (
    <div className={`flex flex-wrap justify-between gap-x-4 ${className ?? ""}`}>
      <span className="min-w-0 wrap-anywhere">{label}</span>
      <span className="ms-auto shrink-0 tabular-nums whitespace-nowrap">{amount}</span>
    </div>
  );
}

// Inside the dialog, so the count and notes start blank at every closing
// instead of carrying over from one dismissed attempt to the next.
function CloseSessionForm({
  onClose,
  onConfirm,
  sessionId,
  isLoading,
}: Omit<CloseSessionModalProps, "open">) {
  const { t } = useTranslation("pos");
  const currency = useSettingsStore((state) => state.currency);
  const [actualCash, setActualCash] = useState<string>("");
  const [notes, setNotes] = useState<string>("");

  useModalDirty(actualCash !== "" || notes !== "");

  const {
    data: summary,
    isLoading: summaryLoading,
    isError: summaryError,
  } = useSessionSummary(sessionId);

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
    <div className="space-y-6">
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
              {/* min-w-0 on the tiles: a grid item is as wide as its content by
                  default, and FitAmount can only shrink inside a bounded one. */}
              <div className="grid grid-cols-2 gap-2">
                <div className="min-w-0 p-3 bg-(--color-bg-secondary) rounded-lg">
                  <p className="text-(--color-text-secondary) wrap-anywhere">
                    {t("transactions")}
                  </p>
                  <p className="text-2xl font-bold">
                    <FitAmount>{summary.transaction_count}</FitAmount>
                  </p>
                </div>
                <div className="min-w-0 p-3 bg-(--color-bg-secondary) rounded-lg">
                  <p className="text-(--color-text-secondary) wrap-anywhere">
                    {t("totalSales")}
                  </p>
                  <p className="text-2xl font-bold">
                    <FitAmount>{formatAmount(summary.total_sales)}</FitAmount>
                  </p>
                </div>
                {/* One tile per method actually used: a cheque is revenue
                    but not cash, and the cashier has to see both. */}
                {(summary.sales_by_method ?? []).map((row) => (
                  <div key={row.method} className="min-w-0 p-3 bg-(--color-bg-secondary) rounded-lg">
                    <p className="text-(--color-text-secondary) wrap-anywhere">
                      {t(row.method.toLowerCase(), { defaultValue: row.method })}
                    </p>
                    <p className="text-xl font-bold"><FitAmount>{formatAmount(row.amount)}</FitAmount></p>
                  </div>
                ))}
              </div>

              {/* Expected cash breakdown */}
              <div className="mt-4 p-3 border border-(--color-border-primary) rounded-lg space-y-1">
                <BreakdownRow
                  label={t("openingFloat")}
                  amount={formatAmount(summary.session.opening_float)}
                />
                <BreakdownRow label={t("cashSales")} amount={`+${formatAmount(summary.cash_sales)}`} />
                {summary.net_cash_movement !== 0 && (
                  <BreakdownRow
                    label={t("cashMovements")}
                    amount={`${summary.net_cash_movement >= 0 ? "+" : ""}${formatAmount(summary.net_cash_movement)}`}
                  />
                )}
                <BreakdownRow
                  label={t("expectedCash")}
                  amount={formatAmount(expectedCash)}
                  className="font-bold border-t border-(--color-border-primary) pt-1"
                />
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
            <label htmlFor="pos-actual-cash" className="block text-sm font-medium mb-1 wrap-anywhere">
              {t("actualCash")} ({currency})
            </label>
            <input
              id="pos-actual-cash"
              type="number"
              value={actualCash}
              onChange={(e) => setActualCash(e.target.value)}
              className="w-full px-4 py-3 border border-(--color-border-input) rounded-lg text-2xl text-center font-bold tabular-nums bg-(--color-bg-input) focus:outline-none focus:ring-2 focus:ring-primary-500"
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
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium wrap-anywhere">
                    {Math.abs(difference) < 0.01
                      ? t("cashBalanced")
                      : difference < 0
                        ? t("cashShort")
                        : t("cashOver")}
                  </p>
                  {Math.abs(difference) >= 0.01 && (
                    <p className="text-2xl font-bold">
                      <FitAmount>{formatAmount(Math.abs(difference))}</FitAmount>
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Notes */}
          <div>
            <label htmlFor="pos-close-notes" className="block text-sm font-medium mb-1 wrap-anywhere">
              {t("notes")} ({t("optional")})
            </label>
            <textarea
              id="pos-close-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full px-3 py-2 border border-(--color-border-input) rounded-lg bg-(--color-bg-input) focus:outline-none focus:ring-2 focus:ring-primary-500"
              rows={2}
              placeholder={t("closeNotesPlaceholder")}
            />
          </div>
        </>
      )}

      <ModalFooter>
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
      </ModalFooter>
    </div>
  );
}
