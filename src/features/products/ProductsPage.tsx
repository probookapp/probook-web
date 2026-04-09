import { useState, useMemo, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Plus, Pencil, Trash2, Search, Package, Briefcase, Tags, Upload, Folder, Truck } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useDemoMode } from "@/components/providers/DemoModeProvider";
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Modal,
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
  Input,
  Badge,
} from "@/components/ui";
import { BulkActionBar } from "@/components/shared/BulkActionBar";
import { BulkDeleteModal } from "@/components/shared/BulkDeleteModal";
import { useSelection } from "@/hooks/useSelection";
import { ProductForm } from "./components/ProductForm";
import { ProductSuppliers } from "./components/ProductSuppliers";
import { CategoryManager } from "./components/CategoryManager";
import { ImportDialog } from "@/components/shared/ImportDialog";
import {
  useProducts,
  useCreateProduct,
  useUpdateProduct,
  useDeleteProduct,
  useBatchDeleteProducts,
} from "./hooks/useProducts";
import { useProductCategories } from "./hooks/useProductCategories";
import { formatCurrency } from "@/lib/utils";
import { toast } from "@/stores/useToastStore";
import { isApiError } from "@/lib/api-adapter";
import { productSupplierApi } from "@/lib/api";
import type { Product } from "@/types";
import type { ProductFormData } from "./schemas/productSchema";

type TabType = "products" | "categories";

export function ProductsPage() {
  const { t } = useTranslation("products");
  const { t: tCommon } = useTranslation("common");
  const [activeTab, setActiveTab] = useState<TabType>("products");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<Product | undefined>();
  const [searchQuery, setSearchQuery] = useState("");
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [categoryFilter, setCategoryFilter] = useState<string>("");
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [supplierProductId, setSupplierProductId] = useState<string | null>(null);
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);

  const { isDemoMode, showSubscribePrompt } = useDemoMode();
  const { data: products, isLoading } = useProducts();
  const { data: categories } = useProductCategories();
  const createProduct = useCreateProduct();
  const updateProduct = useUpdateProduct();
  const deleteProduct = useDeleteProduct();
  const batchDeleteProducts = useBatchDeleteProducts();

  const getCategoryName = (categoryId: string | null) => {
    if (!categoryId || !categories) return null;
    const cat = categories.find((c) => c.id === categoryId);
    return cat?.name || null;
  };

  const { data: supplierSummaries } = useQuery({
    queryKey: ["product-supplier-summaries", { demo: isDemoMode }],
    queryFn: isDemoMode ? () => [] : productSupplierApi.getAllSummaries,
    staleTime: isDemoMode ? Infinity : undefined,
  });

  const suppliersByProduct = useMemo(() => {
    const map: Record<string, { supplier_id: string; supplier_name: string }[]> = {};
    for (const s of supplierSummaries ?? []) {
      if (!map[s.product_id]) map[s.product_id] = [];
      map[s.product_id].push({ supplier_id: s.supplier_id, supplier_name: s.supplier_name });
    }
    return map;
  }, [supplierSummaries]);

  const filteredProducts = products?.filter((product) => {
    const matchesSearch =
      product.designation.toLowerCase().includes(searchQuery.toLowerCase()) ||
      product.reference?.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory = !categoryFilter || product.category_id === categoryFilter;
    return matchesSearch && matchesCategory;
  });

  const selection = useSelection(filteredProducts);

  useEffect(() => { selection.clear(); }, [searchQuery, categoryFilter]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleOpenModal = (product?: Product) => {
    if (isDemoMode) { showSubscribePrompt(); return; }
    setSelectedProduct(product);
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setSelectedProduct(undefined);
    setIsModalOpen(false);
  };

  const handleSubmit = async (data: ProductFormData) => {
    if (isDemoMode) { showSubscribePrompt(); return; }
    // Transform empty strings to null for optional fields
    const input = {
      ...data,
      description: data.description || null,
      reference: data.reference || null,
      category_id: data.category_id || null,
    };

    if (selectedProduct) {
      await updateProduct.mutateAsync({ ...input, id: selectedProduct.id });
    } else {
      await createProduct.mutateAsync(input);
    }
    handleCloseModal();
  };

  const handleDelete = async (id: string) => {
    if (isDemoMode) { showSubscribePrompt(); return; }
    try {
      await deleteProduct.mutateAsync(id);
      setDeleteConfirmId(null);
    } catch (err) {
      toast.error(isApiError(err, 409) ? t("messages.deleteBlocked") : t("messages.deleteError"));
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-gray-100">{t("title")}</h1>
          <p className="text-sm sm:text-base text-gray-500 dark:text-gray-400">{t("subtitle")}</p>
        </div>
        {activeTab === "products" && (
          <div className="flex gap-2 self-start sm:self-auto">
            <Button variant="secondary" onClick={() => isDemoMode ? showSubscribePrompt() : setIsImportOpen(true)} size="sm">
              <Upload className="h-4 w-4 mr-2" />
              {tCommon("buttons.import")}
            </Button>
            <Button onClick={() => handleOpenModal()} size="sm">
              <Plus className="h-4 w-4 mr-2" />
              {t("newProduct")}
            </Button>
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200 dark:border-gray-700">
        <nav className="-mb-px flex gap-4 sm:gap-6">
          <button
            onClick={() => setActiveTab("products")}
            className={`flex items-center gap-2 py-3 px-1 border-b-2 text-sm font-medium transition-colors ${
              activeTab === "products"
                ? "border-primary-500 text-primary-600 dark:text-primary-400"
                : "border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 hover:border-gray-300"
            }`}
          >
            <Package className="h-4 w-4" />
            {t("tabs.products")} ({products?.length || 0})
          </button>
          <button
            onClick={() => setActiveTab("categories")}
            className={`flex items-center gap-2 py-3 px-1 border-b-2 text-sm font-medium transition-colors ${
              activeTab === "categories"
                ? "border-primary-500 text-primary-600 dark:text-primary-400"
                : "border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 hover:border-gray-300"
            }`}
          >
            <Tags className="h-4 w-4" />
            {t("tabs.categories")} ({categories?.length || 0})
          </button>
        </nav>
      </div>

      {activeTab === "categories" ? (
        <CategoryManager />
      ) : (
        <Card>
          <CardHeader>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <CardTitle>{t("productList")}</CardTitle>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
                {categories && categories.length > 0 && (
                  <select
                    id="category-filter"
                    name="category-filter"
                    value={categoryFilter}
                    onChange={(e) => setCategoryFilter(e.target.value)}
                    className="h-10 rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                  >
                    <option value="">{t("allCategories")}</option>
                    {categories.map((cat) => (
                      <option key={cat.id} value={cat.id}>
                        {cat.name}
                      </option>
                    ))}
                  </select>
                )}
                <div className="relative w-full sm:w-56 md:w-64 lg:w-72">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <Input
                    id="product-search"
                    name="product-search"
                    placeholder={t("searchPlaceholder")}
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    autoComplete="off"
                    className="pl-9"
                  />
                </div>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {/* Mobile card view */}
            <div className="md:hidden divide-y divide-gray-200 dark:divide-gray-700">
              {filteredProducts && filteredProducts.length > 0 ? (
                filteredProducts.map((product) => (
                  <div key={product.id} className="p-4 flex items-start gap-3">
                    <input
                      type="checkbox"
                      checked={selection.isSelected(product.id)}
                      onChange={() => selection.toggle(product.id)}
                      className="mt-1 h-4 w-4 text-primary-600 border-gray-300 rounded focus:ring-primary-500"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          {product.is_service ? (
                            <Badge variant="info"><Briefcase className="h-3 w-3 mr-1" />{t("types.service")}</Badge>
                          ) : (
                            <Badge variant="default"><Package className="h-3 w-3 mr-1" />{t("types.product")}</Badge>
                          )}
                          <p className="font-medium text-gray-900 dark:text-gray-100 truncate">{product.designation}</p>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <button onClick={() => setSupplierProductId(product.id)} className="p-1 text-gray-500 hover:text-amber-600 dark:hover:text-amber-400" aria-label={t("fields.suppliers")} title={t("fields.suppliers")}><Truck className="h-4 w-4" /></button>
                          <button onClick={() => handleOpenModal(product)} className="p-1 text-gray-500 hover:text-primary-600 dark:hover:text-primary-400" aria-label={tCommon("buttons.edit")}><Pencil className="h-4 w-4" /></button>
                          <button onClick={() => setDeleteConfirmId(product.id)} className="p-1 text-gray-500 hover:text-red-600 disabled:opacity-50 disabled:cursor-not-allowed" title={tCommon("buttons.delete")} aria-label={tCommon("buttons.delete")}><Trash2 className="h-4 w-4" /></button>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 mt-1 text-sm text-gray-500 dark:text-gray-400">
                        {product.reference && <span className="font-mono">{product.reference}</span>}
                        {getCategoryName(product.category_id) && (
                          <span className="inline-flex items-center gap-1"><Folder className="h-3 w-3" />{getCategoryName(product.category_id)}</span>
                        )}
                      </div>
                      <div className="flex items-center justify-between mt-1.5">
                        <span className="text-sm font-medium text-gray-900 dark:text-gray-100">{formatCurrency(product.unit_price)}</span>
                        {!product.is_service && (
                          <Badge variant={(product.quantity ?? 0) > 0 ? "success" : "danger"}>
                            {t("fields.quantity")}: {product.quantity ?? 0}
                          </Badge>
                        )}
                      </div>
                    </div>
                  </div>
                ))
              ) : (
                <div className="py-8 text-center text-gray-500 dark:text-gray-400">{t("noProducts")}</div>
              )}
            </div>
            {/* Desktop table view */}
            <div className="hidden md:block overflow-x-auto">
            <Table className="min-w-200">
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">
                    <input type="checkbox" checked={selection.isAllSelected} ref={(el) => { if (el) el.indeterminate = selection.isIndeterminate; }} onChange={() => selection.toggleAll()} className="h-4 w-4 text-primary-600 border-gray-300 rounded focus:ring-primary-500" />
                  </TableHead>
                  <TableHead>{t("fields.type")}</TableHead>
                  <TableHead>{t("fields.reference")}</TableHead>
                  <TableHead>{t("fields.designation")}</TableHead>
                  <TableHead>{t("fields.category")}</TableHead>
                  <TableHead>{t("fields.suppliers")}</TableHead>
                  <TableHead>{t("fields.purchasePriceHt")}</TableHead>
                  <TableHead>{t("fields.priceHT")}</TableHead>
                  <TableHead>{t("fields.quantity")}</TableHead>
                  <TableHead className="w-24">{tCommon("buttons.actions")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredProducts && filteredProducts.length > 0 ? (
                  filteredProducts.map((product) => (
                    <TableRow key={product.id}>
                      <TableCell>
                        <input type="checkbox" checked={selection.isSelected(product.id)} onChange={() => selection.toggle(product.id)} className="h-4 w-4 text-primary-600 border-gray-300 rounded focus:ring-primary-500" />
                      </TableCell>
                      <TableCell>
                        {product.is_service ? (
                          <Badge variant="info">
                            <Briefcase className="h-3 w-3 mr-1" />
                            {t("types.service")}
                          </Badge>
                        ) : (
                          <Badge variant="default">
                            <Package className="h-3 w-3 mr-1" />
                            {t("types.product")}
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="font-mono text-sm text-gray-600 dark:text-gray-400">
                        {product.reference || "-"}
                      </TableCell>
                      <TableCell className="font-medium text-gray-900 dark:text-gray-100">{product.designation}</TableCell>
                      <TableCell className="text-gray-600 dark:text-gray-400">
                        {getCategoryName(product.category_id) ? (
                          <span className="inline-flex items-center gap-1">
                            <Folder className="h-3 w-3" />
                            {getCategoryName(product.category_id)}
                          </span>
                        ) : (
                          <span className="text-gray-400 dark:text-gray-500">-</span>
                        )}
                      </TableCell>
                      <TableCell className="text-gray-600 dark:text-gray-400">
                        {suppliersByProduct[product.id]?.length ? (
                          <div className="flex flex-wrap gap-1">
                            {suppliersByProduct[product.id].map((s) => (
                              <Badge key={s.supplier_id} variant="default" className="text-xs">
                                {s.supplier_name}
                              </Badge>
                            ))}
                          </div>
                        ) : (
                          <span className="text-gray-400 dark:text-gray-500">-</span>
                        )}
                      </TableCell>
                      <TableCell className="text-gray-600 dark:text-gray-400">
                        {product.purchase_price != null ? formatCurrency(product.purchase_price) : "-"}
                      </TableCell>
                      <TableCell className="text-gray-600 dark:text-gray-400">{formatCurrency(product.unit_price)}</TableCell>
                      <TableCell>
                        {product.is_service ? (
                          <span className="text-gray-400 dark:text-gray-500">-</span>
                        ) : (
                          <Badge variant={(product.quantity ?? 0) > 0 ? "success" : "danger"}>
                            {product.quantity ?? 0}
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => setSupplierProductId(product.id)}
                            aria-label={t("fields.suppliers")}
                            title={t("fields.suppliers")}
                            className="p-1 text-gray-500 hover:text-amber-600 dark:hover:text-amber-400 transition-colors"
                          >
                            <Truck className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => handleOpenModal(product)}
                            aria-label={tCommon("buttons.edit")}
                            className="p-1 text-gray-500 hover:text-primary-600 dark:hover:text-primary-400 transition-colors"
                          >
                            <Pencil className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => setDeleteConfirmId(product.id)}
                            aria-label={tCommon("buttons.delete")}
                            className="p-1 text-gray-500 hover:text-red-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                            title={tCommon("buttons.delete")}
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={10} className="text-center text-gray-500 dark:text-gray-400 py-8">
                      {t("noProducts")}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
            </div>
          </CardContent>
        </Card>
      )}

      <ImportDialog
        isOpen={isImportOpen}
        onClose={() => setIsImportOpen(false)}
        title={tCommon("import.title", { entity: t("title") })}
        entityType="products"
        requiredColumns={["designation", "unit_price"]}
        optionalColumns={["description", "tax_rate", "unit", "reference", "is_service", "quantity", "purchase_price"]}
      />

      <Modal
        isOpen={isModalOpen}
        onClose={handleCloseModal}
        title={selectedProduct ? t("editProduct") : t("newProduct")}
        size="lg"
      >
        <ProductForm
          product={selectedProduct}
          onSubmit={handleSubmit}
          onCancel={handleCloseModal}
          isLoading={createProduct.isPending || updateProduct.isPending}
        />
      </Modal>

      <Modal
        isOpen={!!deleteConfirmId}
        onClose={() => setDeleteConfirmId(null)}
        title={tCommon("messages.confirmDelete")}
        size="sm"
      >
        <p className="text-gray-600 dark:text-gray-400 mb-6">
          {t("deleteConfirmation")}
        </p>
        <div className="flex justify-end gap-3">
          <Button variant="secondary" onClick={() => setDeleteConfirmId(null)}>
            {tCommon("buttons.cancel")}
          </Button>
          <Button
            variant="danger"
            onClick={() => deleteConfirmId && handleDelete(deleteConfirmId)}
            isLoading={deleteProduct.isPending}
          >
            {tCommon("buttons.delete")}
          </Button>
        </div>
      </Modal>

      <Modal
        isOpen={!!supplierProductId}
        onClose={() => setSupplierProductId(null)}
        title={t("suppliers.title")}
        size="lg"
      >
        {supplierProductId && (
          <ProductSuppliers productId={supplierProductId} />
        )}
      </Modal>

      <BulkActionBar
        selectedCount={selection.selectedCount}
        onDelete={() => setBulkDeleteOpen(true)}
        onClear={selection.clear}
        isDeleting={batchDeleteProducts.isPending}
      />
      <BulkDeleteModal
        isOpen={bulkDeleteOpen}
        onClose={() => setBulkDeleteOpen(false)}
        onConfirm={async () => {
          if (isDemoMode) { showSubscribePrompt(); return; }
          await batchDeleteProducts.mutateAsync(Array.from(selection.selectedIds));
          selection.clear();
          setBulkDeleteOpen(false);
        }}
        count={selection.selectedCount}
        isLoading={batchDeleteProducts.isPending}
      />
    </div>
  );
}
