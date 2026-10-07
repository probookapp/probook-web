import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2, Save } from "lucide-react";
import { Button, Input, SearchableSelect, NUMERIC_CELL } from "@/components/ui";
import { productBundleApi } from "@/lib/api";
import { useDocumentCatalog } from "@/hooks/useDocumentCatalog";
import { useDemoMode } from "@/components/providers/DemoModeProvider";
import { useFeature, FEATURE_KEYS } from "@/hooks/useEntitlements";
import { useAuthStore } from "@/stores/useAuthStore";
import { toast } from "@/stores/useToastStore";
import { apiErrorCode, getApiErrorMessage } from "@/lib/api-adapter";
import { translatedName } from "@/lib/translated-name";
import { commonTaxRate, componentsFor, bundlePurchasePrice } from "@/lib/bundles";
import { formatCurrency } from "@/lib/utils";
import type { BundleComponentInput, Product } from "@/types";

interface Row extends BundleComponentInput {
  key: string;
}

/** The refusals a composition can meet, each worded for the person composing it. */
const BUNDLE_ERRORS = [
  "BUNDLE_HAS_STOCK",
  "BUNDLE_NESTED",
  "BUNDLE_SELF",
  "BUNDLE_DUPLICATE",
  "VARIANT_REQUIRED",
] as const;

let rowSeq = 0;
const nextKey = () => `row-${++rowSeq}`;

/**
 * What a pack is made of, edited on the pack's own form.
 *
 * Saved on its own, like the variants: the composition goes through its own
 * route, which is the part of packs an offer can leave out. A pack with
 * variants lists, for each variant, what changes with it (the black camera or
 * the white one), and once what every variant shares (the fitting).
 */
export function BundleManager({ product }: { product: Product }) {
  const { t, i18n } = useTranslation(["products", "common"]);
  const { isDemoMode, showSubscribePrompt } = useDemoMode();
  const canEdit = useAuthStore((s) => s.hasPermission("products", "edit"));
  const feature = useFeature(FEATURE_KEYS.BUNDLES);
  const queryClient = useQueryClient();
  const catalog = useDocumentCatalog();

  const [rows, setRows] = useState<Row[]>(() =>
    (product.bundle_components ?? []).map((c) => ({
      key: nextKey(),
      bundle_variant_id: c.bundle_variant_id,
      product_id: c.product_id,
      variant_id: c.variant_id,
      quantity: c.quantity,
    }))
  );
  const [dirty, setDirty] = useState(false);
  // On a pack with variants: null is "every variant", otherwise one of them.
  const [scope, setScope] = useState<string | null>(null);

  const packVariants = useMemo(
    () => (product.has_variants ? (product.variants ?? []).filter((v) => v.is_active) : []),
    [product.has_variants, product.variants]
  );

  // A pack cannot hold a pack, nor itself.
  const candidates = useMemo(
    () => (catalog.products ?? []).filter((p) => !p.is_bundle && p.id !== product.id),
    [catalog.products, product.id]
  );
  const productOptions = [
    { value: "", label: t("bundle.chooseProduct") },
    ...candidates.map((p) => ({
      value: p.id,
      label: `${p.reference ? `[${p.reference}] ` : ""}${p.designation}${p.is_service ? ` · ${t("types.service")}` : ""}`,
    })),
  ];

  const save = useMutation({
    mutationFn: () =>
      productBundleApi.set(
        product.id,
        rows
          .filter((r) => r.product_id && r.quantity > 0)
          .map(({ bundle_variant_id, product_id, variant_id, quantity }) => ({
            bundle_variant_id,
            product_id,
            variant_id,
            quantity,
          }))
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["products"] });
      setDirty(false);
      toast.success(t("bundle.saved"));
    },
    onError: (err) => {
      const code = apiErrorCode(err);
      toast.error(
        code && (BUNDLE_ERRORS as readonly string[]).includes(code)
          ? t(`bundle.errors.${code}`)
          : getApiErrorMessage(err, t("common:messages.error"))
      );
    },
  });

  const update = (key: string, patch: Partial<Row>) => {
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch } : r)));
    setDirty(true);
  };
  const remove = (key: string) => {
    setRows((prev) => prev.filter((r) => r.key !== key));
    setDirty(true);
  };
  const add = () => {
    setRows((prev) => [
      ...prev,
      { key: nextKey(), bundle_variant_id: scope, product_id: "", variant_id: null, quantity: 1 },
    ]);
    setDirty(true);
  };

  const visible = rows.filter((r) => (r.bundle_variant_id ?? null) === scope);

  // What the pack holds for the variant in view (shared rows included), priced
  // from the catalogue, to compare with the pack's own price.
  const summary = useMemo(() => {
    const inScope = componentsFor(rows, scope ?? null).filter((r) => r.product_id);
    const priced = inScope.map((r) => {
      const p = candidates.find((c) => c.id === r.product_id);
      const v = r.variant_id ? p?.variants?.find((x) => x.id === r.variant_id) : undefined;
      return {
        quantity: r.quantity,
        unit_price: v?.price_override ?? p?.unit_price ?? 0,
        tax_rate: p?.tax_rate ?? 0,
        purchase_price: p?.purchase_price ?? 0,
      };
    });
    const value = priced.reduce((s, c) => s + c.unit_price * c.quantity, 0);
    const scopedVariant = scope ? packVariants.find((v) => v.id === scope) : undefined;
    const price = scopedVariant?.price_override ?? product.unit_price;
    return {
      count: inScope.length,
      value,
      price,
      cost: bundlePurchasePrice(priced),
      discount: value > 0 ? ((value - price) / value) * 100 : 0,
      mixed: priced.length > 0 && commonTaxRate(priced) === null,
    };
  }, [rows, scope, candidates, packVariants, product.unit_price]);

  const locked = !feature.included;
  const offer = feature.upgradeTo
    ? translatedName(feature.upgradeTo.name, feature.upgradeTo.nameTranslations, i18n.language)
    : null;

  return (
    <div className="space-y-3 rounded-lg border border-(--color-border-primary) p-3" data-testid="bundle-manager">
      <div>
        <h3 className="text-sm font-semibold text-(--color-text-primary)">{t("bundle.title")}</h3>
        <p className="text-xs text-(--color-text-secondary)">{t("bundle.hint")}</p>
      </div>

      {locked && (
        <p className="rounded-md bg-warning-50 px-3 py-2 text-sm text-warning-700 dark:bg-warning-950 dark:text-warning-300">
          {offer ? t("bundle.lockedWithOffer", { offer }) : t("bundle.locked")}
        </p>
      )}

      {packVariants.length > 0 && (
        <div className="flex flex-wrap gap-2" role="tablist">
          {[{ id: null, name: t("bundle.allVariants") }, ...packVariants].map((v) => (
            <button
              key={v.id ?? "all"}
              type="button"
              role="tab"
              aria-selected={scope === v.id}
              onClick={() => setScope(v.id)}
              className={`min-h-10 rounded-full border px-3 text-sm lg:min-h-0 lg:py-1 ${
                scope === v.id
                  ? "border-primary-600 bg-primary-50 text-primary-700 dark:border-primary-400 dark:bg-primary-900/40 dark:text-primary-200"
                  : "border-(--color-border-primary) text-(--color-text-secondary)"
              }`}
            >
              {v.name}
            </button>
          ))}
        </div>
      )}

      {visible.length === 0 && (
        <p className="text-sm italic text-(--color-text-secondary)">{t("bundle.empty")}</p>
      )}

      <ul className="space-y-2">
        {visible.map((row, index) => {
          const variantOptions = catalog.variantOptions(row.product_id);
          // Labelled once, on the first row: the rest line up under it.
          const label = (text: string) => (index === 0 ? text : "");
          return (
            <li
              key={row.key}
              className="grid grid-cols-[minmax(0,1fr)_auto] gap-2 sm:grid-cols-[minmax(0,1fr)_7rem_auto] sm:items-start"
              data-testid="bundle-component-row"
            >
              {/* The product, and under it the variant when it has some. */}
              <div className="min-w-0 space-y-2">
                <SearchableSelect
                  label={label(t("bundle.component"))}
                  options={productOptions}
                  value={row.product_id}
                  onChange={(val) => update(row.key, { product_id: val, variant_id: null })}
                  placeholder={t("bundle.chooseProduct")}
                  disabled={locked || !canEdit}
                />
                {variantOptions.length > 0 && (
                  <SearchableSelect
                    options={variantOptions}
                    value={row.variant_id ?? ""}
                    onChange={(val) => update(row.key, { variant_id: val || null })}
                    placeholder={t("common:documentLines.selectVariant")}
                    error={!row.variant_id ? t("common:documentLines.variantRequired") : undefined}
                    disabled={locked || !canEdit}
                  />
                )}
              </div>
              <button
                type="button"
                onClick={() => remove(row.key)}
                aria-label={t("bundle.removeComponent")}
                title={t("bundle.removeComponent")}
                disabled={locked || !canEdit}
                // Level with the fields, which sit under a label on the first row.
                className={`col-start-2 row-start-1 rounded-md p-3 text-red-600 hover:bg-red-50 disabled:opacity-50 dark:text-red-400 dark:hover:bg-red-900/20 sm:col-start-3 lg:p-2.5 ${
                  index === 0 ? "mt-6" : ""
                }`}
              >
                <Trash2 className="h-4 w-4" />
              </button>
              <div className="col-span-2 sm:col-span-1 sm:col-start-2 sm:row-start-1">
                <Input
                  label={label(t("bundle.quantity"))}
                  aria-label={t("bundle.quantity")}
                  type="number"
                  step="any"
                  min="0"
                  inputMode="decimal"
                  value={row.quantity}
                  onChange={(e) => update(row.key, { quantity: Number(e.target.value) })}
                  disabled={locked || !canEdit}
                />
              </div>
            </li>
          );
        })}
      </ul>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button type="button" variant="secondary" size="sm" onClick={add} disabled={locked || !canEdit}>
          <Plus className="me-2 h-4 w-4" />
          {t("bundle.addComponent")}
        </Button>
        <Button
          type="button"
          size="sm"
          onClick={() => (isDemoMode ? showSubscribePrompt() : save.mutate())}
          isLoading={save.isPending}
          disabled={locked || !canEdit || !dirty || rows.some((r) => r.product_id && catalog.needsVariant(r))}
        >
          <Save className="me-2 h-4 w-4" />
          {t("bundle.save")}
        </Button>
      </div>

      {summary.count > 0 && (
        <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 border-t border-(--color-border-primary) pt-2 text-sm">
          <dt className="text-(--color-text-secondary)">{t("bundle.componentsValue")}</dt>
          <dd className={NUMERIC_CELL}>{formatCurrency(summary.value)}</dd>
          <dt className="text-(--color-text-secondary)">{t("bundle.packPrice")}</dt>
          <dd className={NUMERIC_CELL}>{formatCurrency(summary.price)}</dd>
          {summary.discount > 0.05 && (
            <>
              <dt className="text-(--color-text-secondary)">{t("bundle.discount")}</dt>
              <dd className={`${NUMERIC_CELL} text-emerald-700 dark:text-emerald-400`}>
                {summary.discount.toFixed(1)} %
              </dd>
            </>
          )}
          <dt className="text-(--color-text-secondary)">{t("bundle.cost")}</dt>
          <dd className={NUMERIC_CELL}>{formatCurrency(summary.cost)}</dd>
          {summary.mixed && (
            <p className="col-span-2 text-xs text-(--color-text-secondary)">{t("bundle.mixedVatHint")}</p>
          )}
        </dl>
      )}
    </div>
  );
}
