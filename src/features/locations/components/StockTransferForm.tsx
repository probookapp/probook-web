import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { Plus, Trash2 } from "lucide-react";
import { Button, Input, Select, SearchableSelect, Textarea } from "@/components/ui";
import { productApi, type Location } from "@/lib/api";
import type { CreateStockTransferInput } from "../hooks/useStockTransfers";

interface TransferFormLine {
  product_id: string;
  variant_id: string;
  quantity: number;
}

interface StockTransferFormProps {
  locations: Location[];
  onSubmit: (input: CreateStockTransferInput) => void;
  onCancel: () => void;
  isLoading?: boolean;
}

const emptyLine: TransferFormLine = { product_id: "", variant_id: "", quantity: 1 };

export function StockTransferForm({ locations, onSubmit, onCancel, isLoading }: StockTransferFormProps) {
  const { t } = useTranslation("locations");
  const { t: tCommon } = useTranslation("common");

  const { data: products } = useQuery({
    queryKey: ["products-with-details"],
    queryFn: productApi.getAllWithDetails,
  });

  const [fromId, setFromId] = useState("");
  const [toId, setToId] = useState("");
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<TransferFormLine[]>([{ ...emptyLine }]);
  const [error, setError] = useState<string | undefined>();

  const locationOptions = useMemo(
    () => [
      { value: "", label: t("transfers.selectLocation") },
      ...locations.map((l) => ({ value: l.id, label: l.name })),
    ],
    [locations, t]
  );

  const productOptions = useMemo(
    () =>
      (products ?? []).map((p) => ({
        value: p.id,
        label: `${p.designation}${p.reference ? ` (${p.reference})` : ""}`,
      })),
    [products]
  );

  const getVariantOptions = (productId: string) => {
    if (!productId || !products) return [];
    const product = products.find((p) => p.id === productId);
    if (!product?.has_variants || !product.variants) return [];
    return product.variants.map((v) => ({ value: v.id, label: v.name }));
  };

  const updateLine = (index: number, patch: Partial<TransferFormLine>) => {
    setLines((prev) => prev.map((l, i) => (i === index ? { ...l, ...patch } : l)));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(undefined);

    if (!fromId || !toId) {
      setError(t("transfers.validation.locationsRequired"));
      return;
    }
    if (fromId === toId) {
      setError(t("transfers.validation.sameLocation"));
      return;
    }
    const validLines = lines.filter((l) => l.product_id && Number(l.quantity) > 0);
    if (validLines.length === 0) {
      setError(t("transfers.validation.atLeastOneLine"));
      return;
    }

    onSubmit({
      from_location_id: fromId,
      to_location_id: toId,
      notes: notes.trim() || undefined,
      lines: validLines.map((l) => ({
        product_id: l.product_id,
        variant_id: l.variant_id || null,
        quantity: Number(l.quantity),
      })),
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Select
          label={t("transfers.fields.from")}
          name="from-location"
          options={locationOptions}
          value={fromId}
          onChange={(e) => setFromId(e.target.value)}
        />
        <Select
          label={t("transfers.fields.to")}
          name="to-location"
          options={locationOptions}
          value={toId}
          onChange={(e) => setToId(e.target.value)}
        />
      </div>

      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300">
            {t("transfers.fields.lines")}
          </h3>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => setLines((prev) => [...prev, { ...emptyLine }])}
          >
            <Plus className="h-4 w-4 mr-1" />
            {t("transfers.fields.addLine")}
          </Button>
        </div>

        <div className="space-y-4">
          {lines.map((line, index) => {
            const variantOptions = getVariantOptions(line.product_id);
            const hasVariants = variantOptions.length > 0;
            return (
              <div
                key={index}
                className="p-4 border border-gray-200 dark:border-gray-700 rounded-lg space-y-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-3">
                    <SearchableSelect
                      label={t("transfers.fields.product")}
                      options={productOptions}
                      value={line.product_id}
                      onChange={(val) => updateLine(index, { product_id: val, variant_id: "" })}
                      placeholder={t("transfers.fields.selectProduct")}
                    />
                    {hasVariants && (
                      <SearchableSelect
                        label={t("transfers.fields.variant")}
                        options={variantOptions}
                        value={line.variant_id}
                        onChange={(val) => updateLine(index, { variant_id: val })}
                        placeholder={t("transfers.fields.selectVariant")}
                      />
                    )}
                  </div>
                  {lines.length > 1 && (
                    <button
                      type="button"
                      onClick={() => setLines((prev) => prev.filter((_, i) => i !== index))}
                      className="mt-6 p-1.5 text-gray-400 hover:text-red-600 dark:hover:text-red-400 transition-colors"
                      title={tCommon("buttons.delete")}
                      aria-label={tCommon("buttons.delete")}
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <Input
                    label={t("transfers.fields.quantity")}
                    type="number"
                    min="1"
                    step="1"
                    autoComplete="off"
                    value={line.quantity}
                    onChange={(e) => updateLine(index, { quantity: Number(e.target.value) })}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <Textarea
        label={t("transfers.fields.notes")}
        autoComplete="off"
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
      />

      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

      <div className="flex justify-end gap-3">
        <Button type="button" variant="secondary" onClick={onCancel}>
          {tCommon("buttons.cancel")}
        </Button>
        <Button type="submit" isLoading={isLoading}>
          {tCommon("buttons.create")}
        </Button>
      </div>
    </form>
  );
}
