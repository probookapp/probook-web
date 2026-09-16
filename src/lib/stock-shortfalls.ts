import type { Product } from "@/types";

export interface StockShortfall {
  available: number;
  requested: number;
}

interface LineLike {
  product_id?: string | null;
  variant_id?: string | null;
  quantity?: unknown;
  is_subtotal_line?: boolean | null;
}

/**
 * Per line, the stock a document asks for but the shelves don't hold — or null.
 *
 * What to do with it is each document's call: a quote commits nothing (stock
 * only moves when an invoice is issued), so it only shows the shortfall; an
 * invoice or a delivery note refuses it. Lines drawing on the same stock are
 * summed, since three lines of 2 draw on one shelf of 5. The shelf is the
 * variant when the line names one — a product with variants keeps its stock per
 * variant, and a line that hasn't chosen one yet has no shelf to measure.
 * Services hold no stock.
 */
export function stockShortfalls(
  lines: ReadonlyArray<LineLike | undefined>,
  products: ReadonlyArray<Product> | undefined
): Array<StockShortfall | null> {
  if (!products) return lines.map(() => null);
  const byId = new Map(products.map((p) => [p.id, p]));

  const shelfOf = (line: LineLike | undefined): { key: string; available: number } | null => {
    if (!line?.product_id || line.is_subtotal_line) return null;
    const product = byId.get(line.product_id);
    if (!product || product.is_service) return null;
    if (!product.has_variants) return { key: product.id, available: product.quantity ?? 0 };
    const variant = line.variant_id ? product.variants?.find((v) => v.id === line.variant_id) : undefined;
    return variant ? { key: `${product.id}:${variant.id}`, available: variant.quantity ?? 0 } : null;
  };

  const shelves = lines.map(shelfOf);
  const requested = new Map<string, number>();
  lines.forEach((line, i) => {
    const shelf = shelves[i];
    if (shelf) requested.set(shelf.key, (requested.get(shelf.key) ?? 0) + (Number(line?.quantity) || 0));
  });

  return shelves.map((shelf) => {
    if (!shelf) return null;
    const total = requested.get(shelf.key) ?? 0;
    return total > shelf.available ? { available: shelf.available, requested: total } : null;
  });
}
