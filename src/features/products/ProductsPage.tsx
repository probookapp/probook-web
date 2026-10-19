import { useState, useMemo, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Plus, Pencil, Trash2, Search, Package, Briefcase, Tags, Upload, Folder, Truck, Download, SlidersHorizontal, History, AlertTriangle, MapPin, Boxes } from "lucide-react";
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
  TableNumericCell,
  Input,
  Badge,
  PageHeader,
  RowActions,
  ListCard,
  type RowAction,
  ColumnPicker,
} from "@/components/ui";
import { BulkActionBar } from "@/components/shared/BulkActionBar";
import { BulkDeleteModal } from "@/components/shared/BulkDeleteModal";
import { LoadMoreSentinel } from "@/components/shared/LoadMoreSentinel";
import { useSelection } from "@/hooks/useSelection";
import { useTableColumns } from "@/hooks/useTableColumns";
import { ProductForm } from "./components/ProductForm";
import { ProductSuppliers } from "./components/ProductSuppliers";
import { CategoryManager } from "./components/CategoryManager";
import { AdjustStockModal } from "./components/AdjustStockModal";
import { StockMovementsModal } from "./components/StockMovementsModal";
import { StockByLocationModal } from "./components/StockByLocationModal";
import { useLowStock } from "./hooks/useStock";
import { ImportDialog } from "@/components/shared/ImportDialog";
import { exportToCsv } from "@/lib/csv-export";
import {
  useInfiniteProducts,
  useProduct,
  useCreateProduct,
  useUpdateProduct,
  useDeleteProduct,
  useBatchDeleteProducts,
} from "./hooks/useProducts";
import { useProductCategories } from "./hooks/useProductCategories";
import { formatCurrency } from "@/lib/utils";
import { toast } from "@/stores/useToastStore";
import { isApiError } from "@/lib/api-adapter";
import { isOfflineQueuedError } from "@/lib/offline-errors";
import { apiErrorCode, getApiErrorMessage } from "@/lib/api-adapter";
import { productSupplierApi, locationsApi, productBundleApi } from "@/lib/api";
import { useAuthStore } from "@/stores/useAuthStore";
import type { Product } from "@/types";
import { productOnHand } from "@/lib/product-stock";
import type { ProductFormData } from "./schemas/productSchema";

type TabType = "products" | "categories";


export function ProductsPage() {
  const { t } = useTranslation("products");
  const { t: tCommon } = useTranslation("common");
  const canCreate = useAuthStore((s) => s.hasPermission("products", "create"));
  const canEdit = useAuthStore((s) => s.hasPermission("products", "edit"));
  const canDelete = useAuthStore((s) => s.hasPermission("products", "delete"));
  const [activeTab, setActiveTab] = useState<TabType>("products");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<Product | undefined>();
  const [searchQuery, setSearchQuery] = useState("");
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [categoryFilter, setCategoryFilter] = useState<string>("");
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [supplierProductId, setSupplierProductId] = useState<string | null>(null);
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [adjustStockProduct, setAdjustStockProduct] = useState<Product | null>(null);
  const [movementsProduct, setMovementsProduct] = useState<Product | null>(null);
  const [stockLocationsProduct, setStockLocationsProduct] = useState<Product | null>(null);
  const [showLowStock, setShowLowStock] = useState(false);

  const { isDemoMode, showSubscribePrompt } = useDemoMode();
  const {
    data: productPages,
    isLoading,
    hasNextPage,
    isFetchingNextPage,
    fetchNextPage,
  } = useInfiniteProducts();
  const products = useMemo(
    () => productPages?.pages.flatMap((page) => page.data),
    [productPages]
  );
  // The paginated list is lean (no prices/variants), so the edit form fetches
  // the full product by id. Demo mode never opens the edit modal.
  const { data: editingProductFull } = useProduct(selectedProduct?.id ?? "");
  const { data: lowStock } = useLowStock();
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

  const { data: locations } = useQuery({
    queryKey: ["locations", { demo: isDemoMode }],
    queryFn: isDemoMode ? () => [] : locationsApi.getAll,
    staleTime: isDemoMode ? Infinity : undefined,
  });
  // Per-location stock UI stays hidden unless the tenant has 2+ locations.
  const multiLocation = (locations?.length ?? 0) >= 2;

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

  const columns = useTableColumns(
    "products",
    [
      { key: "select", label: "", hideable: false },
      { key: "type", label: t("fields.type") },
      { key: "reference", label: t("fields.reference"), isEmpty: (p) => !p.reference },
      { key: "designation", label: t("fields.designation"), hideable: false },
      { key: "category", label: t("fields.category"), isEmpty: (p) => !getCategoryName(p.category_id) },
      { key: "suppliers", label: t("fields.suppliers"), isEmpty: (p) => !suppliersByProduct[p.id]?.length },
      { key: "purchasePrice", label: t("fields.purchasePriceHt"), isEmpty: (p) => p.purchase_price == null },
      { key: "price", label: t("fields.priceHT") },
      { key: "quantity", label: t("fields.quantity") },
      { key: "actions", label: "", hideable: false },
    ],
    filteredProducts
  );

  const handleExportCsv = () => {
    exportToCsv(
      filteredProducts ?? [],
      [
        { header: t("fields.designation"), accessor: (p) => p.designation },
        { header: t("fields.reference"), accessor: (p) => p.reference },
        { header: t("fields.barcode"), accessor: (p) => p.barcode },
        { header: t("fields.category"), accessor: (p) => getCategoryName(p.category_id) },
        { header: t("fields.priceHT"), accessor: (p) => p.unit_price },
        { header: t("fields.purchasePriceHt"), accessor: (p) => p.purchase_price },
        { header: t("fields.quantity"), accessor: (p) => p.quantity },
      ],
      `products_${new Date().toISOString().split("T")[0]}.csv`
    );
  };

  const handleOpenModal = (product?: Product) => {
    if (isDemoMode) { showSubscribePrompt(); return; }
    setSelectedProduct(product);
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setSelectedProduct(undefined);
    setIsModalOpen(false);
  };

  const handleAdjustStock = (product: Product) => {
    if (isDemoMode) { showSubscribePrompt(); return; }
    setAdjustStockProduct(product);
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

    const { is_bundle: makePack, ...fields } = input;
    try {
      if (selectedProduct) {
        await updateProduct.mutateAsync({ ...fields, id: selectedProduct.id });
      } else {
        const created = await createProduct.mutateAsync(fields);
        if (makePack) {
          // The pack exists; what it is made of is set on its form, which
          // reopens on it straight away.
          await productBundleApi.set(created.id, []);
          setSelectedProduct({ ...created, is_bundle: true });
          toast.success(t("bundle.created"));
          return;
        }
      }
    } catch (err) {
      // Saved to the offline queue: treat as success, it syncs later.
      if (!isOfflineQueuedError(err)) {
        toast.error(getApiErrorMessage(err, tCommon("messages.error")));
        return;
      }
      toast.info(tCommon("offline.saved_offline"));
    }
    handleCloseModal();
  };

  const handleDelete = async (id: string) => {
    if (isDemoMode) { showSubscribePrompt(); return; }
    try {
      await deleteProduct.mutateAsync(id);
      setDeleteConfirmId(null);
    } catch (err) {
      toast.error(
        apiErrorCode(err) === "PRODUCT_IN_BUNDLE"
          ? t("bundle.errors.PRODUCT_IN_BUNDLE")
          : isApiError(err, 409)
            ? t("messages.deleteBlocked")
            : t("messages.deleteError")
      );
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600" />
      </div>
    );
  }

  /** The row's actions, shared by the table row and the phone card. */
  const productActions = (product: Product): RowAction[] => [
    {
      key: "edit",
      label: tCommon("buttons.edit"),
      icon: Pencil,
      onSelect: () => handleOpenModal(product),
      primary: true,
      hidden: !canEdit,
    },
    {
      key: "adjustStock",
      label: t("adjustStock.title"),
      icon: SlidersHorizontal,
      onSelect: () => handleAdjustStock(product),
      hidden: !canEdit || product.is_service || product.is_bundle,
    },
    {
      key: "movements",
      label: t("movements.title"),
      icon: History,
      onSelect: () => setMovementsProduct(product),
      hidden: product.is_service || product.is_bundle,
    },
    {
      key: "stockLocations",
      label: t("stockLocations.title"),
      icon: MapPin,
      onSelect: () => setStockLocationsProduct(product),
      hidden: !multiLocation || product.is_service || product.is_bundle,
    },
    {
      key: "suppliers",
      label: t("fields.suppliers"),
      icon: Truck,
      onSelect: () => setSupplierProductId(product.id),
      hidden: product.is_bundle,
    },
    {
      key: "delete",
      label: tCommon("buttons.delete"),
      icon: Trash2,
      onSelect: () => setDeleteConfirmId(product.id),
      danger: true,
      hidden: !canDelete,
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("title")}
        subtitle={t("subtitle")}
        secondaryActions={[
          {
            key: "export",
            label: tCommon("buttons.exportCsv"),
            icon: Download,
            onSelect: handleExportCsv,
            disabled: !filteredProducts?.length,
            hidden: activeTab !== "products",
          },
          {
            key: "import",
            label: tCommon("buttons.import"),
            icon: Upload,
            onSelect: () => (isDemoMode ? showSubscribePrompt() : setIsImportOpen(true)),
            hidden: activeTab !== "products",
          },
        ]}
        primaryAction={
          activeTab === "products" && canCreate
            ? { label: t("newProduct"), icon: Plus, onClick: () => handleOpenModal() }
            : undefined
        }
      />

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
        <>
        {lowStock && lowStock.length > 0 && (
          <div className="rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20">
            <button
              onClick={() => setShowLowStock((v) => !v)}
              className="w-full flex items-center gap-2 px-4 py-3 text-start"
            >
              <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0" />
              <span className="text-sm font-medium text-amber-800 dark:text-amber-300">
                {t("lowStock.banner", { count: lowStock.length })}
              </span>
              <span className="ms-auto text-xs text-amber-700 dark:text-amber-400">
                {showLowStock ? t("lowStock.hide") : t("lowStock.show")}
              </span>
            </button>
            {showLowStock && (
              <div className="border-t border-amber-200 dark:border-amber-800 divide-y divide-amber-200/60 dark:divide-amber-800/60">
                {lowStock.map((item) => (
                  <div
                    key={`${item.product_id}-${item.variant_id ?? "root"}`}
                    className="flex items-center justify-between px-4 py-2 text-sm"
                  >
                    <span className="text-gray-800 dark:text-gray-200 truncate">
                      {item.designation}
                      {item.variant_name ? ` — ${item.variant_name}` : ""}
                    </span>
                    <Badge variant={item.quantity > 0 ? "warning" : "danger"}>
                      {t("fields.quantity")}: {item.quantity}
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
        <Card>
          <CardHeader>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <CardTitle>{t("productList")}</CardTitle>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
                <ColumnPicker columns={columns} />
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
                  <Search className="absolute start-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <Input
                    id="product-search"
                    name="product-search"
                    placeholder={t("searchPlaceholder")}
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    autoComplete="off"
                    className="ps-9"
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
                  <ListCard
                    key={product.id}
                    onActivate={canEdit ? () => handleOpenModal(product) : undefined}
                    leading={
                      <label className="-mx-3 -mb-3 -mt-2 p-3 shrink-0 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={selection.isSelected(product.id)}
                          onChange={() => selection.toggle(product.id)}
                          className="block h-4 w-4 text-primary-600 border-gray-300 rounded focus:ring-primary-500"
                        />
                      </label>
                    }
                    title={product.designation}
                    badge={
                      product.is_bundle ? (
                        product.quantity !== null && (
                          <Badge variant={(product.quantity ?? 0) > 0 ? "success" : "danger"} title={t("bundle.availableHint")}>
                            {t("bundle.available")}: {product.quantity}
                          </Badge>
                        )
                      ) : !product.is_service ? (
                        <Badge variant={(productOnHand(product) ?? 0) > 0 ? "success" : "danger"}>
                          {t("fields.quantity")}: {(productOnHand(product) ?? 0)}
                        </Badge>
                      ) : undefined
                    }
                    meta={
                      <span className="inline-flex flex-wrap items-center gap-x-2">
                        {/* A plain product is the default: only packs and services say what they are. */}
                        {product.is_bundle ? (
                          <span className="inline-flex items-center gap-1"><Boxes className="h-3 w-3" />{t("types.bundle")}</span>
                        ) : product.is_service ? (
                          <span className="inline-flex items-center gap-1"><Briefcase className="h-3 w-3" />{t("types.service")}</span>
                        ) : null}
                        {product.reference && <span className="font-mono">{product.reference}</span>}
                        {getCategoryName(product.category_id) && (
                          <span className="inline-flex items-center gap-1"><Folder className="h-3 w-3" />{getCategoryName(product.category_id)}</span>
                        )}
                      </span>
                    }
                    amount={formatCurrency(product.unit_price)}
                    actions={<RowActions actions={productActions(product)} />}
                  />
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
                    <label className="-m-3 p-3 inline-flex align-middle cursor-pointer">
                      <input type="checkbox" checked={selection.isAllSelected} ref={(el) => { if (el) el.indeterminate = selection.isIndeterminate; }} onChange={() => selection.toggleAll()} className="h-4 w-4 text-primary-600 border-gray-300 rounded focus:ring-primary-500" />
                    </label>
                  </TableHead>
                  {columns.show("type") && <TableHead>{t("fields.type")}</TableHead>}
                  {columns.show("reference") && <TableHead>{t("fields.reference")}</TableHead>}
                  <TableHead>{t("fields.designation")}</TableHead>
                  {columns.show("category") && <TableHead>{t("fields.category")}</TableHead>}
                  {columns.show("suppliers") && <TableHead>{t("fields.suppliers")}</TableHead>}
                  {columns.show("purchasePrice") && <TableHead className="text-end">{t("fields.purchasePriceHt")}</TableHead>}
                  {columns.show("price") && <TableHead className="text-end">{t("fields.priceHT")}</TableHead>}
                  {/* "Stock", not "Quantity": what is on the shelf, and short enough not to size the column. */}{columns.show("quantity") && <TableHead>{t("fields.stockColumn")}</TableHead>}
                  <TableHead className="w-px text-end">{/* Icons only below: the word would size the column. */}<span className="sr-only">{tCommon("buttons.actions")}</span></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredProducts && filteredProducts.length > 0 ? (
                  filteredProducts.map((product) => (
                    <TableRow key={product.id} onActivate={canEdit ? () => handleOpenModal(product) : undefined}>
                      <TableCell>
                        <label className="-m-3 p-3 inline-flex align-middle cursor-pointer">
                          <input type="checkbox" checked={selection.isSelected(product.id)} onChange={() => selection.toggle(product.id)} className="h-4 w-4 text-primary-600 border-gray-300 rounded focus:ring-primary-500" />
                        </label>
                      </TableCell>
                      {columns.show("type") && (
                        <TableCell>
                          {/* The icon alone, named for screen readers and on hover: with
                              the label the column took a hundred pixels, enough to
                              push the table past a 1280 px laptop screen. */}
                          {product.is_bundle ? (
                            <Badge variant="warning" title={t("types.bundle")}>
                              <Boxes className="h-3.5 w-3.5" aria-hidden />
                              <span className="sr-only">{t("types.bundle")}</span>
                            </Badge>
                          ) : product.is_service ? (
                            <Badge variant="info" title={t("types.service")}>
                              <Briefcase className="h-3.5 w-3.5" aria-hidden />
                              <span className="sr-only">{t("types.service")}</span>
                            </Badge>
                          ) : (
                            <Badge variant="default" title={t("types.product")}>
                              <Package className="h-3.5 w-3.5" aria-hidden />
                              <span className="sr-only">{t("types.product")}</span>
                            </Badge>
                          )}
                        </TableCell>
                      )}
                      {columns.show("reference") && (
                        <TableCell className="font-mono text-sm text-gray-600 dark:text-gray-400">
                          {/* Free to wrap: a reference only breaks at its hyphens, never mid-segment. */}
                          {product.reference || "-"}
                        </TableCell>
                      )}
                      {/* A floor under the name: the figures are nowrap, so without one the
                          designation was the column that gave way, a word per line. */}
                      <TableCell className="min-w-32 font-medium text-gray-900 dark:text-gray-100">{product.designation}</TableCell>
                      {columns.show("category") && (
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
                      )}
                      {columns.show("suppliers") && (
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
                      )}
                      {columns.show("purchasePrice") && (
                        <TableNumericCell className="text-gray-600 dark:text-gray-400">
                          {product.purchase_price != null ? formatCurrency(product.purchase_price) : "-"}
                        </TableNumericCell>
                      )}
                      {columns.show("price") && <TableNumericCell className="text-gray-600 dark:text-gray-400">{formatCurrency(product.unit_price)}</TableNumericCell>}
                      {columns.show("quantity") && (
                      <TableCell>
                        {product.is_bundle ? (
                          // What its components can make up; a pack of services only has no limit.
                          product.quantity === null ? (
                            <span className="text-gray-400 dark:text-gray-500">-</span>
                          ) : (
                            <Badge variant={(product.quantity ?? 0) > 0 ? "success" : "danger"} title={t("bundle.availableHint")}>
                              {product.quantity}
                            </Badge>
                          )
                        ) : product.is_service ? (
                          <span className="text-gray-400 dark:text-gray-500">-</span>
                        ) : (
                          <div className="flex items-center gap-1.5">
                            <Badge variant={(productOnHand(product) ?? 0) > 0 ? "success" : "danger"}>
                              {(productOnHand(product) ?? 0)}
                            </Badge>
                            {multiLocation && (
                              <button
                                onClick={() => setStockLocationsProduct(product)}
                                aria-label={t("stockLocations.title")}
                                title={t("stockLocations.title")}
                                className="-my-2 p-3 lg:p-1.5 rounded-md text-gray-400 hover:text-primary-600 dark:hover:text-primary-400 transition-colors"
                              >
                                <MapPin className="h-4 w-4" />
                              </button>
                            )}
                          </div>
                        )}
                      </TableCell>
                      )}
                      <TableCell>
                        <RowActions actions={productActions(product)} />
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={columns.visibleCount} className="text-center text-gray-500 dark:text-gray-400 py-8">
                      {t("noProducts")}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
            </div>
            <LoadMoreSentinel
              hasNextPage={!!hasNextPage}
              isFetchingNextPage={isFetchingNextPage}
              fetchNextPage={fetchNextPage}
              loadedCount={products?.length ?? 0}
            />
          </CardContent>
        </Card>
        </>
      )}

      <ImportDialog
        isOpen={isImportOpen}
        onClose={() => setIsImportOpen(false)}
        title={tCommon("import.title", { entity: t("title") })}
        entityType="products"
      />

      <Modal
        isOpen={isModalOpen}
        onClose={handleCloseModal}
        title={selectedProduct ? t("editProduct") : t("newProduct")}
        size="lg"
      >
        {selectedProduct && !editingProductFull ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600" />
          </div>
        ) : (
          <ProductForm
            key={editingProductFull?.id ?? "new"}
            product={selectedProduct ? editingProductFull : undefined}
            onSubmit={handleSubmit}
            onCancel={handleCloseModal}
            isLoading={createProduct.isPending || updateProduct.isPending}
          />
        )}
      </Modal>

      <Modal
        isOpen={!!deleteConfirmId}
        onClose={() => setDeleteConfirmId(null)}
        title={tCommon("messages.confirmDelete")}
        size="sm"
      >
        <p className="text-gray-600 dark:text-gray-400 mb-6 wrap-anywhere">
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

      <AdjustStockModal
        key={adjustStockProduct?.id ?? "none"}
        isOpen={!!adjustStockProduct}
        onClose={() => setAdjustStockProduct(null)}
        product={adjustStockProduct}
      />

      <StockMovementsModal
        isOpen={!!movementsProduct}
        onClose={() => setMovementsProduct(null)}
        product={movementsProduct}
      />

      <StockByLocationModal
        isOpen={!!stockLocationsProduct}
        onClose={() => setStockLocationsProduct(null)}
        product={stockLocationsProduct}
      />

      {canDelete && (
        <BulkActionBar
          selectedCount={selection.selectedCount}
          onDelete={() => setBulkDeleteOpen(true)}
          onClear={selection.clear}
          isDeleting={batchDeleteProducts.isPending}
        />
      )}
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
