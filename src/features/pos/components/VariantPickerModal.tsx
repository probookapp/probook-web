import { useTranslation } from "react-i18next";
import { Modal } from "@/components/ui";
import type { Product, ProductVariant } from "@/types";
import { formatCurrency } from "@/lib/utils";

interface VariantPickerModalProps {
  product: Product;
  onSelect: (product: Product, variant: ProductVariant) => void;
  onClose: () => void;
}

export function VariantPickerModal({ product, onSelect, onClose }: VariantPickerModalProps) {
  const { t } = useTranslation(["pos", "products"]);
  const variants = product.variants || [];

  return (
    <Modal isOpen={true} onClose={onClose} title={t("pos:selectVariant")} size="sm">
      <p className="font-medium text-sm mb-3 truncate">{product.designation}</p>
      <div className="space-y-2">
        {variants.map((v) => {
          const price = v.price_override ?? product.unit_price;
          const outOfStock = v.quantity <= 0;
          return (
            <button
              key={v.id}
              onClick={() => !outOfStock && onSelect(product, v)}
              disabled={outOfStock}
              className={`w-full text-left px-3 py-2.5 rounded-lg border transition-colors ${
                outOfStock
                  ? "border-gray-200 dark:border-gray-700 opacity-50 cursor-not-allowed"
                  : "border-(--color-border-primary) hover:bg-(--color-bg-secondary)"
              }`}
            >
              <div className="flex justify-between items-start">
                <div>
                  <p className="text-sm font-medium">{v.name}</p>
                  <div className="flex flex-wrap gap-1 mt-0.5">
                    {Object.entries(v.attributes || {}).map(([key, val]) => (
                      <span key={key} className="text-xs text-(--color-text-secondary)">
                        {t(`products:variants.presets.${key}`, { defaultValue: key })}: {val}
                      </span>
                    ))}
                  </div>
                </div>
                <div className="text-right shrink-0 ml-2">
                  <p className="text-sm font-bold text-primary-600">
                    {formatCurrency(price * (1 + product.tax_rate / 100))}
                  </p>
                  <p className={`text-xs ${outOfStock ? "text-red-600 dark:text-red-400" : "text-(--color-text-secondary)"}`}>
                    {outOfStock ? t("pos:variantOutOfStock") : `${t("pos:quantity")}: ${v.quantity}`}
                  </p>
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </Modal>
  );
}
