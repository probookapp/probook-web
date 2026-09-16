import { useState } from "react";
import { useTranslation } from "react-i18next";
import { X, Banknote, CreditCard, FileCheck, Landmark, UserRound } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { computeStampDuty, stampDutyApplies } from "@/lib/stamp-duty";
import { missingChequeMentions } from "@/lib/cheque-mentions";
import { useCompanySettings } from "@/features/settings/hooks/useSettings";
import {
  POS_PAYMENT_METHODS,
  methodTakesReference,
  type PosPaymentMethod,
} from "@/lib/pos-payment-methods";

const formatAmount = formatCurrency;

/**
 * One settlement already banked on this sale.
 *
 * A counter sale is not always one method: a customer puts part on a card and
 * hands over the rest in cash. The till took a single method, so the cashier had
 * to record the whole sale as one of them — and with the stamp duty falling on
 * the cash part alone, both choices were wrong. Everything in cash over-charged
 * the duty; everything on the card charged none.
 */
interface SettledLine {
  method: PosPaymentMethod;
  amount: number;
  cashGiven?: number;
  reference?: string;
  chequeDate?: string;
  chequeNumber?: string;
  chequeBank?: string;
}

interface PaymentModalProps {
  open: boolean;
  onClose: () => void;
  onConfirm: (
    payments: Array<{
      method: string;
      amount: number;
      cashGiven?: number;
      reference?: string;
      chequeDate?: string;
      chequeNumber?: string;
      chequeBank?: string;
    }>,
    /** The duty the customer was shown and paid, so the ticket prints the same. */
    stampDuty: number
  ) => void;
  totalAmount: number;
  isLoading: boolean;
  /** A sale left on the client's account has to name the client to chase. */
  hasClient?: boolean;
}

const ICONS: Record<PosPaymentMethod, React.ElementType> = {
  CASH: Banknote,
  CARD: CreditCard,
  CHEQUE: FileCheck,
  TRANSFER: Landmark,
  CREDIT: UserRound,
};

const LABEL_KEYS: Record<PosPaymentMethod, string> = {
  CASH: "cash",
  CARD: "card",
  CHEQUE: "cheque",
  TRANSFER: "transfer",
  CREDIT: "credit",
};

export function PaymentModal({
  open,
  onClose,
  onConfirm,
  totalAmount,
  isLoading,
  hasClient = false,
}: PaymentModalProps) {
  const { t } = useTranslation("pos");
  const { data: settings } = useCompanySettings();
  const [paymentMethod, setPaymentMethod] = useState<PosPaymentMethod>("CASH");
  const [cashGiven, setCashGiven] = useState<string>("");
  const [reference, setReference] = useState<string>("");
  const [chequeDate, setChequeDate] = useState<string>("");
  const [chequeNumber, setChequeNumber] = useState<string>("");
  const [chequeBank, setChequeBank] = useState<string>("");
  const [partialAmount, setPartialAmount] = useState<string>("");
  const [banked, setBanked] = useState<SettledLine[]>([]);

  if (!open) return null;

  const isCash = paymentMethod === "CASH";
  const isCredit = paymentMethod === "CREDIT";

  // A cheque is exempt from the duty, but only on a receipt carrying its date,
  // number and drawee (art. 258). Asked for exactly where the exemption is
  // worth something: a business under a regime with no stamp duty — or one that
  // has not turned it on — is owed none of this paperwork, and the plain
  // reference box below serves it instead.
  const chequeMentionsRequired =
    paymentMethod === "CHEQUE" &&
    stampDutyApplies({
      fiscalProfile: settings?.fiscal_profile,
      stampDutyEnabled: settings?.stamp_duty_enabled,
    });
  const missingMentions = chequeMentionsRequired
    ? missingChequeMentions(paymentMethod, {
        cheque_date: chequeDate,
        cheque_number: chequeNumber,
        cheque_bank: chequeBank,
      })
    : [];

  const cashAmount = parseFloat(cashGiven) || 0;

  // What the banked lines already cover, and what is therefore left for the
  // entry being filled in now.
  const bankedTotal = banked.reduce((sum, line) => sum + line.amount, 0);
  const goodsLeft = Math.max(0, Math.round((totalAmount - bankedTotal) * 1000) / 1000);

  // What the customer is settling now. Cash is driven by the amount handed
  // over; the other methods take an explicit figure so a part-payment can be
  // recorded and the rest left on account.
  const settledNow = isCash
    ? Math.min(cashAmount, goodsLeft)
    : isCredit
      ? 0
      : partialAmount === ""
        ? goodsLeft
        : Math.min(parseFloat(partialAmount) || 0, goodsLeft);

  const remaining = Math.max(
    0,
    Math.round((totalAmount - bankedTotal - settledNow) * 1000) / 1000
  );
  const leavesBalance = remaining > 0;

  // Droit de timbre on the part settled in cash, shown before the money is
  // taken rather than after. Computed on the goods, then added — the duty is
  // owed on top of the sale, never carved out of it, and computing it on a
  // total that already included it would chase its own tail.
  //
  // Card, cheque and transfer are exempt (art. 258 quinquies), so switching
  // method makes the line disappear, which is exactly the behaviour the law is
  // trying to encourage.
  // Across every line, not just the one on screen: a sale settled half in cash
  // and half by card owes the duty on the half that was cash, which is exactly
  // what the circular n° 14/MF/DGI/LF.2025 says and what the server recomputes.
  const cashPortion =
    banked.reduce((sum, line) => sum + (line.method === "CASH" ? line.amount : 0), 0) +
    (isCash ? settledNow : 0);

  const stampDuty = computeStampDuty({
    fiscalProfile: settings?.fiscal_profile,
    enabled: settings?.stamp_duty_enabled,
    threshold: settings?.stamp_duty_threshold ?? 0,
    isCashSale: cashPortion > 0,
    total: cashPortion,
    isDraft: false,
  });
  const dueNow = Math.round((totalAmount + stampDuty) * 1000) / 1000;
  // The cash on the counter covers this line and the duty the sale owes, not
  // the part a card already took.
  const change = isCash ? Math.max(0, cashAmount - (settledNow + stampDuty)) : 0;

  // The entry on screen, as a line — used both to bank it and to confirm.
  const currentLine = (): SettledLine => ({
    method: paymentMethod,
    amount: settledNow,
    cashGiven: isCash ? cashAmount : undefined,
    // The cheque number IS the reference for a cheque: asking twice for the
    // same figure is how the two end up disagreeing on the same receipt.
    reference: chequeMentionsRequired
      ? chequeNumber
      : methodTakesReference(paymentMethod)
        ? reference || undefined
        : undefined,
    chequeDate: chequeMentionsRequired ? chequeDate : undefined,
    chequeNumber: chequeMentionsRequired ? chequeNumber : undefined,
    chequeBank: chequeMentionsRequired ? chequeBank : undefined,
  });

  const resetEntry = () => {
    setCashGiven("");
    setReference("");
    setChequeDate("");
    setChequeNumber("");
    setChequeBank("");
    setPartialAmount("");
  };

  /** Bank this settlement and leave the rest to another method. */
  const addLine = () => {
    setBanked((prev) => [...prev, currentLine()]);
    resetEntry();
    setPaymentMethod("CASH");
  };

  // Worth banking only if it settles something and leaves something to settle.
  const canAddLine =
    !isCredit && settledNow > 0 && missingMentions.length === 0 && remaining > 0;

  // Anything left unpaid becomes the client's balance, so there has to be one.
  const isValid =
    missingMentions.length === 0 &&
    (!leavesBalance || hasClient) &&
    (isCash ? cashAmount >= dueNow || settledNow > 0 : true) &&
    (isCredit || settledNow > 0 || bankedTotal > 0 || hasClient);

  const handleConfirm = () => {
    const payments: Array<{
      method: string;
      amount: number;
      cashGiven?: number;
      reference?: string;
      chequeDate?: string;
      chequeNumber?: string;
      chequeBank?: string;
    }> = [];

    payments.push(...banked);

    if (settledNow > 0) {
      payments.push(currentLine());
    }
    // The unpaid remainder is recorded as its own CREDIT line rather than being
    // silently dropped: the ticket must always account for its full total.
    if (leavesBalance) {
      payments.push({ method: "CREDIT", amount: remaining });
    }

    onConfirm(payments, stampDuty);
  };

  // What this cash line has to cover: what is left of the goods, plus the duty
  // the cash brings with it. With a card line already banked, offering notes for
  // the whole sale would have the cashier take money twice.
  const cashTarget = Math.round((goodsLeft + stampDuty) * 1000) / 1000;
  const quickAmounts = [
    Math.ceil(cashTarget / 10) * 10,
    Math.ceil(cashTarget / 50) * 50,
    Math.ceil(cashTarget / 100) * 100,
    Math.ceil(cashTarget / 500) * 500,
  ].filter((v, i, a) => a.indexOf(v) === i && v >= cashTarget);

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 overflow-y-auto">
      <div className="bg-(--color-bg-primary) rounded-xl shadow-xl w-full max-w-md mx-4 my-4">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-(--color-border-primary)">
          <h2 className="text-xl font-bold">{t("payment")}</h2>
          <button onClick={onClose} aria-label={t("close")} className="-me-1.5 p-2.5 hover:bg-(--color-bg-secondary) rounded-md">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 space-y-5">
          {/* Total */}
          <div className="text-center">
            <p className="text-sm text-(--color-text-secondary)">{t("totalToPay")}</p>
            <p className="text-4xl font-bold">{formatAmount(dueNow)}</p>
            {stampDuty > 0 && (
              // Named and itemised: the customer is paying a tax on top of the
              // goods, not a higher price for them.
              <p className="mt-1 text-xs text-(--color-text-secondary)">
                {t("stampDutyLine", {
                  goods: formatAmount(totalAmount),
                  duty: formatAmount(stampDuty),
                })}
              </p>
            )}
          </div>

          {/* What has already been settled on this sale */}
          {banked.length > 0 && (
            <ul className="space-y-1.5">
              {banked.map((line, i) => (
                <li
                  key={i}
                  className="flex items-center justify-between gap-3 rounded-lg border border-(--color-border-primary) px-3 py-2"
                >
                  <span className="text-sm font-medium">{t(LABEL_KEYS[line.method])}</span>
                  <span className="flex items-center gap-3">
                    <span className="text-sm font-mono tabular-nums">
                      {formatAmount(line.amount)}
                    </span>
                    <button
                      type="button"
                      onClick={() => setBanked((prev) => prev.filter((_, j) => j !== i))}
                      aria-label={t("removePayment")}
                      className="p-2.5 rounded-md hover:bg-(--color-bg-secondary)"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </span>
                </li>
              ))}
              <li className="flex items-center justify-between px-3 pt-1 text-sm text-(--color-text-secondary)">
                <span>{t("remainingToSettle")}</span>
                <span className="font-mono tabular-nums">{formatAmount(cashTarget)}</span>
              </li>
            </ul>
          )}

          {/* Payment method selection */}
          <div className="grid grid-cols-3 gap-2">
            {POS_PAYMENT_METHODS.map((method) => {
              const Icon = ICONS[method];
              const active = paymentMethod === method;
              return (
                <button
                  key={method}
                  onClick={() => setPaymentMethod(method)}
                  aria-pressed={active}
                  className={`p-3 rounded-lg border-2 flex flex-col items-center gap-1.5 transition-colors ${
                    active
                      ? "border-primary-600 bg-primary-50 dark:bg-primary-900/20"
                      : "border-(--color-border-primary) hover:border-(--color-border-secondary)"
                  }`}
                >
                  <Icon className="h-6 w-6" />
                  <span className="text-sm font-medium">{t(LABEL_KEYS[method])}</span>
                </button>
              );
            })}
          </div>

          {/* Cash input */}
          {isCash && (
            <div className="space-y-3">
              <div>
                <label htmlFor="pos-cash-given" className="block text-sm font-medium mb-1">
                  {t("cashGiven")}
                </label>
                <input
                  id="pos-cash-given"
                  name="pos-cash-given"
                  type="number"
                  value={cashGiven}
                  onChange={(e) => setCashGiven(e.target.value)}
                  className="w-full px-4 py-3 border border-(--color-border-input) rounded-lg text-2xl text-center font-bold bg-(--color-bg-input) focus:outline-none focus:ring-2 focus:ring-primary-500"
                  placeholder="0.00"
                  autoFocus
                />
              </div>

              {/* Quick amounts */}
              <div className="flex gap-2 flex-wrap">
                {quickAmounts.slice(0, 4).map((amount) => (
                  <button
                    key={amount}
                    onClick={() => setCashGiven(amount.toString())}
                    className="px-4 py-2 border border-(--color-border-primary) rounded-lg hover:bg-(--color-bg-secondary) text-sm font-medium transition-colors"
                  >
                    {formatAmount(amount)}
                  </button>
                ))}
              </div>

              {/* Change */}
              {cashAmount >= dueNow && (
                <div className="p-4 bg-green-100 dark:bg-green-900/30 rounded-lg text-center">
                  <p className="text-sm text-green-700 dark:text-green-300">{t("change")}</p>
                  <p className="text-3xl font-bold text-green-700 dark:text-green-300">
                    {formatAmount(change)}
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Part payment for the non-cash methods */}
          {!isCash && !isCredit && (
            <div>
              <label htmlFor="pos-partial-amount" className="block text-sm font-medium mb-1">
                {t("amountReceived")}
              </label>
              <input
                id="pos-partial-amount"
                name="pos-partial-amount"
                type="number"
                value={partialAmount}
                onChange={(e) => setPartialAmount(e.target.value)}
                className="w-full px-4 py-3 border border-(--color-border-input) rounded-lg text-xl text-center font-bold bg-(--color-bg-input) focus:outline-none focus:ring-2 focus:ring-primary-500"
                placeholder={formatAmount(totalAmount)}
              />
              <p className="mt-1 text-xs text-(--color-text-secondary)">{t("amountReceivedHint")}</p>
            </div>
          )}

          {/* The three mentions article 258 conditions the exemption on */}
          {chequeMentionsRequired && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="pos-cheque-date" className="block text-sm font-medium mb-1">
                    {t("chequeDate")}
                  </label>
                  <input
                    id="pos-cheque-date"
                    name="pos-cheque-date"
                    type="date"
                    value={chequeDate}
                    onChange={(e) => setChequeDate(e.target.value)}
                    className="w-full px-3 py-2 border border-(--color-border-input) rounded-lg bg-(--color-bg-input) focus:outline-none focus:ring-2 focus:ring-primary-500"
                  />
                </div>
                <div>
                  <label htmlFor="pos-cheque-number" className="block text-sm font-medium mb-1">
                    {t("chequeNumber")}
                  </label>
                  <input
                    id="pos-cheque-number"
                    name="pos-cheque-number"
                    type="text"
                    inputMode="numeric"
                    autoComplete="off"
                    value={chequeNumber}
                    onChange={(e) => setChequeNumber(e.target.value)}
                    className="w-full px-3 py-2 border border-(--color-border-input) rounded-lg bg-(--color-bg-input) focus:outline-none focus:ring-2 focus:ring-primary-500"
                  />
                </div>
              </div>
              <div>
                <label htmlFor="pos-cheque-bank" className="block text-sm font-medium mb-1">
                  {t("chequeBank")}
                </label>
                <input
                  id="pos-cheque-bank"
                  name="pos-cheque-bank"
                  type="text"
                  autoComplete="off"
                  value={chequeBank}
                  onChange={(e) => setChequeBank(e.target.value)}
                  className="w-full px-3 py-2 border border-(--color-border-input) rounded-lg bg-(--color-bg-input) focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
              </div>
              <p className="text-xs text-(--color-text-secondary)">{t("chequeMentionsHint")}</p>
            </div>
          )}

          {/* Cheque number / transfer reference */}
          {!chequeMentionsRequired && methodTakesReference(paymentMethod) && (
            <div>
              <label htmlFor="pos-payment-reference" className="block text-sm font-medium mb-1">
                {t("paymentReference")}
              </label>
              <input
                id="pos-payment-reference"
                name="pos-payment-reference"
                type="text"
                value={reference}
                onChange={(e) => setReference(e.target.value)}
                autoComplete="off"
                className="w-full px-3 py-2 border border-(--color-border-input) rounded-lg bg-(--color-bg-input) focus:outline-none focus:ring-2 focus:ring-primary-500"
                placeholder={t("paymentReferencePlaceholder")}
              />
            </div>
          )}

          {/* Settle part of the sale now and the rest another way */}
          {canAddLine && (
            <button
              type="button"
              onClick={addLine}
              className="w-full px-4 py-2.5 rounded-lg border border-dashed border-(--color-border-secondary) text-sm font-medium hover:bg-(--color-bg-secondary) transition-colors"
            >
              {t("addPayment", { amount: formatAmount(settledNow) })}
            </button>
          )}

          {/* What is left on the client's account */}
          {leavesBalance && (
            <div
              className={`p-3 rounded-lg text-center ${
                hasClient
                  ? "bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-300"
                  : "bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300"
              }`}
            >
              <p className="text-sm">{t("leftOnAccount")}</p>
              <p className="text-2xl font-bold">{formatAmount(remaining)}</p>
              {!hasClient && <p className="mt-1 text-xs">{t("creditNeedsClient")}</p>}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-(--color-border-primary) flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-3 border border-(--color-border-primary) rounded-lg hover:bg-(--color-bg-secondary) font-medium transition-colors"
          >
            {t("cancel")}
          </button>
          <button
            onClick={handleConfirm}
            disabled={!isValid || isLoading}
            className="flex-1 px-4 py-3 bg-green-600 hover:bg-green-700 text-white rounded-lg font-bold disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {isLoading ? t("loading") : t("confirm")}
          </button>
        </div>
      </div>
    </div>
  );
}
