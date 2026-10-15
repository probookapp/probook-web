import { useEffect, useMemo, useRef, useState } from "react";
import { useForm, useWatch, useFieldArray, Controller } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { ArrowLeft, Plus, Trash2 } from "lucide-react";
import { toast } from "@/stores/useToastStore";
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Input,
  Textarea,
  Select,
  SearchableSelect,
  Modal,
} from "@/components/ui";
import { supplierApi, productApi, locationsApi } from "@/lib/api";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter, useParams } from "@/lib/navigation";
import { ProductForm, useCreateProduct } from "@/features/products";
import type { ProductFormData } from "@/features/products/schemas/productSchema";
import { useDemoMode } from "@/components/providers/DemoModeProvider";
import { useAuthStore } from "@/stores/useAuthStore";
import { useUnsavedChangesGuard } from "@/hooks/useUnsavedChangesGuard";
import { UnsavedChangesDialog } from "@/components/UnsavedChangesDialog";
import { isOfflineQueuedError } from "@/lib/offline-errors";
import { getApiErrorMessage } from "@/lib/api-adapter";
import { formatCurrency, formatDateISO, toDateInput } from "@/lib/utils";
import { usePurchase, useCreatePurchase, useUpdatePurchase } from "./hooks/usePurchases";
import type {
  Product,
  CreatePurchaseOrderLineInput,
} from "@/types";

interface PurchaseFormLine {
  product_id: string;
  variant_id: string;
  quantity: number;
  unit_price: number;
  previous_price: number | null;
  use_average_price: boolean;
  tax_rate: number;
}

interface PurchaseFormData {
  supplier_id: string;
  order_date: string;
  location_id: string;
  notes: string;
  lines: PurchaseFormLine[];
}

const EMPTY_LINE: PurchaseFormLine = {
  product_id: "",
  variant_id: "",
  quantity: 1,
  unit_price: 0,
  previous_price: null,
  use_average_price: false,
  tax_rate: 0,
};

/**
 * Creating and editing a purchase order, on a page of its own like the other
 * documents with lines. It used to be a dialog over the list: too narrow for a
 * product's full name, its add button out of reach above a long order, and one
 * stray click outside it threw the whole order away.
 */
export function PurchaseFormPage() {
  const { t } = useTranslation("purchases");
  const { t: tCommon } = useTranslation("common");
  const router = useRouter();
  const { id } = useParams<{ id: string }>();
  const isEdit = !!id;
  const { isDemoMode, showSubscribePrompt } = useDemoMode();

  const { data: existingOrder, isLoading: isLoadingOrder } = usePurchase(id || "");
  const createPurchase = useCreatePurchase();
  const updatePurchase = useUpdatePurchase();

  const { data: suppliers } = useQuery({
    queryKey: ["suppliers"],
    queryFn: supplierApi.getAll,
  });

  const { data: products } = useQuery({
    queryKey: ["products-with-details"],
    queryFn: productApi.getAllWithDetails,
  });

  // Receiving-location picker only appears for multi-location tenants; otherwise
  // received goods silently land at the tenant's default location.
  const { data: locations } = useQuery({
    queryKey: ["locations"],
    queryFn: locationsApi.getAll,
  });
  const showLocationPicker = (locations?.length ?? 0) >= 2;

  const supplierOptions = useMemo(
    () =>
      (suppliers ?? []).map((s) => ({
        value: s.id,
        label: s.name,
      })),
    [suppliers]
  );

  const productOptions = useMemo(
    () =>
      // A pack has no shelf of its own: its components are bought and moved instead.
      (products ?? []).filter((p) => !p.is_bundle).map((p) => ({
        value: p.id,
        label: `${p.designation}${p.reference ? ` (${p.reference})` : ""}`,
      })),
    [products]
  );

  const {
    register,
    handleSubmit,
    control,
    setValue,
    reset,
    formState: { errors, isDirty },
  } = useForm<PurchaseFormData>({
    defaultValues: {
      supplier_id: "",
      order_date: formatDateISO(new Date()),
      location_id: "",
      notes: "",
      lines: [EMPTY_LINE],
    },
  });

  const { fields, append, remove } = useFieldArray({
    control,
    name: "lines",
  });

  // useWatch, not watch(): it hands the memo below a new array whenever a line
  // changes, where watch() could give it the same one and leave totals stale.
  const watchedLines = useWatch({ control, name: "lines" });

  const submittedRef = useRef(false);
  const blocker = useUnsavedChangesGuard(() => isDirty && !submittedRef.current);

  // Seeded from an effect, once per order — the same reasons as the delivery
  // note form: reset() during render never reaches useFieldArray, and an
  // effect keyed on the order alone would overwrite the typing on a refetch.
  const [lastResetOrderId, setLastResetOrderId] = useState<string | null>(null);
  useEffect(() => {
    if (!existingOrder || !isEdit || existingOrder.id === lastResetOrderId) return;
    setLastResetOrderId(existingOrder.id);
    reset({
      supplier_id: existingOrder.supplier_id,
      order_date: toDateInput(existingOrder.order_date),
      location_id: existingOrder.location_id ?? "",
      notes: existingOrder.notes ?? "",
      lines: existingOrder.lines.map((l) => ({
        product_id: l.product_id,
        variant_id: l.variant_id ?? "",
        quantity: l.quantity,
        unit_price: l.unit_price,
        previous_price: l.previous_price,
        use_average_price: l.use_average_price,
        tax_rate: l.tax_rate,
      })),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per order, never again on a refetch
  }, [existingOrder, isEdit, lastResetOrderId]);

  // Only a pending order can be changed; an address typed for one that has
  // since been received lands on its page instead.
  useEffect(() => {
    if (isEdit && existingOrder && existingOrder.status !== "PENDING") {
      router.replace(`/purchases/${existingOrder.id}`);
    }
  }, [isEdit, existingOrder, router]);

  const lineSubtotals = useMemo(
    () =>
      watchedLines.map((line) => {
        const qty = Number(line.quantity) || 0;
        const price = Number(line.unit_price) || 0;
        const taxRate = Number(line.tax_rate) || 0;
        const subtotal = qty * price;
        const tax = subtotal * (taxRate / 100);
        return { subtotal, tax, total: subtotal + tax };
      }),
    [watchedLines]
  );

  const orderTotal = useMemo(
    () => lineSubtotals.reduce((sum, l) => sum + l.total, 0),
    [lineSubtotals]
  );

  const orderSubtotal = useMemo(
    () => lineSubtotals.reduce((sum, l) => sum + l.subtotal, 0),
    [lineSubtotals]
  );

  const orderTax = useMemo(
    () => lineSubtotals.reduce((sum, l) => sum + l.tax, 0),
    [lineSubtotals]
  );

  const fillLineFromProduct = (index: number, product: Product) => {
    const purchasePrice = product.purchase_price ?? 0;
    setValue(`lines.${index}.unit_price`, purchasePrice);
    setValue(`lines.${index}.previous_price`, purchasePrice);
    setValue(`lines.${index}.tax_rate`, product.tax_rate ?? 0);
    setValue(`lines.${index}.use_average_price`, false);
  };

  // When product is selected, fill in default price
  const handleProductChange = (index: number, productId: string) => {
    setValue(`lines.${index}.product_id`, productId, { shouldDirty: true });
    setValue(`lines.${index}.variant_id`, "");
    const product = productId ? products?.find((p) => p.id === productId) : undefined;
    if (product) fillLineFromProduct(index, product);
  };

  // New goods usually arrive with the supplier before they exist in the
  // catalogue: create the product without leaving the order, on the line that
  // asked for it.
  const queryClient = useQueryClient();
  const canCreateProduct = useAuthStore((s) => s.hasPermission("products", "create"));
  const createProduct = useCreateProduct();
  const [newProductLine, setNewProductLine] = useState<number | null>(null);

  const openNewProduct = (index: number) => {
    if (isDemoMode) { showSubscribePrompt(); return; }
    setNewProductLine(index);
  };

  const handleCreateProduct = async (data: ProductFormData) => {
    if (newProductLine === null) return;
    const index = newProductLine;
    try {
      const created = await createProduct.mutateAsync({
        ...data,
        description: data.description || null,
        reference: data.reference || null,
        category_id: data.category_id || null,
        quantity: 0,
        has_variants: false,
      });
      // Into the picker now, not after the refetch: the line shows its product
      // the moment the dialog closes.
      queryClient.setQueryData<Product[]>(["products-with-details"], (old) =>
        old ? [created, ...old.filter((p) => p.id !== created.id)] : [created]
      );
      queryClient.invalidateQueries({ queryKey: ["products-with-details"] });
      setValue(`lines.${index}.product_id`, created.id, { shouldValidate: true, shouldDirty: true });
      setValue(`lines.${index}.variant_id`, "");
      fillLineFromProduct(index, created);
      setNewProductLine(null);
    } catch (err) {
      // A queued product has no id yet, so no line can point at it.
      toast.error(
        isOfflineQueuedError(err)
          ? t("newProduct.offline")
          : getApiErrorMessage(err, tCommon("messages.error"))
      );
    }
  };

  const getVariantOptions = (productId: string) => {
    if (!productId || !products) return [];
    const product = products.find((p) => p.id === productId);
    if (!product?.has_variants || !product.variants) return [];
    return product.variants.map((v) => ({
      value: v.id,
      label: v.name,
    }));
  };

  const handleFormSubmit = async (data: PurchaseFormData) => {
    if (isDemoMode) { showSubscribePrompt(); return; }
    const lines: CreatePurchaseOrderLineInput[] = data.lines
      .filter((l) => l.product_id)
      .map((l) => ({
        product_id: l.product_id,
        variant_id: l.variant_id || null,
        quantity: Number(l.quantity),
        unit_price: Number(l.unit_price),
        previous_price: l.previous_price,
        use_average_price: l.use_average_price,
        tax_rate: Number(l.tax_rate),
      }));

    if (lines.length === 0) {
      toast.error(t("validation.atLeastOneLine"));
      return;
    }

    const input = {
      supplier_id: data.supplier_id,
      order_date: data.order_date,
      location_id: showLocationPicker ? data.location_id || null : null,
      notes: data.notes || null,
      lines,
    };

    try {
      if (isEdit && id) {
        await updatePurchase.mutateAsync({ ...input, id });
        submittedRef.current = true;
        router.push(`/purchases/${id}`);
      } else {
        const created = await createPurchase.mutateAsync(input);
        submittedRef.current = true;
        router.push(`/purchases/${created.id}`);
      }
    } catch (err) {
      // Saved to the offline queue: back to the list — the order has no
      // server id yet, so it has no page. Any other failure was toasted by the
      // mutation and leaves the form as typed.
      if (!isOfflineQueuedError(err)) return;
      toast.info(tCommon("offline.saved_offline"));
      submittedRef.current = true;
      router.push("/purchases");
    }
  };

  if (isEdit && isLoadingOrder) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => router.push(isEdit && id ? `/purchases/${id}` : "/purchases")}
        >
          <ArrowLeft className="h-4 w-4 me-2" />
          {tCommon("buttons.back")}
        </Button>
        <div>
          <h1 className="text-2xl font-bold text-(--color-text-primary)">
            {isEdit ? t("editPurchase") : t("newPurchase")}
          </h1>
          {isEdit && existingOrder && (
            <p className="text-(--color-text-secondary)">{existingOrder.order_number}</p>
          )}
        </div>
      </div>

      <form onSubmit={handleSubmit(handleFormSubmit)} className="space-y-6">
        {/* Header fields */}
        <Card>
          <CardContent className="pt-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Controller
                control={control}
                name="supplier_id"
                rules={{ required: t("validation.supplierRequired") }}
                render={({ field }) => (
                  <SearchableSelect
                    label={t("fields.supplier") + " *"}
                    options={supplierOptions}
                    value={field.value}
                    onChange={field.onChange}
                    placeholder={t("fields.selectSupplier")}
                    error={errors.supplier_id?.message}
                  />
                )}
              />

              <Input
                label={t("fields.orderDate") + " *"}
                type="date"
                autoComplete="off"
                {...register("order_date", {
                  required: t("validation.dateRequired"),
                })}
                error={errors.order_date?.message}
              />

              {showLocationPicker && (
                <Controller
                  control={control}
                  name="location_id"
                  render={({ field }) => (
                    <Select
                      label={t("fields.receivingLocation")}
                      value={field.value}
                      onChange={field.onChange}
                      options={[
                        { value: "", label: t("fields.defaultLocation") },
                        ...(locations ?? []).map((l) => ({ value: l.id, label: l.name })),
                      ]}
                    />
                  )}
                />
              )}
            </div>
          </CardContent>
        </Card>

        {/* Lines */}
        <Card>
          <CardHeader>
            <CardTitle>{t("fields.lines")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {fields.map((field, index) => {
              const watchedLine = watchedLines[index];
              const variantOptions = getVariantOptions(watchedLine?.product_id);
              const hasVariants = variantOptions.length > 0;
              const previousPrice = watchedLine?.previous_price;
              const currentPrice = Number(watchedLine?.unit_price) || 0;
              const priceChanged =
                previousPrice !== null &&
                previousPrice !== undefined &&
                currentPrice !== previousPrice;

              return (
                <div
                  key={field.id}
                  className="p-4 border border-(--color-border-primary) rounded-lg bg-(--color-bg-secondary) space-y-3"
                >
                  <div className="flex items-start gap-2">
                    {/* From lg the product and its figures share one row; the
                        product keeps whatever width is left, which on a page
                        is enough for a full designation. */}
                    <div className="flex-1 min-w-0 grid grid-cols-3 lg:grid-cols-[minmax(0,1fr)_6rem_9rem_6rem] gap-3">
                      <div className="col-span-3 lg:col-span-1 min-w-0 space-y-2">
                        <Controller
                          control={control}
                          name={`lines.${index}.product_id`}
                          rules={{ required: t("validation.productRequired") }}
                          render={({ field: selectField }) => (
                            <SearchableSelect
                              label={t("fields.product") + " *"}
                              options={productOptions}
                              value={selectField.value}
                              onChange={(val) => handleProductChange(index, val)}
                              placeholder={t("fields.selectProduct")}
                              error={errors.lines?.[index]?.product_id?.message}
                            />
                          )}
                        />
                        {hasVariants && (
                          <Controller
                            control={control}
                            name={`lines.${index}.variant_id`}
                            rules={{ required: t("validation.productRequired") }}
                            render={({ field: variantField }) => (
                              <SearchableSelect
                                label={t("fields.variant") + " *"}
                                options={variantOptions}
                                value={variantField.value}
                                onChange={variantField.onChange}
                                placeholder={t("fields.selectVariant")}
                              />
                            )}
                          />
                        )}
                        {canCreateProduct && (
                          <button
                            type="button"
                            onClick={() => openNewProduct(index)}
                            className="inline-flex items-center gap-1 min-h-9 text-sm font-medium text-primary-600 hover:text-primary-700 dark:text-primary-400 dark:hover:text-primary-300"
                          >
                            <Plus className="h-4 w-4" />
                            {t("newProduct.button")}
                          </button>
                        )}
                      </div>

                      <Input
                        label={t("fields.quantity") + " *"}
                        type="number"
                        min="1"
                        step="1"
                        autoComplete="off"
                        {...register(`lines.${index}.quantity`, {
                          required: t("validation.quantityRequired"),
                          min: { value: 1, message: t("validation.quantityMin") },
                          valueAsNumber: true,
                        })}
                        error={errors.lines?.[index]?.quantity?.message}
                      />

                      <div>
                        <Input
                          label={t("fields.unitPrice") + " *"}
                          type="number"
                          min="0"
                          step="0.01"
                          autoComplete="off"
                          {...register(`lines.${index}.unit_price`, {
                            required: t("validation.priceRequired"),
                            min: { value: 0, message: t("validation.priceMin") },
                            valueAsNumber: true,
                          })}
                          error={errors.lines?.[index]?.unit_price?.message}
                        />
                        {previousPrice !== null &&
                          previousPrice !== undefined && (
                            <p className="mt-1 text-xs text-(--color-text-secondary)">
                              {t("fields.previousPrice")}:{" "}
                              {formatCurrency(previousPrice)}
                            </p>
                          )}
                      </div>

                      <Input
                        label={t("fields.taxRate")}
                        type="number"
                        min="0"
                        max="100"
                        step="0.01"
                        autoComplete="off"
                        {...register(`lines.${index}.tax_rate`, {
                          valueAsNumber: true,
                        })}
                        error={errors.lines?.[index]?.tax_rate?.message}
                      />
                    </div>

                    {fields.length > 1 && (
                      <button
                        type="button"
                        onClick={() => remove(index)}
                        aria-label={tCommon("buttons.delete")}
                        title={tCommon("buttons.delete")}
                        className="mt-6 -me-2 rounded-lg p-2 text-red-500 hover:bg-red-50 hover:text-red-700 dark:text-red-400 dark:hover:bg-red-900/20"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-2">
                    {priceChanged ? (
                      <label className="flex items-center gap-2 text-sm text-(--color-text-secondary)">
                        <input
                          type="checkbox"
                          {...register(`lines.${index}.use_average_price`)}
                          className="h-4 w-4 text-primary-600 border-gray-300 rounded focus:ring-primary-500"
                        />
                        {t("fields.useAveragePrice")}
                      </label>
                    ) : (
                      <span />
                    )}
                    <div className="text-sm text-(--color-text-secondary)">
                      {t("fields.lineTotal")}:{" "}
                      <span className="font-medium text-(--color-text-primary) tabular-nums">
                        {formatCurrency(lineSubtotals[index]?.total ?? 0)}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}

            {/* Under the last line, not above the first: on a long order the
                button stays where the eye already is. */}
            <Button
              type="button"
              variant="secondary"
              className="w-full"
              onClick={() => append(EMPTY_LINE)}
            >
              <Plus className="h-4 w-4 me-1" />
              {t("fields.addLine")}
            </Button>

            {/* Totals */}
            <div className="border-t border-(--color-border-primary) pt-4 space-y-1 text-sm sm:ms-auto sm:max-w-xs">
              <div className="flex justify-between text-(--color-text-secondary)">
                <span>{t("fields.subtotal")}</span>
                <span className="tabular-nums">{formatCurrency(orderSubtotal)}</span>
              </div>
              <div className="flex justify-between text-(--color-text-secondary)">
                <span>{t("fields.tax")}</span>
                <span className="tabular-nums">{formatCurrency(orderTax)}</span>
              </div>
              <div className="flex justify-between font-medium text-(--color-text-primary) text-base">
                <span>{t("fields.total")}</span>
                <span className="tabular-nums">{formatCurrency(orderTotal)}</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Notes */}
        <Card>
          <CardHeader>
            <CardTitle>{t("fields.notes")}</CardTitle>
          </CardHeader>
          <CardContent>
            <Textarea autoComplete="off" rows={3} {...register("notes")} />
          </CardContent>
        </Card>

        {/* Actions */}
        {/* On a phone the save button is several screens below the lines; it
            stays in reach at the bottom instead. */}
        <div className="sticky bottom-0 z-20 -mx-4 flex gap-3 border-t border-gray-200 bg-gray-100 px-4 py-3 dark:border-gray-800 dark:bg-gray-900 sm:static sm:mx-0 sm:justify-end sm:border-0 sm:bg-transparent sm:p-0 dark:sm:bg-transparent">
          <Button
            type="button"
            variant="secondary"
            onClick={() => router.push(isEdit && id ? `/purchases/${id}` : "/purchases")}
            className="flex-1 sm:flex-none"
          >
            {tCommon("buttons.cancel")}
          </Button>
          <Button
            type="submit"
            isLoading={createPurchase.isPending || updatePurchase.isPending}
            className="flex-1 sm:flex-none"
          >
            {isEdit ? tCommon("buttons.save") : tCommon("buttons.create")}
          </Button>
        </div>
      </form>

      <UnsavedChangesDialog isBlocked={blocker.isBlocked} onProceed={blocker.proceed} onReset={blocker.reset} />

      {/* Outside the form: creating the product must not submit the order. */}
      <Modal
        isOpen={newProductLine !== null}
        onClose={() => setNewProductLine(null)}
        title={t("newProduct.title")}
        size="lg"
      >
        {newProductLine !== null && (
          <ProductForm
            fromPurchase
            onSubmit={handleCreateProduct}
            onCancel={() => setNewProductLine(null)}
            isLoading={createProduct.isPending}
          />
        )}
      </Modal>
    </div>
  );
}
