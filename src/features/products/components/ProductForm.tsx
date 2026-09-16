import { useMemo } from "react";
import { useForm, Controller, useFieldArray, type Resolver } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { zodResolver } from "@hookform/resolvers/zod";
import { Plus, Trash2 } from "lucide-react";
import { Button, Input, Textarea, Select, SearchableSelect } from "@/components/ui";
import { fieldBase, FIELD_HEIGHT } from "@/components/ui/field";
import { useVatRateOptions } from "@/hooks/useFiscalProfile";
import { useCompanySettings } from "@/features/settings/hooks/useSettings";
import { createProductSchema, type ProductFormData } from "../schemas/productSchema";
import { useProductCategories } from "../hooks/useProductCategories";
import { ProductPhotoUpload } from "./ProductPhotoUpload";
import { VariantManager } from "./VariantManager";
import type { Product } from "@/types";

interface ProductFormProps {
  product?: Product;
  onSubmit: (data: ProductFormData) => void;
  onCancel: () => void;
  isLoading?: boolean;
  /**
   * Created from a purchase order: the order itself brings the stock in when it
   * is received, so an opening quantity here would count the goods twice. Variants
   * are set up from the product page, where they can be named.
   */
  fromPurchase?: boolean;
}


export function ProductForm({ product, onSubmit, onCancel, isLoading, fromPurchase }: ProductFormProps) {
  const { t } = useTranslation(["products", "common"]);
  const { data: categories } = useProductCategories();
  // A new product inherits the tenant's usual rate. It used to open at 0 %,
  // and since an invoice line takes its rate from the product, anything sold
  // before someone noticed was invoiced with no VAT at all.
  const { data: settings } = useCompanySettings();
  const defaultTaxRate = settings?.default_tax_rate ?? 0;

  const productSchema = useMemo(() => createProductSchema(t), [t]);

  // VAT scale of the tenant's fiscal regime, with the product's own rate kept
  // selectable so editing never silently resets it.
  const taxRateOptions = useVatRateOptions(product?.tax_rate);

  const unitOptions = useMemo(() => [
    { value: "unit", label: t("units.unit") },
    { value: "hour", label: t("units.hour") },
    { value: "day", label: t("units.day") },
    { value: "month", label: t("units.month") },
    { value: "flat_rate", label: t("units.flatRate") },
    { value: "kg", label: t("units.kg") },
    { value: "m", label: t("units.meter") },
    { value: "sqm", label: t("units.squareMeter") },
    { value: "cbm", label: t("units.cubicMeter") },
    { value: "l", label: t("units.liter") },
  ], [t]);

  const priceTierLabelOptions = useMemo(() => [
    { value: "retail", label: t("pricing.labels.retail") },
    { value: "wholesale", label: t("pricing.labels.wholesale") },
    { value: "semi_wholesale", label: t("pricing.labels.semi_wholesale") },
    { value: "super_wholesale", label: t("pricing.labels.super_wholesale") },
  ], [t]);

  const {
    register,
    handleSubmit,
    watch,
    control,
    formState: { errors },
  } = useForm<ProductFormData>({
    resolver: zodResolver(productSchema) as Resolver<ProductFormData>,
    defaultValues: {
      designation: product?.designation ?? "",
      description: product?.description ?? "",
      unit_price: product?.unit_price ?? 0,
      tax_rate: product?.tax_rate ?? defaultTaxRate,
      unit: product?.unit ?? "unit",
      reference: product?.reference ?? "",
      barcode: product?.barcode ?? "",
      is_service: product?.is_service ?? false,
      category_id: product?.category_id ?? "",
      quantity: product?.quantity ?? 0,
      purchase_price: product?.purchase_price ?? 0,
      prices: product?.prices?.map((p) => ({ label: p.label, price: p.price })) ?? [],
      has_variants: product?.has_variants ?? false,
    },
  });

  const { fields: priceFields, append: appendPrice, remove: removePrice } = useFieldArray({
    control,
    name: "prices",
  });

  const isService = watch("is_service");

  const categoryOptions = [
    { value: "", label: t("fields.noCategory") },
    ...(categories?.map((cat) => ({ value: cat.id, label: cat.name })) || []),
  ];

  return (
    // Opened over another form (a purchase order), this form sits in a portal:
    // the DOM keeps them apart but React bubbles submit up its own tree, and the
    // order behind would submit too.
    <form
      onSubmit={(e) => {
        e.stopPropagation();
        return handleSubmit(onSubmit)(e);
      }}
      className="space-y-6"
    >
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Input
          label={t("fields.designationRequired")}
          autoComplete="off"
          {...register("designation")}
          error={errors.designation?.message}
        />
        <Input
          label={t("fields.reference")}
          autoComplete="off"
          {...register("reference")}
          error={errors.reference?.message}
        />
      </div>

      <Input
        label={t("fields.barcode")}
        autoComplete="off"
        placeholder={t("fields.barcodePlaceholder")}
        {...register("barcode")}
        error={errors.barcode?.message}
      />

      <Textarea
        label={t("fields.description")}
        {...register("description")}
        error={errors.description?.message}
      />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Input
          label={t("fields.unitPriceHtRequired")}
          type="number"
          step="0.01"
          {...register("unit_price")}
          error={errors.unit_price?.message}
        />
        <Input
          label={t("fields.purchasePriceHt")}
          type="number"
          step="0.01"
          {...register("purchase_price")}
          error={errors.purchase_price?.message}
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Select
          label={t("fields.vatRateRequired")}
          options={taxRateOptions}
          {...register("tax_rate")}
          error={errors.tax_rate?.message}
        />
        <Select
          label={t("fields.unitRequired")}
          options={unitOptions}
          {...register("unit")}
          error={errors.unit?.message}
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Controller
          name="category_id"
          control={control}
          render={({ field }) => (
            <SearchableSelect
              label={t("fields.category")}
              options={categoryOptions}
              value={field.value ?? ""}
              onChange={field.onChange}
              placeholder={t("fields.noCategory")}
              error={errors.category_id?.message}
            />
          )}
        />
        {!isService && !fromPurchase && (
          <Input
            label={t("fields.quantity")}
            type="number"
            step="1"
            min="0"
            {...register("quantity")}
            error={errors.quantity?.message}
          />
        )}
      </div>

      {/* Price Tiers */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
            {t("pricing.title")}
          </label>
          <button
            type="button"
            onClick={() => appendPrice({ label: "", price: 0 })}
            className="flex min-h-10 items-center gap-1 text-sm text-primary-600 hover:text-primary-700 dark:text-primary-400 lg:min-h-0"
          >
            <Plus className="h-4 w-4" />
            {t("pricing.addTier")}
          </button>
        </div>
        {priceFields.length === 0 && (
          <p className="text-sm text-gray-500 dark:text-gray-400 italic">
            {t("pricing.noTiers")}
          </p>
        )}
        {priceFields.map((field, index) => {
          const currentLabel = watch(`prices.${index}.label`);
          const isPreset = priceTierLabelOptions.some((o) => o.value === currentLabel);
          const isCustom = currentLabel !== "" && !isPreset;
          return (
            // On a phone the three fields cannot share a row inside the modal:
            // the tariff and its delete button stay on top, the rest stack below.
            <div
              key={field.id}
              className="grid grid-cols-[minmax(0,1fr)_auto] gap-2 sm:flex sm:items-start sm:gap-3"
            >
              <div className="sm:flex-1 sm:min-w-0">
                <Controller
                  name={`prices.${index}.label`}
                  control={control}
                  render={({ field: labelField }) => (
                    <select
                      value={isCustom ? "__custom__" : labelField.value}
                      onChange={(e) => {
                        if (e.target.value === "__custom__") {
                          labelField.onChange("");
                        } else {
                          labelField.onChange(e.target.value);
                        }
                      }}
                      className={fieldBase(false, FIELD_HEIGHT)}
                    >
                      <option value="">{t("pricing.selectLabel")}</option>
                      {priceTierLabelOptions.map((opt) => (
                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                      ))}
                      <option value="__custom__">{t("pricing.labels.custom")}</option>
                    </select>
                  )}
                />
              </div>
              {isCustom && (
                <div className="col-span-2 sm:flex-1 sm:min-w-0">
                  <Input
                    placeholder={t("pricing.labelPlaceholder")}
                    {...register(`prices.${index}.label`)}
                  />
                </div>
              )}
              <div className="col-span-2 sm:flex-1 sm:min-w-0">
                <Input
                  type="number"
                  step="0.01"
                  placeholder={t("pricing.pricePlaceholder")}
                  {...register(`prices.${index}.price`)}
                />
              </div>
              <button
                type="button"
                onClick={() => removePrice(index)}
                aria-label={t("pricing.removeTier")}
                title={t("pricing.removeTier")}
                className="col-start-2 row-start-1 p-3 lg:p-2.5 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-md"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          );
        })}
      </div>

      <div className="flex items-center gap-2">
        <input
          type="checkbox"
          id="is_service"
          {...register("is_service")}
          className="h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
        />
        <label htmlFor="is_service" className="text-sm text-gray-700 dark:text-gray-300">
          {t("fields.isServiceDescription")}
        </label>
      </div>

      {!isService && !fromPurchase && (
        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            id="has_variants"
            {...register("has_variants")}
            className="h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
          />
          <label htmlFor="has_variants" className="text-sm text-gray-700 dark:text-gray-300">
            {t("variants.hasVariants")}
          </label>
        </div>
      )}

      {product && watch("has_variants") && (
        <VariantManager productId={product.id} />
      )}

      {product && (
        <ProductPhotoUpload productId={product.id} />
      )}

      <div className="flex justify-end gap-3">
        <Button type="button" variant="secondary" onClick={onCancel}>
          {t("common:buttons.cancel")}
        </Button>
        <Button type="submit" isLoading={isLoading}>
          {product ? t("updateProduct") : t("createProduct")}
        </Button>
      </div>
    </form>
  );
}
