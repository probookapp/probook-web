import type { Product } from "@/types";
import { expandEditorLines, type EditorLine } from "./bundles";

export interface StockShortfall {
  available: number;
  requested: number;
  /** On a pack line, the component that runs short. */
  item?: string;
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
 *
 * A pack draws on its components' shelves (src/lib/bundles.ts): its line is
 * short when one of them is, and says which.
 */
export function stockShortfalls(
  lines: ReadonlyArray<EditorLine | undefined>,
  products: ReadonlyArray<Product> | undefined
): Array<StockShortfall | null> {
  if (!products) return lines.map(() => null);
  const byId = new Map(products.map((p) => [p.id, p]));

  // Every row that draws on a shelf, with the editor line it belongs to.
  const rows: Array<{ owner: number; line: EditorLine; item?: string }> = [];
  lines.forEach((line, owner) => {
    if (!line) return;
    if (line.bundle_components?.length) {
      for (const child of expandEditorLines([line], { priced: false })) {
        if (!child.is_bundle_header) rows.push({ owner, line: child, item: child.description ?? undefined });
      }
    } else {
      rows.push({ owner, line });
    }
  });

  const shelfOf = (line: EditorLine): { key: string; available: number } | null => {
    if (!line.product_id || line.is_subtotal_line) return null;
    const product = byId.get(line.product_id);
    if (!product || product.is_service || product.is_bundle) return null;
    if (!product.has_variants) return { key: product.id, available: product.quantity ?? 0 };
    const variant = line.variant_id ? product.variants?.find((v) => v.id === line.variant_id) : undefined;
    return variant ? { key: `${product.id}:${variant.id}`, available: variant.quantity ?? 0 } : null;
  };

  const shelves = rows.map((r) => shelfOf(r.line));
  const requested = new Map<string, number>();
  rows.forEach((r, i) => {
    const shelf = shelves[i];
    if (shelf) requested.set(shelf.key, (requested.get(shelf.key) ?? 0) + (Number(r.line.quantity) || 0));
  });

  const out: Array<StockShortfall | null> = lines.map(() => null);
  rows.forEach((r, i) => {
    const shelf = shelves[i];
    if (!shelf || out[r.owner]) return;
    const total = requested.get(shelf.key) ?? 0;
    if (total > shelf.available) {
      out[r.owner] = { available: shelf.available, requested: total, ...(r.item ? { item: r.item } : {}) };
    }
  });
  return out;
}
