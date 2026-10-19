import type { Product } from "@/types";

/**
 * What is on the shelf for a product, as a list or the till should show it.
 *
 * A product's `quantity` is its product-level stock only (see
 * getProductQuantities in src/lib/stock.ts). With variants the stock is held
 * on the variants and that figure is zero — so the products list showed a red
 * "0" and the till "Out of stock" for a product with forty units on hand.
 * `null` means a pack of services only: no limit.
 */
export function productOnHand(product: Product): number | null {
  if (product.has_variants) return product.variants_quantity ?? 0;
  return product.quantity;
}
