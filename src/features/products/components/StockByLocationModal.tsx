import { useTranslation } from "react-i18next";
import { Warehouse, Store } from "lucide-react";
import { Modal, Badge } from "@/components/ui";
import { useProductStockLevels } from "../hooks/useStock";
import type { Product } from "@/types";

interface StockByLocationModalProps {
  isOpen: boolean;
  onClose: () => void;
  product: Product | null;
}

export function StockByLocationModal({ isOpen, onClose, product }: StockByLocationModalProps) {
  const { t } = useTranslation("products");
  const { data: locations, isLoading } = useProductStockLevels(product?.id ?? "", isOpen);

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={t("stockLocations.title")} size="md">
      <div className="space-y-3">
        {product && (
          <p className="text-sm text-gray-600 dark:text-gray-400">{product.designation}</p>
        )}

        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary-600" />
          </div>
        ) : !locations || locations.length === 0 ? (
          <div className="py-8 text-center text-gray-500 dark:text-gray-400">
            {t("stockLocations.noData")}
          </div>
        ) : (
          <div className="divide-y divide-gray-200 dark:divide-gray-700">
            {locations.map((loc) => (
              <div key={loc.location_id} className="py-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-2 text-sm font-medium text-gray-900 dark:text-gray-100">
                    {loc.location_type === "warehouse" ? (
                      <Warehouse className="h-4 w-4 text-gray-400" />
                    ) : (
                      <Store className="h-4 w-4 text-gray-400" />
                    )}
                    {loc.location_name}
                  </span>
                  <Badge variant={loc.quantity > 0 ? "success" : "danger"}>
                    {loc.quantity}
                  </Badge>
                </div>
                {loc.variants.length > 0 && (
                  <div className="mt-2 ml-6 space-y-1">
                    {loc.variants.map((v) => (
                      <div
                        key={v.variant_id}
                        className="flex items-center justify-between gap-2 text-xs text-gray-600 dark:text-gray-400"
                      >
                        <span className="truncate">{v.variant_name ?? "-"}</span>
                        <span className="font-medium">{v.quantity}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </Modal>
  );
}
