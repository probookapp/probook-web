import { useMemo } from "react";
import { calculateDocumentTotals, calculateLineTotals } from "@/lib/document-totals";
import type { Product } from "@/types";

/**
 * Live totals for the quote and invoice forms.
 *
 * Two things this buys us:
 *  - the form computes with the SAME engine the server persists with
 *    (src/lib/document-totals.ts), so what you read while typing cannot drift
 *    from what gets saved;
 *  - it exposes the margin, which is what lets someone decide a discount
 *    instead of guessing. Cost comes from the product's purchase price and is
 *    never written back to the catalogue.
 */

export interface TotalsFormLine {
  product_id?: string | null;
  quantity?: number | string | null;
  unit_price?: number | string | null;
  tax_rate?: number | string | null;
  discount_percent?: number | string | null;
  group_name?: string | null;
  is_subtotal_line?: boolean | null;
}

export interface GroupSubtotal {
  beforeTax: number;
  vat: number;
  total: number;
}

export interface DocumentTotalsView {
  /** Lines before the document discount. */
  linesSubtotal: number;
  documentDiscount: number;
  /** Taxable base: lines after discounts, plus shipping. */
  subtotal: number;
  vat: number;
  total: number;
  shippingCost: number;
  shippingVat: number;
  downPayment: number;
  remaining: number;
  /** Purchase cost of the lines that reference a catalogue product. */
  cost: number;
  margin: number;
  marginPercent: number;
  /** True when at least one line has no cost, so the margin is a partial view. */
  costIncomplete: boolean;
  groupSubtotals: Record<string, GroupSubtotal>;
}

const n = (v: unknown): number => {
  const parsed = parseFloat(String(v ?? ""));
  return Number.isFinite(parsed) ? parsed : 0;
};

export function useDocumentTotals(params: {
  lines: TotalsFormLine[] | undefined;
  shippingCost?: number | string | null;
  shippingTaxRate?: number | string | null;
  discountPercent?: number | string | null;
  discountAmount?: number | string | null;
  downPaymentPercent?: number | string | null;
  downPaymentAmount?: number | string | null;
  products?: Product[];
}): DocumentTotalsView {
  const {
    lines,
    shippingCost,
    shippingTaxRate,
    discountPercent,
    discountAmount,
    downPaymentPercent,
    downPaymentAmount,
    products,
  } = params;

  return useMemo(() => {
    const rows = (lines ?? []).map((l) => ({
      product_id: l.product_id ?? null,
      quantity: n(l.quantity),
      unit_price: n(l.unit_price),
      tax_rate: n(l.tax_rate),
      discount_percent: n(l.discount_percent),
      group_name: l.group_name ?? "",
      is_subtotal_line: !!l.is_subtotal_line,
    }));

    const totals = calculateDocumentTotals({
      lines: rows,
      shippingCost: n(shippingCost),
      shippingTaxRate: n(shippingTaxRate),
      discountPercent: n(discountPercent),
      discountAmount: n(discountAmount),
    });

    // Group subtotals are a presentation device: they show what a named block of
    // lines is worth on its own, before any document-level discount.
    const groupSubtotals: Record<string, GroupSubtotal> = {};
    let cost = 0;
    let costIncomplete = false;

    for (const row of rows) {
      if (row.is_subtotal_line) continue;
      const lt = calculateLineTotals(row);

      if (row.group_name) {
        const g = (groupSubtotals[row.group_name] ??= { beforeTax: 0, vat: 0, total: 0 });
        g.beforeTax += lt.subtotal;
        g.vat += lt.taxAmount;
        g.total += lt.total;
      }

      const product = row.product_id
        ? products?.find((p) => p.id === row.product_id)
        : undefined;
      const purchasePrice = product?.purchase_price ?? 0;
      if (!product || !purchasePrice) {
        // A free-text line, or a product with no purchase price recorded.
        if (lt.subtotal > 0) costIncomplete = true;
      }
      cost += purchasePrice * row.quantity;
    }

    const goodsBase = totals.subtotal - n(shippingCost);
    const margin = goodsBase - cost;
    const marginPercent = goodsBase > 0 ? (margin / goodsBase) * 100 : 0;

    const dpAmount = n(downPaymentAmount);
    const dpPercent = n(downPaymentPercent);
    const downPayment =
      dpAmount > 0 ? dpAmount : dpPercent > 0 ? (totals.total * dpPercent) / 100 : 0;

    return {
      linesSubtotal: totals.linesSubtotal,
      documentDiscount: totals.documentDiscount,
      subtotal: totals.subtotal,
      vat: totals.taxAmount,
      total: totals.total,
      shippingCost: n(shippingCost),
      shippingVat: n(shippingCost) * (n(shippingTaxRate) / 100),
      downPayment,
      remaining: totals.total - downPayment,
      cost,
      margin,
      marginPercent,
      costIncomplete,
      groupSubtotals,
    };
  }, [
    lines,
    shippingCost,
    shippingTaxRate,
    discountPercent,
    discountAmount,
    downPaymentPercent,
    downPaymentAmount,
    products,
  ]);
}
