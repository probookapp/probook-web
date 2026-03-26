import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Plus, X } from "lucide-react";
import {
  Button,
  Input,
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui";
import {
  useProductsForSupplier,
  useAddProductSupplier,
  useRemoveProductSupplier,
} from "../hooks/useSuppliers";
import { useProducts } from "@/features/products/hooks/useProducts";
import { useDemoMode } from "@/components/providers/DemoModeProvider";
import { useToastStore } from "@/stores/useToastStore";
import { formatCurrency } from "@/lib/utils";
import type { ProductWithPrice, CreateProductSupplierInput } from "@/types";

interface SupplierProductsProps {
  supplierId: string;
}

export function SupplierProducts({ supplierId }: SupplierProductsProps) {
  const { t } = useTranslation("suppliers");
  const { t: tCommon } = useTranslation("common");
  const { isDemoMode, showSubscribePrompt } = useDemoMode();
  const addToast = useToastStore((state) => state.addToast);

  const { data: linkedProducts, isLoading: isLoadingLinked } = useProductsForSupplier(supplierId);
  const { data: allProducts } = useProducts();
  const addProductSupplier = useAddProductSupplier();
  const removeProductSupplier = useRemoveProductSupplier();

  const [isAdding, setIsAdding] = useState(false);
  const [selectedProductId, setSelectedProductId] = useState("");
  const [purchasePrice, setPurchasePrice] = useState("");

  const linkedProductIds = new Set(linkedProducts?.map((p: ProductWithPrice) => p.id) ?? []);
  const availableProducts = allProducts?.filter((p) => !linkedProductIds.has(p.id)) ?? [];

  const handleAddProduct = async () => {
    if (!selectedProductId || !purchasePrice) return;
    if (isDemoMode) { showSubscribePrompt(); return; }

    const input: CreateProductSupplierInput = {
      product_id: selectedProductId,
      supplier_id: supplierId,
      purchase_price: parseFloat(purchasePrice),
    };

    try {
      await addProductSupplier.mutateAsync(input);
      addToast({ type: "success", message: t("messages.productLinked") });
      setSelectedProductId("");
      setPurchasePrice("");
      setIsAdding(false);
    } catch {
      addToast({ type: "error", message: t("messages.productLinkError") });
    }
  };

  const handleRemoveProduct = async (linkId: string) => {
    if (isDemoMode) { showSubscribePrompt(); return; }
    try {
      await removeProductSupplier.mutateAsync(linkId);
      addToast({ type: "success", message: t("messages.productUnlinked") });
    } catch {
      addToast({ type: "error", message: t("messages.productUnlinkError") });
    }
  };

  if (isLoadingLinked) {
    return (
      <div className="flex items-center justify-center h-32">
        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary-600" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100">
          {t("products.title")}
        </h3>
        {!isAdding && (
          <Button size="sm" onClick={() => setIsAdding(true)}>
            <Plus className="h-4 w-4 mr-2" />
            {t("products.addProduct")}
          </Button>
        )}
      </div>

      {isAdding && (
        <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-4 space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label
                htmlFor="product-select"
                className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
              >
                {tCommon("labels.product")}
              </label>
              <select
                id="product-select"
                value={selectedProductId}
                onChange={(e) => setSelectedProductId(e.target.value)}
                className="w-full px-3 py-2 border rounded-lg shadow-sm transition-colors bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 border-gray-300 dark:border-gray-600"
              >
                <option value="">{t("products.selectProduct")}</option>
                {availableProducts.map((product) => (
                  <option key={product.id} value={product.id}>
                    {product.designation}
                    {product.reference ? ` (${product.reference})` : ""}
                  </option>
                ))}
              </select>
            </div>
            <Input
              label={t("products.purchasePrice")}
              type="number"
              step="0.01"
              min="0"
              autoComplete="off"
              value={purchasePrice}
              onChange={(e) => setPurchasePrice(e.target.value)}
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button
              size="sm"
              variant="secondary"
              onClick={() => {
                setIsAdding(false);
                setSelectedProductId("");
                setPurchasePrice("");
              }}
            >
              {tCommon("buttons.cancel")}
            </Button>
            <Button
              size="sm"
              onClick={handleAddProduct}
              isLoading={addProductSupplier.isPending}
              disabled={!selectedProductId || !purchasePrice}
            >
              {tCommon("buttons.add")}
            </Button>
          </div>
        </div>
      )}

      <div className="overflow-x-auto">
        <Table className="min-w-full">
          <TableHeader>
            <TableRow>
              <TableHead>{tCommon("labels.product")}</TableHead>
              <TableHead>{tCommon("labels.reference")}</TableHead>
              <TableHead>{t("products.purchasePrice")}</TableHead>
              <TableHead>{tCommon("labels.unitPrice")}</TableHead>
              <TableHead className="w-24">{tCommon("buttons.actions")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {linkedProducts && linkedProducts.length > 0 ? (
              linkedProducts.map((product: ProductWithPrice) => (
                <TableRow key={product.link_id}>
                  <TableCell className="font-medium text-gray-900 dark:text-gray-100">
                    {product.designation}
                  </TableCell>
                  <TableCell className="text-gray-600 dark:text-gray-400">
                    {product.reference || "-"}
                  </TableCell>
                  <TableCell className="text-gray-600 dark:text-gray-400">
                    {formatCurrency(product.purchase_price)}
                  </TableCell>
                  <TableCell className="text-gray-600 dark:text-gray-400">
                    {formatCurrency(product.unit_price)}
                  </TableCell>
                  <TableCell>
                    <button
                      onClick={() => handleRemoveProduct(product.link_id)}
                      className="p-1 text-gray-500 hover:text-red-600 transition-colors"
                      title={t("products.removeProduct")}
                      aria-label={t("products.removeProduct")}
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-gray-500 dark:text-gray-400 py-8">
                  {t("products.noProducts")}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
