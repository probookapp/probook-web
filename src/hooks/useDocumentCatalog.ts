import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { productApi } from "@/lib/api";
import { useDemoMode } from "@/components/providers/DemoModeProvider";
import { DEMO_PRODUCTS } from "@/lib/demo-data";
import {
  commonTaxRate,
  componentsFor,
  isEmptyPack,
  sellableVariants,
  snapshotComponents,
  type BundleComponentSnapshot,
} from "@/lib/bundles";
import type { Product, ProductVariant } from "@/types";

export interface CatalogOption {
  value: string;
  label: string;
}

/**
 * Stock on hand for a product: its own count, or the sum of its variants'.
 * A pack counts what its components can make up; one made only of services
 * has no limit.
 */
export function onHand(product: Product): number {
  const count = (q: number | null | undefined) =>
    product.is_bundle && (q === null || q === undefined) ? Infinity : q ?? 0;
  if (!product.has_variants) return count(product.quantity);
  return (product.variants ?? [])
    .filter((v) => v.is_active)
    .reduce((sum, v) => sum + count(v.quantity), 0);
}

/**
 * The catalogue as the quote, invoice and delivery-note editors need it:
 * products with their variants and per-variant stock, the picker labels, and
 * what a line becomes once a product or a variant is chosen.
 *
 * One place, because the three editors had drifted: two hid a product with
 * variants altogether (its own count is always 0 — the stock lives on the
 * variants), and none could say which variant was sold, so an issued invoice
 * took the goods out of a count that holds nothing.
 *
 * A pack becomes a line carrying its composition (`bundle_components`), which
 * the editor expands into the pack's header and components when it saves; see
 * src/lib/bundles.ts.
 */
export function useDocumentCatalog(opts: { hideOutOfStock?: boolean } = {}) {
  const { t } = useTranslation("common");
  const { isDemoMode } = useDemoMode();
  // Under the ["products"] prefix so every product mutation refreshes it too.
  const { data: products } = useQuery({
    queryKey: ["products", "with-variants", { demo: isDemoMode }],
    queryFn: isDemoMode ? () => DEMO_PRODUCTS : productApi.getAllWithDetails,
    staleTime: isDemoMode ? Infinity : undefined,
  });

  const findProduct = (id: string | null | undefined) =>
    id ? products?.find((p) => p.id === id) : undefined;

  const stockLabel = (quantity: number) =>
    quantity === Infinity
      ? ""
      : quantity > 0
        ? ` (${quantity})`
        : ` (${t("documentLines.outOfStock")})`;

  const productOptions = (placeholder: string): CatalogOption[] => [
    { value: "", label: placeholder },
    ...(products ?? [])
      .filter((p) => !isEmptyPack(p))
      .filter((p) => !opts.hideOutOfStock || p.is_service || onHand(p) > 0)
      .map((p) => ({
        value: p.id,
        label: `${p.reference ? `[${p.reference}] ` : ""}${p.designation}${
          p.is_bundle ? ` · ${t("documentLines.pack")}` : ""
        }${p.barcode ? ` - ${p.barcode}` : ""}${p.is_service ? "" : stockLabel(onHand(p))}`,
      })),
  ];

  const activeVariants = (productId: string | null | undefined): ProductVariant[] => {
    const product = findProduct(productId);
    // A pack variant with nothing in it has nothing to sell.
    return product?.has_variants ? sellableVariants(product) : [];
  };

  const variantQuantity = (product: Product | undefined, v: ProductVariant) =>
    product?.is_bundle && (v.quantity === null || v.quantity === undefined) ? Infinity : v.quantity ?? 0;

  const variantOptions = (productId: string | null | undefined): CatalogOption[] => {
    const product = findProduct(productId);
    return activeVariants(productId)
      .filter((v) => !opts.hideOutOfStock || variantQuantity(product, v) > 0)
      .map((v) => ({ value: v.id, label: `${v.name}${stockLabel(variantQuantity(product, v))}` }));
  };

  /** A product with variants is not a sellable line until one is chosen. */
  const needsVariant = (line: { product_id?: string | null; variant_id?: string | null } | undefined) =>
    !!line?.product_id && activeVariants(line.product_id).length > 0 && !line.variant_id;

  /** The composition a pack line carries, or null for anything that is not a (ready) pack. */
  const packComponents = (
    productId: string | null | undefined,
    variantId: string | null | undefined
  ): BundleComponentSnapshot[] | null => {
    const product = findProduct(productId);
    if (!product?.is_bundle) return null;
    if (product.has_variants && !variantId) return null;
    const list = componentsFor(product.bundle_components, variantId ?? null);
    return list.length > 0 ? snapshotComponents(list) : null;
  };

  /** What a line becomes once its product is picked: a pack also brings its composition. */
  const productLine = (productId: string) => {
    const product = findProduct(productId);
    if (!product) return null;
    const components = packComponents(productId, null);
    return {
      description: product.designation,
      unit_price: product.unit_price,
      tax_rate: product.is_bundle ? commonTaxRate(components ?? []) ?? 0 : product.tax_rate,
      bundle_components: components,
    };
  };

  /** Description and price for a line once its variant is known, as the till writes them. */
  const variantLine = (productId: string, variantId: string) => {
    const product = findProduct(productId);
    const variant = product?.variants?.find((v) => v.id === variantId);
    if (!product || !variant) return null;
    const components = packComponents(productId, variantId);
    return {
      description: `${product.designation} — ${variant.name}`,
      unit_price: variant.price_override ?? product.unit_price,
      tax_rate: product.is_bundle ? commonTaxRate(components ?? []) ?? 0 : product.tax_rate,
      bundle_components: components,
    };
  };

  return {
    products,
    findProduct,
    productOptions,
    variantOptions,
    needsVariant,
    productLine,
    variantLine,
    packComponents,
    variantRequiredMessage: t("documentLines.variantRequired"),
    variantLabel: t("documentLines.variant"),
    variantPlaceholder: t("documentLines.selectVariant"),
  };
}
