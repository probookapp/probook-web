import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Plus, X, Check, Pencil } from "lucide-react";
import {
  Button,
  Input,
  SearchableSelect,
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui";
import {
  useSuppliersForProduct,
  useSuppliers,
  useAddProductSupplier,
  useRemoveProductSupplier,
  useUpdateProductSupplierPrice,
} from "@/features/suppliers/hooks/useSuppliers";
import { useToastStore } from "@/stores/useToastStore";
import { formatCurrency } from "@/lib/utils";
import type { SupplierWithPrice, CreateProductSupplierInput } from "@/types";

interface ProductSuppliersProps {
  productId: string;
}

export function ProductSuppliers({ productId }: ProductSuppliersProps) {
  const { t } = useTranslation("products");
  const { t: tCommon } = useTranslation("common");
  const addToast = useToastStore((state) => state.addToast);

  const { data: linkedSuppliers, isLoading: isLoadingLinked } = useSuppliersForProduct(productId);
  const { data: allSuppliers } = useSuppliers();
  const addProductSupplier = useAddProductSupplier();
  const removeProductSupplier = useRemoveProductSupplier();
  const updatePrice = useUpdateProductSupplierPrice();

  const [isAdding, setIsAdding] = useState(false);
  const [selectedSupplierId, setSelectedSupplierId] = useState("");
  const [purchasePrice, setPurchasePrice] = useState("");
  const [editingLinkId, setEditingLinkId] = useState<string | null>(null);
  const [editingPrice, setEditingPrice] = useState("");

  const linkedSupplierIds = new Set(linkedSuppliers?.map((s: SupplierWithPrice) => s.id) ?? []);
  const availableSuppliers = allSuppliers?.filter((s) => !linkedSupplierIds.has(s.id)) ?? [];

  const handleAddSupplier = async () => {
    if (!selectedSupplierId || !purchasePrice) return;

    const input: CreateProductSupplierInput = {
      product_id: productId,
      supplier_id: selectedSupplierId,
      purchase_price: parseFloat(purchasePrice),
    };

    try {
      await addProductSupplier.mutateAsync(input);
      addToast({ type: "success", message: t("suppliers.linked") });
      setSelectedSupplierId("");
      setPurchasePrice("");
      setIsAdding(false);
    } catch {
      addToast({ type: "error", message: t("suppliers.linkError") });
    }
  };

  const handleRemoveSupplier = async (linkId: string) => {
    try {
      await removeProductSupplier.mutateAsync(linkId);
      addToast({ type: "success", message: t("suppliers.unlinked") });
    } catch {
      addToast({ type: "error", message: t("suppliers.unlinkError") });
    }
  };

  const handleStartEditPrice = (supplier: SupplierWithPrice) => {
    setEditingLinkId(supplier.link_id);
    setEditingPrice(String(supplier.purchase_price));
  };

  const handleSavePrice = async () => {
    if (!editingLinkId || !editingPrice) return;
    try {
      await updatePrice.mutateAsync({
        linkId: editingLinkId,
        purchasePrice: parseFloat(editingPrice),
      });
      addToast({ type: "success", message: t("suppliers.priceUpdated") });
      setEditingLinkId(null);
      setEditingPrice("");
    } catch {
      addToast({ type: "error", message: t("suppliers.priceUpdateError") });
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
          {t("suppliers.title")}
        </h3>
        {!isAdding && (
          <Button size="sm" onClick={() => setIsAdding(true)}>
            <Plus className="h-4 w-4 mr-2" />
            {t("suppliers.addSupplier")}
          </Button>
        )}
      </div>

      {isAdding && (
        <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-4 space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <SearchableSelect
              label={tCommon("labels.select")}
              options={[
                { value: "", label: t("suppliers.selectSupplier") },
                ...availableSuppliers.map((supplier) => ({
                  value: supplier.id,
                  label: supplier.name,
                })),
              ]}
              value={selectedSupplierId}
              onChange={setSelectedSupplierId}
              placeholder={t("suppliers.selectSupplier")}
            />
            <Input
              label={t("suppliers.purchasePrice")}
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
                setSelectedSupplierId("");
                setPurchasePrice("");
              }}
            >
              {tCommon("buttons.cancel")}
            </Button>
            <Button
              size="sm"
              onClick={handleAddSupplier}
              isLoading={addProductSupplier.isPending}
              disabled={!selectedSupplierId || !purchasePrice}
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
              <TableHead>{tCommon("labels.name")}</TableHead>
              <TableHead>{tCommon("labels.email")}</TableHead>
              <TableHead>{tCommon("labels.phone")}</TableHead>
              <TableHead>{t("suppliers.purchasePrice")}</TableHead>
              <TableHead className="w-24">{tCommon("buttons.actions")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {linkedSuppliers && linkedSuppliers.length > 0 ? (
              linkedSuppliers.map((supplier: SupplierWithPrice) => (
                <TableRow key={supplier.link_id}>
                  <TableCell className="font-medium text-gray-900 dark:text-gray-100">
                    {supplier.name}
                  </TableCell>
                  <TableCell className="text-gray-600 dark:text-gray-400">
                    {supplier.email || "-"}
                  </TableCell>
                  <TableCell className="text-gray-600 dark:text-gray-400">
                    {supplier.phone || "-"}
                  </TableCell>
                  <TableCell className="text-gray-600 dark:text-gray-400">
                    {editingLinkId === supplier.link_id ? (
                      <div className="flex items-center gap-1">
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          value={editingPrice}
                          onChange={(e) => setEditingPrice(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") handleSavePrice();
                            if (e.key === "Escape") { setEditingLinkId(null); setEditingPrice(""); }
                          }}
                          autoFocus
                          className="w-24 px-2 py-1 text-sm border rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 border-gray-300 dark:border-gray-600 focus:outline-none focus:ring-1 focus:ring-primary-500"
                        />
                        <button
                          onClick={handleSavePrice}
                          className="p-1 text-green-600 hover:text-green-700 transition-colors"
                          title={tCommon("buttons.save")}
                        >
                          <Check className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => { setEditingLinkId(null); setEditingPrice(""); }}
                          className="p-1 text-gray-500 hover:text-gray-700 transition-colors"
                          title={tCommon("buttons.cancel")}
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => handleStartEditPrice(supplier)}
                        className="group flex items-center gap-1 hover:text-primary-600 transition-colors"
                        title={t("suppliers.editPrice")}
                      >
                        {formatCurrency(supplier.purchase_price)}
                        <Pencil className="h-3 w-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                      </button>
                    )}
                  </TableCell>
                  <TableCell>
                    <button
                      onClick={() => handleRemoveSupplier(supplier.link_id)}
                      className="p-1 text-gray-500 hover:text-red-600 transition-colors"
                      title={t("suppliers.removeSupplier")}
                      aria-label={t("suppliers.removeSupplier")}
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-gray-500 dark:text-gray-400 py-8">
                  {t("suppliers.noSuppliers")}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
