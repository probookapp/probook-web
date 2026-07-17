import { useTranslation } from "react-i18next";
import { ArrowDown, ArrowUp } from "lucide-react";
import { Modal, Badge } from "@/components/ui";
import { useProductMovements } from "../hooks/useStock";
import type { Product, StockMovementType } from "@/types";

interface StockMovementsModalProps {
  isOpen: boolean;
  onClose: () => void;
  product: Product | null;
}

function typeVariant(type: StockMovementType): "success" | "danger" | "warning" | "info" | "default" {
  switch (type) {
    case "purchase":
    case "return":
    case "initial":
      return "success";
    case "sale":
      return "danger";
    case "adjustment":
      return "warning";
    default:
      return "default";
  }
}

export function StockMovementsModal({ isOpen, onClose, product }: StockMovementsModalProps) {
  const { t } = useTranslation("products");
  const { data: movements, isLoading } = useProductMovements(product?.id ?? "", isOpen);

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={t("movements.title")} size="lg">
      <div className="space-y-3">
        {product && (
          <p className="text-sm text-gray-600 dark:text-gray-400">{product.designation}</p>
        )}

        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary-600" />
          </div>
        ) : !movements || movements.length === 0 ? (
          <div className="py-8 text-center text-gray-500 dark:text-gray-400">
            {t("movements.empty")}
          </div>
        ) : (
          <div className="max-h-96 overflow-y-auto divide-y divide-gray-200 dark:divide-gray-700">
            {movements.map((m) => (
              <div key={m.id} className="flex items-center gap-3 py-2.5">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <Badge variant={typeVariant(m.type)}>{t(`movements.types.${m.type}`)}</Badge>
                    {m.variant_name && (
                      <span className="text-xs text-gray-500 dark:text-gray-400 truncate">
                        {m.variant_name}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                    {new Date(m.created_at).toLocaleString()}
                    {m.reason ? ` · ${m.reason}` : ""}
                  </p>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  {m.quantity_change >= 0 ? (
                    <ArrowUp className="h-4 w-4 text-green-600 dark:text-green-400" />
                  ) : (
                    <ArrowDown className="h-4 w-4 text-red-600 dark:text-red-400" />
                  )}
                  <span
                    className={`text-sm font-medium ${
                      m.quantity_change >= 0
                        ? "text-green-600 dark:text-green-400"
                        : "text-red-600 dark:text-red-400"
                    }`}
                  >
                    {m.quantity_change >= 0 ? "+" : ""}
                    {m.quantity_change}
                  </span>
                </div>
                <div className="w-16 text-right shrink-0">
                  <span className="text-sm text-gray-900 dark:text-gray-100">{m.balance_after}</span>
                  <p className="text-[10px] text-gray-400 dark:text-gray-500">
                    {t("movements.balance")}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </Modal>
  );
}
