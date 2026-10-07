import { useTranslation } from "react-i18next";
import { Package } from "lucide-react";
import { commonTaxRate, type BundleComponentSnapshot } from "@/lib/bundles";

interface BundleContentsProps {
  components: ReadonlyArray<BundleComponentSnapshot>;
  /** Packs on the line: the quantities shown are for all of them. */
  quantity?: number | string | null;
  className?: string;
}

const formatQuantity = (q: number) => String(Math.round(q * 1000) / 1000);

/**
 * What a pack line holds, under the line in the document editors: the
 * components and their quantities for the packs on the line, and whether
 * their VAT rates differ (the line then has no single rate of its own).
 */
export function BundleContents({ components, quantity, className = "" }: BundleContentsProps) {
  const { t } = useTranslation("common");
  const packs = Number(quantity) > 0 ? Number(quantity) : 1;
  const mixed = commonTaxRate(components) === null;

  return (
    <div
      className={`flex items-start gap-2 text-xs text-(--color-text-secondary) ${className}`}
      data-testid="bundle-contents"
    >
      <Package className="h-3.5 w-3.5 mt-0.5 shrink-0" aria-hidden />
      <div className="min-w-0">
        <span className="font-medium">{t("documentLines.packContains")}</span>{" "}
        {components.map((c, i) => (
          <span key={`${c.product_id}:${c.variant_id ?? ""}:${i}`}>
            {i > 0 && " · "}
            <span className="whitespace-nowrap">
              {formatQuantity(c.quantity * packs)} × {c.description}
            </span>
          </span>
        ))}
        {mixed && (
          <span className="ms-2 rounded bg-amber-100 px-1.5 py-0.5 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200">
            {t("documentLines.packMixedVat")}
          </span>
        )}
      </div>
    </div>
  );
}
