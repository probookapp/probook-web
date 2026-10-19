import { useTranslation } from "react-i18next";
import { formatCurrency } from "@/lib/utils";
import { cn } from "@/lib/utils";

/**
 * A supplier balance as a person reads it: what is owed in red, credit held by
 * the supplier in green and marked as such, never a bare minus sign that reads
 * like a typo.
 */
export function SupplierBalanceAmount({ balance, className }: { balance: number; className?: string }) {
  const { t } = useTranslation("suppliers");
  if (Math.abs(balance) < 0.005) {
    return <span className={cn("text-(--color-text-secondary)", className)}>{formatCurrency(0)}</span>;
  }
  if (balance > 0) {
    return (
      <span className={cn("text-red-600 dark:text-red-400", className)} title={t("credits.youOwe")}>
        {formatCurrency(balance)}
      </span>
    );
  }
  return (
    <span className={cn("text-green-600 dark:text-green-400", className)} title={t("credits.inYourFavour")}>
      {formatCurrency(-balance)} <span className="text-xs font-normal">{t("credits.creditShort")}</span>
    </span>
  );
}
