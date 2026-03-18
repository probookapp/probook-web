import { useTranslation } from "react-i18next";
import { usePosStore } from "../stores/usePosStore";
import { formatCurrency } from "@/lib/utils";

const formatAmount = formatCurrency;

export function CartTotals() {
  const { t } = useTranslation("pos");
  const { getSubtotal, getTotalVat, getTotal, getFinalAmount, discountPercent, discountAmount, getItemCount } =
    usePosStore();

  const subtotal = getSubtotal();
  const taxAmount = getTotalVat();
  const total = getTotal();
  const finalAmount = getFinalAmount();
  const itemCount = getItemCount();
  const hasDiscount = discountPercent > 0 || discountAmount > 0;

  return (
    <div className="border-t border-(--color-border-primary) p-4 bg-(--color-bg-secondary)/30 shrink-0">
      <div className="space-y-1 text-sm">
        <div className="flex justify-between text-(--color-text-secondary)">
          <span>
            {t("subtotalHt")} ({itemCount} {t("items")})
          </span>
          <span>{formatAmount(subtotal)}</span>
        </div>
        <div className="flex justify-between text-(--color-text-secondary)">
          <span>{t("vat")}</span>
          <span>{formatAmount(taxAmount)}</span>
        </div>
        {hasDiscount && (
          <>
            <div className="flex justify-between">
              <span>{t("totalTtc")}</span>
              <span>{formatAmount(total)}</span>
            </div>
            <div className="flex justify-between text-green-600">
              <span>
                {t("discount")}
                {discountPercent > 0 && ` (${discountPercent}%)`}
              </span>
              <span>-{formatAmount(total - finalAmount)}</span>
            </div>
          </>
        )}
        <div className="flex justify-between text-xl font-bold pt-2 border-t border-(--color-border-primary)">
          <span>{t("total")}</span>
          <span>{formatAmount(finalAmount)}</span>
        </div>
      </div>
    </div>
  );
}
