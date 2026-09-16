import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { productApi } from "@/lib/api";
import { useDemoMode } from "@/components/providers/DemoModeProvider";
import { DEMO_PRODUCTS } from "@/lib/demo-data";
import type { Product, ProductVariant } from "@/types";

export interface CatalogOption {
  value: string;
  label: string;
}

/** Stock on hand for a product: its own count, or the sum of its variants'. */
export function onHand(product: Product): number {
  if (!product.has_variants) return product.quantity ?? 0;
  return (product.variants ?? [])
    .filter((v) => v.is_active)
    .reduce((sum, v) => sum + (v.quantity ?? 0), 0);
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
    quantity > 0 ? ` (${quantity})` : ` (${t("documentLines.outOfStock")})`;

  const productOptions = (placeholder: string): CatalogOption[] => [
    { value: "", label: placeholder },
    ...(products ?? [])
      .filter((p) => !opts.hideOutOfStock || p.is_service || onHand(p) > 0)
      .map((p) => ({
        value: p.id,
        label: `${p.reference ? `[${p.reference}] ` : ""}${p.designation}${p.barcode ? ` - ${p.barcode}` : ""}${
          p.is_service ? "" : stockLabel(onHand(p))
        }`,
      })),
  ];

  const activeVariants = (productId: string | null | undefined): ProductVariant[] => {
    const product = findProduct(productId);
    return product?.has_variants ? (product.variants ?? []).filter((v) => v.is_active) : [];
  };

  const variantOptions = (productId: string | null | undefined): CatalogOption[] =>
    activeVariants(productId)
      .filter((v) => !opts.hideOutOfStock || (v.quantity ?? 0) > 0)
      .map((v) => ({ value: v.id, label: `${v.name}${stockLabel(v.quantity ?? 0)}` }));

  /** A product with variants is not a sellable line until one is chosen. */
  const needsVariant = (line: { product_id?: string | null; variant_id?: string | null } | undefined) =>
    !!line?.product_id && activeVariants(line.product_id).length > 0 && !line.variant_id;

  /** Description and price for a line once its variant is known, as the till writes them. */
  const variantLine = (productId: string, variantId: string) => {
    const product = findProduct(productId);
    const variant = product?.variants?.find((v) => v.id === variantId);
    if (!product || !variant) return null;
    return {
      description: `${product.designation} — ${variant.name}`,
      unit_price: variant.price_override ?? product.unit_price,
    };
  };

  return {
    products,
    findProduct,
    productOptions,
    variantOptions,
    needsVariant,
    variantLine,
    variantRequiredMessage: t("documentLines.variantRequired"),
    variantLabel: t("documentLines.variant"),
    variantPlaceholder: t("documentLines.selectVariant"),
  };
}
