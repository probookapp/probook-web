import { useState, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { Button, Modal, Input, Select, Textarea } from "@/components/ui";
import { toast } from "@/stores/useToastStore";
import { isApiError } from "@/lib/api-adapter";
import { locationsApi } from "@/lib/api";
import { useAdjustStock } from "../hooks/useStock";
import { useProduct } from "../hooks/useProducts";
import type { Product } from "@/types";

interface AdjustStockModalProps {
  isOpen: boolean;
  onClose: () => void;
  product: Product | null;
}

type Mode = "set" | "delta";

export function AdjustStockModal({ isOpen, onClose, product }: AdjustStockModalProps) {
  const { t } = useTranslation("products");
  const { t: tCommon } = useTranslation("common");
  const adjustStock = useAdjustStock();

  // This component is remounted per product (keyed on product id by the parent),
  // so useState initializers run fresh for each product — no reset effect needed.
  const [mode, setMode] = useState<Mode>("set");
  const [variantId, setVariantId] = useState<string>("");
  const [autoSelected, setAutoSelected] = useState(false);
  const [value, setValue] = useState<string>(() =>
    product && !product.has_variants ? String(product.quantity ?? 0) : ""
  );
  const [reason, setReason] = useState<string>("");
  const [locationId, setLocationId] = useState<string>("");

  // Location picker only appears for multi-location tenants; single-location
  // tenants keep using the default location silently (empty location_id).
  const { data: locations } = useQuery({
    queryKey: ["locations"],
    queryFn: locationsApi.getAll,
    enabled: isOpen,
  });
  const showLocationPicker = (locations?.length ?? 0) >= 2;

  // Product list doesn't ship variants; fetch the full product when it has any.
  const { data: fullProduct } = useProduct(
    product?.has_variants && isOpen ? product.id : ""
  );

  const variants = useMemo(
    () =>
      product?.has_variants
        ? product?.variants ?? fullProduct?.variants ?? []
        : [],
    [product, fullProduct]
  );

  const qtyOf = (vId: string) =>
    vId
      ? variants.find((v) => v.id === vId)?.quantity ?? 0
      : product?.quantity ?? 0;

  const currentQty = qtyOf(variantId);

  // Once variants have loaded, default the selection to the first variant and
  // seed the "set" value. Guarded render-phase state adjustment (React-endorsed
  // pattern for deriving state from freshly-arrived props) — resets on remount.
  if (variants.length > 0 && !autoSelected) {
    setAutoSelected(true);
    setVariantId(variants[0].id);
    if (mode === "set") setValue(String(variants[0].quantity ?? 0));
  }

  const switchMode = (next: Mode) => {
    setMode(next);
    setValue(next === "set" ? String(currentQty) : "");
  };

  const changeVariant = (vId: string) => {
    setVariantId(vId);
    if (mode === "set") setValue(String(qtyOf(vId)));
  };

  if (!product) return null;

  const handleSubmit = async () => {
    const num = parseInt(value, 10);
    if (Number.isNaN(num)) {
      toast.error(t("adjustStock.invalidValue"));
      return;
    }

    try {
      await adjustStock.mutateAsync({
        id: product.id,
        input: {
          variant_id: variantId || null,
          location_id: showLocationPicker ? locationId || null : null,
          ...(mode === "set" ? { new_quantity: num } : { quantity_change: num }),
          reason: reason || null,
        },
      });
      toast.success(t("adjustStock.success"));
      onClose();
    } catch (err) {
      toast.error(
        isApiError(err, 400) ? t("adjustStock.noChange") : t("adjustStock.error")
      );
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={t("adjustStock.title")} size="sm">
      <div className="space-y-4">
        <p className="text-sm text-gray-600 dark:text-gray-400">{product.designation}</p>

        {showLocationPicker && (
          <Select
            label={t("adjustStock.location")}
            value={locationId}
            onChange={(e) => setLocationId(e.target.value)}
            options={[
              { value: "", label: t("adjustStock.defaultLocation") },
              ...(locations ?? []).map((l) => ({ value: l.id, label: l.name })),
            ]}
          />
        )}

        {variants.length > 0 && (
          <Select
            label={t("adjustStock.variant")}
            value={variantId}
            onChange={(e) => changeVariant(e.target.value)}
            options={variants.map((v) => ({
              value: v.id,
              label: `${v.name} (${v.quantity})`,
            }))}
          />
        )}

        <div className="rounded-lg bg-gray-50 dark:bg-gray-800 p-3 text-sm flex justify-between">
          <span className="text-gray-500 dark:text-gray-400">{t("adjustStock.currentStock")}</span>
          <span className="font-medium text-gray-900 dark:text-gray-100">{currentQty}</span>
        </div>

        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => switchMode("set")}
            className={`flex-1 rounded-md border px-3 py-2 text-sm font-medium transition-colors ${
              mode === "set"
                ? "border-primary-500 bg-primary-50 dark:bg-primary-900/20 text-primary-700 dark:text-primary-300"
                : "border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-400"
            }`}
          >
            {t("adjustStock.setMode")}
          </button>
          <button
            type="button"
            onClick={() => switchMode("delta")}
            className={`flex-1 rounded-md border px-3 py-2 text-sm font-medium transition-colors ${
              mode === "delta"
                ? "border-primary-500 bg-primary-50 dark:bg-primary-900/20 text-primary-700 dark:text-primary-300"
                : "border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-400"
            }`}
          >
            {t("adjustStock.deltaMode")}
          </button>
        </div>

        <Input
          type="number"
          step="1"
          label={mode === "set" ? t("adjustStock.newQuantity") : t("adjustStock.quantityChange")}
          placeholder={mode === "delta" ? t("adjustStock.deltaPlaceholder") : undefined}
          value={value}
          onChange={(e) => setValue(e.target.value)}
        />

        <Textarea
          label={t("adjustStock.reason")}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder={t("adjustStock.reasonPlaceholder")}
          rows={2}
        />

        <div className="flex justify-end gap-3 pt-2">
          <Button variant="secondary" onClick={onClose}>
            {tCommon("buttons.cancel")}
          </Button>
          <Button onClick={handleSubmit} isLoading={adjustStock.isPending}>
            {t("adjustStock.apply")}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
