import { useEffect, useMemo } from "react";
import { useForm, useFieldArray, Controller } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { Plus, Trash2 } from "lucide-react";
import {
  Button,
  Input,
  Textarea,
  SearchableSelect,
} from "@/components/ui";
import { supplierApi, productApi } from "@/lib/api";
import { useQuery } from "@tanstack/react-query";
import { formatCurrency, formatDateISO } from "@/lib/utils";
import type {
  PurchaseOrder,
  CreatePurchaseOrderInput,
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
  notes: string;
  lines: PurchaseFormLine[];
}

interface PurchaseFormProps {
  purchase?: PurchaseOrder;
  onSubmit: (input: CreatePurchaseOrderInput) => void;
  onCancel: () => void;
  isLoading?: boolean;
}

export function PurchaseForm({ purchase, onSubmit, onCancel, isLoading }: PurchaseFormProps) {
  const { t } = useTranslation("purchases");
  const { t: tCommon } = useTranslation("common");

  const { data: suppliers } = useQuery({
    queryKey: ["suppliers"],
    queryFn: supplierApi.getAll,
  });

  const { data: products } = useQuery({
    queryKey: ["products-with-details"],
    queryFn: productApi.getAllWithDetails,
  });

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
      (products ?? []).map((p) => ({
        value: p.id,
        label: `${p.designation}${p.reference ? ` (${p.reference})` : ""}`,
      })),
    [products]
  );

  const {
    register,
    handleSubmit,
    control,
    watch,
    setValue,
    formState: { errors },
  } = useForm<PurchaseFormData>({
    defaultValues: {
      supplier_id: purchase?.supplier_id ?? "",
      order_date: purchase?.order_date
        ? purchase.order_date.split("T")[0]
        : formatDateISO(new Date()),
      notes: purchase?.notes ?? "",
      lines: purchase?.lines?.map((l) => ({
        product_id: l.product_id,
        variant_id: l.variant_id ?? "",
        quantity: l.quantity,
        unit_price: l.unit_price,
        previous_price: l.previous_price,
        use_average_price: l.use_average_price,
        tax_rate: l.tax_rate,
      })) ?? [
        {
          product_id: "",
          variant_id: "",
          quantity: 1,
          unit_price: 0,
          previous_price: null,
          use_average_price: false,
          tax_rate: 0,
        },
      ],
    },
  });

  const { fields, append, remove } = useFieldArray({
    control,
    name: "lines",
  });

  const watchedLines = watch("lines");

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

  // When product is selected, fill in default price
  const handleProductChange = (index: number, productId: string) => {
    setValue(`lines.${index}.product_id`, productId);
    setValue(`lines.${index}.variant_id`, "");
    if (productId && products) {
      const product = products.find((p) => p.id === productId);
      if (product) {
        const purchasePrice = product.purchase_price ?? 0;
        setValue(`lines.${index}.unit_price`, purchasePrice);
        setValue(`lines.${index}.previous_price`, purchasePrice);
        setValue(`lines.${index}.tax_rate`, product.tax_rate ?? 0);
        setValue(`lines.${index}.use_average_price`, false);
      }
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

  const handleFormSubmit = (data: PurchaseFormData) => {
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

    if (lines.length === 0) return;

    onSubmit({
      supplier_id: data.supplier_id,
      order_date: data.order_date,
      notes: data.notes || null,
      lines,
    });
  };

  return (
    <form onSubmit={handleSubmit(handleFormSubmit)} className="space-y-6">
      {/* Header fields */}
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
      </div>

      {/* Lines section */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300">
            {t("fields.lines")}
          </h3>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() =>
              append({
                product_id: "",
                variant_id: "",
                quantity: 1,
                unit_price: 0,
                previous_price: null,
                use_average_price: false,
                tax_rate: 0,
              })
            }
          >
            <Plus className="h-4 w-4 mr-1" />
            {t("fields.addLine")}
          </Button>
        </div>

        <div className="space-y-4">
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
                className="p-4 border border-gray-200 dark:border-gray-700 rounded-lg space-y-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-3">
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
                  </div>

                  {fields.length > 1 && (
                    <button
                      type="button"
                      onClick={() => remove(index)}
                      className="mt-6 p-1.5 text-gray-400 hover:text-red-600 dark:hover:text-red-400 transition-colors"
                      title={tCommon("buttons.delete")}
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
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
                        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                          {t("fields.previousPrice")}:{" "}
                          {formatCurrency(previousPrice)}
                        </p>
                      )}
                  </div>

                  <Input
                    label={t("fields.taxRate") + " (%)"}
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

                {priceChanged && (
                  <label className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                    <input
                      type="checkbox"
                      {...register(`lines.${index}.use_average_price`)}
                      className="h-4 w-4 text-primary-600 border-gray-300 rounded focus:ring-primary-500"
                    />
                    {t("fields.useAveragePrice")}
                  </label>
                )}

                <div className="text-right text-sm text-gray-600 dark:text-gray-400">
                  {t("fields.lineTotal")}:{" "}
                  <span className="font-medium text-gray-900 dark:text-gray-100">
                    {formatCurrency(lineSubtotals[index]?.total ?? 0)}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Totals */}
      <div className="border-t border-gray-200 dark:border-gray-700 pt-4 space-y-1 text-sm">
        <div className="flex justify-between text-gray-600 dark:text-gray-400">
          <span>{t("fields.subtotal")}</span>
          <span>{formatCurrency(orderSubtotal)}</span>
        </div>
        <div className="flex justify-between text-gray-600 dark:text-gray-400">
          <span>{t("fields.tax")}</span>
          <span>{formatCurrency(orderTax)}</span>
        </div>
        <div className="flex justify-between font-medium text-gray-900 dark:text-gray-100 text-base">
          <span>{t("fields.total")}</span>
          <span>{formatCurrency(orderTotal)}</span>
        </div>
      </div>

      {/* Notes */}
      <Textarea
        label={t("fields.notes")}
        autoComplete="off"
        {...register("notes")}
      />

      {/* Actions */}
      <div className="flex justify-end gap-3">
        <Button type="button" variant="secondary" onClick={onCancel}>
          {tCommon("buttons.cancel")}
        </Button>
        <Button type="submit" isLoading={isLoading}>
          {purchase ? tCommon("buttons.save") : tCommon("buttons.create")}
        </Button>
      </div>
    </form>
  );
}
