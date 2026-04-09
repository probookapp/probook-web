import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2, Edit2, Save, X } from "lucide-react";
import { Button, Input } from "@/components/ui";
import { productVariantApi } from "@/lib/api";
import { useDemoMode } from "@/components/providers/DemoModeProvider";
import { toast } from "@/stores/useToastStore";
import type { ProductVariant, CreateProductVariantInput } from "@/types";

const PRESET_ATTRIBUTES = ["size", "color", "material"];
const SIZE_OPTIONS = ["S", "M", "L", "XL", "XXL", "2XL", "3XL"];

interface VariantManagerProps {
  productId: string;
}

interface VariantFormState {
  name: string;
  sku: string;
  barcode: string;
  quantity: number;
  price_override: string;
  attributes: Record<string, string>;
}

const emptyForm: VariantFormState = {
  name: "",
  sku: "",
  barcode: "",
  quantity: 0,
  price_override: "",
  attributes: {},
};

export function VariantManager({ productId }: VariantManagerProps) {
  const { t } = useTranslation(["products", "common"]);
  const { isDemoMode, showSubscribePrompt } = useDemoMode();
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<VariantFormState>(emptyForm);
  const [customAttrName, setCustomAttrName] = useState("");

  const { data: variants = [] } = useQuery({
    queryKey: ["product-variants", productId],
    queryFn: () => isDemoMode ? [] : productVariantApi.getAll(productId),
    staleTime: isDemoMode ? Infinity : undefined,
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["product-variants", productId] });
    queryClient.invalidateQueries({ queryKey: ["products"] });
  };

  const createMutation = useMutation({
    mutationFn: (input: CreateProductVariantInput) =>
      productVariantApi.create(productId, input),
    onSuccess: () => {
      invalidate();
      resetForm();
      toast.success(t("common:messages.created"));
    },
    onError: () => toast.error(t("common:messages.error")),
  });

  const updateMutation = useMutation({
    mutationFn: ({ variantId, input }: { variantId: string; input: CreateProductVariantInput }) =>
      productVariantApi.update(productId, variantId, { ...input, id: variantId }),
    onSuccess: () => {
      invalidate();
      resetForm();
      toast.success(t("common:messages.updated"));
    },
    onError: () => toast.error(t("common:messages.error")),
  });

  const deleteMutation = useMutation({
    mutationFn: (variantId: string) => productVariantApi.delete(productId, variantId),
    onSuccess: () => {
      invalidate();
      toast.success(t("common:messages.deleted"));
    },
    onError: () => toast.error(t("common:messages.error")),
  });

  const resetForm = () => {
    setForm(emptyForm);
    setShowForm(false);
    setEditingId(null);
    setCustomAttrName("");
  };

  const startEdit = (v: ProductVariant) => {
    setForm({
      name: v.name,
      sku: v.sku || "",
      barcode: v.barcode || "",
      quantity: v.quantity,
      price_override: v.price_override != null ? String(v.price_override) : "",
      attributes: v.attributes || {},
    });
    setEditingId(v.id);
    setShowForm(true);
  };

  const handleSubmit = () => {
    if (isDemoMode) { showSubscribePrompt(); return; }
    if (!form.name.trim()) return;
    const input: CreateProductVariantInput = {
      name: form.name,
      sku: form.sku || null,
      barcode: form.barcode || null,
      quantity: form.quantity,
      price_override: form.price_override ? parseFloat(form.price_override) : null,
      attributes: form.attributes,
    };
    if (editingId) {
      updateMutation.mutate({ variantId: editingId, input });
    } else {
      createMutation.mutate(input);
    }
  };

  const addAttribute = (key: string) => {
    if (!key.trim() || form.attributes[key] !== undefined) return;
    setForm({ ...form, attributes: { ...form.attributes, [key]: "" } });
    setCustomAttrName("");
  };

  const removeAttribute = (key: string) => {
    const { [key]: _, ...rest } = form.attributes;
    setForm({ ...form, attributes: rest });
  };

  const updateAttributeValue = (key: string, value: string) => {
    setForm({ ...form, attributes: { ...form.attributes, [key]: value } });
  };

  const totalStock = variants.reduce((sum, v) => sum + v.quantity, 0);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300">
            {t("variants.title")}
          </h3>
          {variants.length > 0 && (
            <p className="text-xs text-gray-500">
              {t("variants.totalStock")}: {totalStock}
            </p>
          )}
        </div>
        {!showForm && (
          <button
            type="button"
            onClick={() => { if (isDemoMode) { showSubscribePrompt(); return; } resetForm(); setShowForm(true); }}
            className="flex items-center gap-1 text-sm text-primary-600 hover:text-primary-700 dark:text-primary-400"
          >
            <Plus className="h-4 w-4" />
            {t("variants.addVariant")}
          </button>
        )}
      </div>

      {/* Existing variants list */}
      {variants.length > 0 && (
        <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 dark:bg-gray-800">
              <tr>
                <th className="px-3 py-2 text-left font-medium">{t("variants.name")}</th>
                <th className="px-3 py-2 text-left font-medium">{t("variants.attributes")}</th>
                <th className="px-3 py-2 text-right font-medium">{t("variants.quantity")}</th>
                <th className="px-3 py-2 text-right font-medium">{t("variants.barcode")}</th>
                <th className="px-3 py-2 w-20"></th>
              </tr>
            </thead>
            <tbody>
              {variants.map((v) => (
                <tr key={v.id} className="border-t border-gray-200 dark:border-gray-700">
                  <td className="px-3 py-2 font-medium">{v.name}</td>
                  <td className="px-3 py-2">
                    <div className="flex flex-wrap gap-1">
                      {Object.entries(v.attributes || {}).map(([key, val]) => (
                        <span key={key} className="inline-flex items-center px-2 py-0.5 rounded-full text-xs bg-gray-100 dark:bg-gray-700">
                          {t(`variants.presets.${key}`, { defaultValue: key })}: {val}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="px-3 py-2 text-right">
                    <span className={v.quantity === 0 ? "text-red-600 dark:text-red-400 font-medium" : ""}>
                      {v.quantity}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right text-xs text-gray-500">
                    {v.barcode || "-"}
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-1 justify-end">
                      <button
                        type="button"
                        onClick={() => isDemoMode ? showSubscribePrompt() : startEdit(v)}
                        className="p-1 text-gray-500 hover:text-primary-600 rounded"
                      >
                        <Edit2 className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          if (isDemoMode) { showSubscribePrompt(); return; }
                          if (confirm(t("common:messages.deleteConfirm"))) deleteMutation.mutate(v.id);
                        }}
                        className="p-1 text-gray-500 hover:text-red-600 rounded"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {variants.length === 0 && !showForm && (
        <p className="text-sm text-gray-500 italic">{t("variants.noVariants")}</p>
      )}

      {/* Add/Edit form */}
      {showForm && (
        <div className="border border-primary-200 dark:border-primary-800 rounded-lg p-4 bg-primary-50/30 dark:bg-primary-900/10 space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <Input
              label={t("variants.name")}
              placeholder={t("variants.namePlaceholder")}
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
            <Input
              label={t("variants.sku")}
              value={form.sku}
              onChange={(e) => setForm({ ...form, sku: e.target.value })}
            />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <Input
              label={t("variants.barcode")}
              value={form.barcode}
              onChange={(e) => setForm({ ...form, barcode: e.target.value })}
            />
            <Input
              label={t("variants.quantity")}
              type="number"
              min="0"
              value={form.quantity}
              onChange={(e) => setForm({ ...form, quantity: parseInt(e.target.value) || 0 })}
            />
            <Input
              label={t("variants.priceOverride")}
              type="number"
              step="0.01"
              placeholder={t("variants.priceOverridePlaceholder")}
              value={form.price_override}
              onChange={(e) => setForm({ ...form, price_override: e.target.value })}
            />
          </div>

          {/* Attributes */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
              {t("variants.attributes")}
            </label>
            {/* Preset attribute buttons */}
            <div className="flex gap-2 flex-wrap">
              {PRESET_ATTRIBUTES.filter((a) => form.attributes[a] === undefined).map((attr) => (
                <button
                  key={attr}
                  type="button"
                  onClick={() => addAttribute(attr)}
                  className="px-2 py-1 text-xs rounded-full border border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700"
                >
                  + {t(`variants.presets.${attr}`)}
                </button>
              ))}
            </div>
            {/* Custom attribute input */}
            <div className="flex gap-2">
              <input
                type="text"
                placeholder={t("variants.attributeName")}
                value={customAttrName}
                onChange={(e) => setCustomAttrName(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addAttribute(customAttrName); } }}
                className="flex-1 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-1.5 text-sm"
              />
              <button
                type="button"
                onClick={() => addAttribute(customAttrName)}
                className="px-3 py-1.5 text-sm text-primary-600 hover:text-primary-700"
              >
                {t("variants.addAttribute")}
              </button>
            </div>
            {/* Attribute values */}
            {Object.entries(form.attributes).map(([key, value]) => (
              <div key={key} className="flex items-center gap-2">
                <span className="text-sm font-medium min-w-20">
                  {t(`variants.presets.${key}`, { defaultValue: key })}
                </span>
                {key === "size" ? (
                  <div className="flex gap-1.5 flex-wrap flex-1">
                    {SIZE_OPTIONS.map((s) => (
                      <button
                        key={s}
                        type="button"
                        onClick={() => updateAttributeValue(key, s)}
                        className={`px-2.5 py-1 text-xs rounded-md border ${
                          value === s
                            ? "border-primary-500 bg-primary-50 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300"
                            : "border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700"
                        }`}
                      >
                        {s}
                      </button>
                    ))}
                    <input
                      type="text"
                      value={!SIZE_OPTIONS.includes(value) ? value : ""}
                      placeholder="..."
                      onChange={(e) => updateAttributeValue(key, e.target.value)}
                      className="w-16 rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-2 py-1 text-xs"
                    />
                  </div>
                ) : (
                  <input
                    type="text"
                    value={value}
                    placeholder={t("variants.attributeValue")}
                    onChange={(e) => updateAttributeValue(key, e.target.value)}
                    className="flex-1 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-1.5 text-sm"
                  />
                )}
                <button
                  type="button"
                  onClick={() => removeAttribute(key)}
                  className="p-1 text-red-500 hover:text-red-700"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>

          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={resetForm}>
              {t("common:buttons.cancel")}
            </Button>
            <Button
              type="button"
              onClick={handleSubmit}
              isLoading={createMutation.isPending || updateMutation.isPending}
            >
              {editingId ? (
                <><Save className="h-4 w-4 mr-1" /> {t("common:buttons.save")}</>
              ) : (
                <><Plus className="h-4 w-4 mr-1" /> {t("variants.addVariant")}</>
              )}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
