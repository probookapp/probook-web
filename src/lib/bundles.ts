/**
 * Packs on documents: one place for how a pack becomes lines and back.
 *
 * A pack is sold as one offer ("Pack caméra", 25 000 HT) but what leaves the
 * shelves, and what the VAT is charged on, are its components. So a document
 * carries a pack as:
 *
 *     header   Pack caméra × 2 ............ (presentation, no value of its own)
 *     child    Caméra × 2      at its share of the pack price, its own VAT rate
 *     child    Fiche × 8       ...
 *     child    Pose × 2        ...
 *
 * all sharing one `bundle_key`. The children are ordinary lines: totals, the
 * VAT breakdown, the integrity hash, the stock taken out at issue and the cost
 * snapshot all read them like any other line. The header is excluded wherever
 * a value is summed, exactly like a subtotal row.
 *
 * Editors and the till never handle children directly. They hold one line per
 * pack with its composition attached (`bundle_components`), expand it into
 * header + children when they compute or save, and collapse a saved document
 * back the same way. Nothing here touches the database: the server checks and
 * normalises what arrives in src/lib/bundles-server.ts.
 */

import { calculateLineTotals, type LineTotals, type MoneyCurrency } from "./document-totals";
import { currencyMinorUnits } from "./money";
import { DEFAULT_CURRENCY } from "./currencies";

/** One component of a pack line, as an editor holds it. */
export interface BundleComponentSnapshot {
  product_id: string;
  variant_id: string | null;
  description: string;
  /** How many go into ONE pack. */
  quantity: number;
  /**
   * Pre-tax unit price. When the pack is picked from the catalogue this is the
   * component's own price, used as the weight of the split; once the pack is on
   * a document it is the component's share of the pack price.
   */
  unit_price: number;
  tax_rate: number;
  unit?: string | null;
}

/** What a pack is made of, as the catalogue lists it. */
export interface CatalogBundleComponent {
  product_id: string;
  variant_id: string | null;
  /** The pack's own variant this component belongs to; null for a pack without variants. */
  bundle_variant_id: string | null;
  quantity: number;
  designation: string;
  variant_name: string | null;
  unit_price: number;
  tax_rate: number;
  unit: string | null;
  is_service: boolean;
  purchase_price: number;
}

interface BundleFlags {
  is_subtotal_line?: boolean | null;
  is_bundle_header?: boolean | null;
  bundle_key?: string | null;
}

export const isBundleHeader = (line: BundleFlags | null | undefined): boolean =>
  !!line?.is_bundle_header;

/** A component line of a pack on a document. */
export const isBundleChild = (line: BundleFlags | null | undefined): boolean =>
  !!line?.bundle_key && !line.is_bundle_header;

/** Rows that carry no value of their own: subtotal rows and pack headers. */
export const isPresentationLine = (line: BundleFlags | null | undefined): boolean =>
  !!line?.is_subtotal_line || !!line?.is_bundle_header;

/**
 * The components of one pack, or of one of its variants, in their saved order.
 * On a pack with variants, a component listed for no variant in particular
 * belongs to all of them: the fitting is the same whichever camera is chosen.
 */
export function componentsFor<C extends Pick<CatalogBundleComponent, "bundle_variant_id">>(
  components: ReadonlyArray<C> | null | undefined,
  bundleVariantId: string | null | undefined
): C[] {
  return (components ?? []).filter(
    (c) => !c.bundle_variant_id || c.bundle_variant_id === (bundleVariantId ?? null)
  );
}

/** A catalogue composition as an editor line holds it. */
export function snapshotComponents(
  components: ReadonlyArray<CatalogBundleComponent>
): BundleComponentSnapshot[] {
  return components.map((c) => ({
    product_id: c.product_id,
    variant_id: c.variant_id,
    description: c.variant_name ? `${c.designation} — ${c.variant_name}` : c.designation,
    quantity: c.quantity,
    unit_price: c.unit_price,
    tax_rate: c.tax_rate,
    unit: c.unit,
  }));
}

/**
 * Split a pack's pre-tax unit price between its components, in proportion to
 * what each would cost on its own (unit price x quantity per pack).
 *
 * Every share is a whole number of the currency's minor unit, so each
 * component line is exact on its own. What rounding leaves over goes to a
 * component that comes once per pack, so the shares add back up to the pack
 * price to the centime (or millime). Only a pack whose components all come in
 * several can be left a minor unit or two short, and the header then shows the
 * sum of its lines, which is what the customer is charged.
 *
 * Components that are all free split the price by quantity instead.
 */
export function allocateBundlePrice(
  packPrice: number,
  components: ReadonlyArray<Pick<BundleComponentSnapshot, "quantity" | "unit_price">>,
  currency?: MoneyCurrency
): number[] {
  if (components.length === 0) return [];
  const factor = 10 ** currencyMinorUnits(currency ?? DEFAULT_CURRENCY);
  const total = Math.max(0, Math.round(packPrice * factor));
  const qty = components.map((c) => (c.quantity > 0 ? c.quantity : 1));

  let weights = components.map((c, i) => Math.max(0, c.unit_price) * qty[i]);
  if (weights.every((w) => w === 0)) weights = qty.slice();
  const weightSum = weights.reduce((s, w) => s + w, 0);

  // Each component's share of one pack, in minor units, adding up to `total`.
  const values = weights.map((w) => Math.round((total * w) / weightSum));
  const heaviest = weights.indexOf(Math.max(...weights));
  values[heaviest] += total - values.reduce((s, v) => s + v, 0);

  // Back to a unit price, which must itself be a whole minor unit.
  const units = values.map((v, i) => Math.max(0, Math.round(v / qty[i])));
  const residual = total - units.reduce((s, u, i) => s + u * qty[i], 0);
  if (residual !== 0) {
    const order = weights
      .map((w, i) => ({ w, i }))
      .sort((a, b) => b.w - a.w)
      .map((x) => x.i);
    const absorber =
      order.find((i) => qty[i] === 1 && units[i] + residual >= 0) ??
      order.find((i) => Number.isInteger(residual / qty[i]) && units[i] + residual / qty[i] >= 0);
    if (absorber !== undefined) units[absorber] += residual / qty[absorber];
  }

  return units.map((u) => u / factor);
}

/** The single VAT rate a pack's components share, or null when they differ. */
export function commonTaxRate(children: ReadonlyArray<{ tax_rate?: number | null }>): number | null {
  if (children.length === 0) return null;
  const first = Number(children[0].tax_rate ?? 0);
  return children.every((c) => Number(c.tax_rate ?? 0) === first) ? first : null;
}

/** A pack's effective pre-tax unit price: what its components add up to per pack. */
export function packUnitPrice(
  components: ReadonlyArray<Pick<BundleComponentSnapshot, "quantity" | "unit_price">>
): number {
  const sum = components.reduce((s, c) => s + c.unit_price * c.quantity, 0);
  return Math.round(sum * 1000) / 1000;
}

/** A form line: whatever the editor holds, with an optional pack composition. */
export interface EditorLine {
  product_id?: string | null;
  variant_id?: string | null;
  description?: string | null;
  quantity?: number | string | null;
  unit_price?: number | string | null;
  tax_rate?: number | string | null;
  discount_percent?: number | string | null;
  group_name?: string | null;
  is_subtotal_line?: boolean | null;
  is_bundle_header?: boolean | null;
  bundle_key?: string | null;
  bundle_components?: BundleComponentSnapshot[] | null;
}

const toNumber = (v: unknown): number => {
  const n = parseFloat(String(v ?? ""));
  return Number.isFinite(n) ? n : 0;
};

/** A key that ties a pack's header to its components within one document. */
export function newBundleKey(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `b-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/** A saved line: the composition is gone, the pack flags are always set. */
export type ExpandedLine<L> = Omit<L, "bundle_components"> & {
  is_bundle_header: boolean;
  bundle_key: string | null;
};

/**
 * Editor lines → the lines a document is saved with: every pack line becomes
 * its header followed by its components, each priced at its share of the
 * pack. `priced: false` is for delivery notes, which carry quantities only.
 *
 * The header keeps the pack price the user typed only as far as the split can
 * honour it: its unit price is what the components add up to, so the line and
 * its detail can never disagree on paper.
 */
export function expandEditorLines<L extends EditorLine>(
  lines: ReadonlyArray<L>,
  opts: { currency?: MoneyCurrency; priced?: boolean } = {}
): Array<ExpandedLine<L>> {
  const priced = opts.priced ?? true;
  const out: Array<ExpandedLine<L>> = [];

  for (const line of lines) {
    const { bundle_components: components, ...rest } = line;
    if (!components || components.length === 0 || !line.product_id) {
      out.push({ ...rest, is_bundle_header: false, bundle_key: null } as ExpandedLine<L>);
      continue;
    }

    const key = line.bundle_key || newBundleKey();
    const packQty = toNumber(line.quantity);
    const shares = priced
      ? allocateBundlePrice(toNumber(line.unit_price), components, opts.currency)
      : components.map(() => 0);
    const children = components.map((c, i) => ({
      product_id: c.product_id,
      variant_id: c.variant_id,
      description: c.description,
      description_html: null,
      quantity: roundQuantity(packQty * c.quantity),
      unit_price: shares[i],
      tax_rate: c.tax_rate,
      unit: c.unit ?? undefined,
      discount_percent: line.discount_percent ?? 0,
      group_name: line.group_name ?? null,
      is_subtotal_line: false,
      is_bundle_header: false,
      bundle_key: key,
    }));

    out.push({
      ...rest,
      ...(priced
        ? {
            unit_price: packUnitPrice(components.map((c, i) => ({ quantity: c.quantity, unit_price: shares[i] }))),
            tax_rate: commonTaxRate(children) ?? 0,
          }
        : {}),
      is_subtotal_line: false,
      is_bundle_header: true,
      bundle_key: key,
    } as ExpandedLine<L>);
    for (const child of children) out.push(child as unknown as ExpandedLine<L>);
  }
  return out;
}

/** Quantities multiply (2 packs x 0.5 m); keep them free of float noise. */
const roundQuantity = (q: number) => Math.round(q * 1e6) / 1e6;

/**
 * Saved lines → editor lines: each pack header takes its components back as
 * `bundle_components`, and the component lines disappear from the list. A
 * component whose header is missing (a document edited outside the app) is
 * kept as an ordinary line rather than lost.
 */
export function collapseDocumentLines<L extends EditorLine>(
  lines: ReadonlyArray<L>
): Array<L & { bundle_components: BundleComponentSnapshot[] | null }> {
  const headers = new Map<string, L>();
  for (const line of lines) {
    if (line.is_bundle_header && line.bundle_key) headers.set(line.bundle_key, line);
  }

  const childrenOf = new Map<string, L[]>();
  for (const line of lines) {
    if (isBundleChild(line) && headers.has(line.bundle_key as string)) {
      const list = childrenOf.get(line.bundle_key as string) ?? [];
      list.push(line);
      childrenOf.set(line.bundle_key as string, list);
    }
  }

  const out: Array<L & { bundle_components: BundleComponentSnapshot[] | null }> = [];
  for (const line of lines) {
    if (isBundleChild(line) && headers.has(line.bundle_key as string)) continue;
    if (line.is_bundle_header && line.bundle_key) {
      const packQty = toNumber(line.quantity) || 1;
      const children = childrenOf.get(line.bundle_key) ?? [];
      out.push({
        ...line,
        bundle_components: children.map((c) => ({
          product_id: c.product_id as string,
          variant_id: c.variant_id ?? null,
          description: c.description ?? "",
          quantity: roundQuantity(toNumber(c.quantity) / packQty),
          unit_price: toNumber(c.unit_price),
          tax_rate: toNumber(c.tax_rate),
          unit: (c as { unit?: string | null }).unit ?? null,
        })),
      });
      continue;
    }
    out.push({
      ...line,
      is_bundle_header: false,
      bundle_key: isBundleChild(line) ? null : line.bundle_key ?? null,
      bundle_components: null,
    });
  }
  return out;
}

/**
 * Line totals for a whole document, header rows included: a pack header is
 * worth what its components add up to. That is what it prints and what the
 * pack-level reports read; the document's own totals still skip it.
 */
export function documentLineTotals(
  lines: ReadonlyArray<{
    quantity: number;
    unit_price: number;
    tax_rate: number;
    discount_percent?: number | null;
    is_subtotal_line?: boolean | null;
    is_bundle_header?: boolean | null;
    bundle_key?: string | null;
  }>,
  currency?: MoneyCurrency
): LineTotals[] {
  const own = lines.map((l) =>
    l.is_bundle_header ? null : calculateLineTotals(l, currency)
  );
  const byKey = new Map<string, LineTotals>();
  lines.forEach((l, i) => {
    const t = own[i];
    if (!t || !isBundleChild(l)) return;
    const acc = byKey.get(l.bundle_key as string) ?? { subtotal: 0, taxAmount: 0, total: 0, discount: 0 };
    byKey.set(l.bundle_key as string, {
      subtotal: acc.subtotal + t.subtotal,
      taxAmount: acc.taxAmount + t.taxAmount,
      total: acc.total + t.total,
      discount: acc.discount + t.discount,
    });
  });
  const tidy = (n: number) => Math.round(n * 1000) / 1000;
  return lines.map((l, i) => {
    if (!l.is_bundle_header) return own[i] as LineTotals;
    const sum = byKey.get(l.bundle_key ?? "") ?? { subtotal: 0, taxAmount: 0, total: 0, discount: 0 };
    return {
      subtotal: tidy(sum.subtotal),
      taxAmount: tidy(sum.taxAmount),
      total: tidy(sum.total),
      discount: tidy(sum.discount),
    };
  });
}

/**
 * How many packs the shelves can make up: the scarcest stocked component
 * decides. Services hold no stock and never limit a pack; a pack made only of
 * services is unlimited (null).
 */
export function bundleAvailability(
  components: ReadonlyArray<Pick<CatalogBundleComponent, "product_id" | "variant_id" | "quantity" | "is_service">>,
  onHand: (productId: string, variantId: string | null) => number
): number | null {
  let available: number | null = null;
  for (const c of components) {
    if (c.is_service || c.quantity <= 0) continue;
    const packs = Math.max(0, Math.floor(onHand(c.product_id, c.variant_id) / c.quantity + 1e-9));
    available = available === null ? packs : Math.min(available, packs);
  }
  return available;
}

/** What one pack costs to put together, from its components' purchase prices. */
export function bundlePurchasePrice(
  components: ReadonlyArray<Pick<CatalogBundleComponent, "quantity" | "purchase_price">>
): number {
  const sum = components.reduce((s, c) => s + (c.purchase_price || 0) * c.quantity, 0);
  return Math.round(sum * 1000) / 1000;
}

/** A priced document line as the quote and invoice routes receive it. */
export interface PricedLineInput {
  product_id?: string | null;
  variant_id?: string | null;
  description: string;
  description_html?: string | null;
  quantity: number;
  unit_price: number;
  tax_rate: number;
  position?: number;
  group_name?: string | null;
  is_subtotal_line?: boolean | null;
  discount_percent?: number | null;
  is_bundle_header?: boolean | null;
  bundle_key?: string | null;
}

/**
 * The rows a quote or an invoice stores for its lines, with each line's totals
 * computed in the document's currency. A pack header is stored at what its
 * components add up to, so it prints and reports as the pack it is.
 */
export function documentLineRows(lines: ReadonlyArray<PricedLineInput>, currency?: MoneyCurrency) {
  const totals = documentLineTotals(lines, currency);
  return lines.map((line, idx) => ({
    productId: line.product_id || null,
    variantId: line.variant_id || null,
    description: line.description,
    descriptionHtml: line.description_html || null,
    quantity: line.quantity,
    unitPrice: line.unit_price,
    taxRate: line.tax_rate,
    subtotal: totals[idx].subtotal,
    taxAmount: totals[idx].taxAmount,
    total: totals[idx].total,
    position: line.position ?? idx,
    groupName: line.group_name || null,
    discountPercent: line.discount_percent || 0,
    isSubtotalLine: line.is_subtotal_line || false,
    isBundleHeader: line.is_bundle_header || false,
    bundleKey: line.bundle_key || null,
  }));
}

/**
 * What one editor line is worth: a pack line is valued through its components,
 * each at its own VAT rate, exactly as it will be saved.
 */
export function editorLineTotals(line: EditorLine, currency?: MoneyCurrency): LineTotals {
  const rows = expandEditorLines([line], { currency }).map((l) => ({
    quantity: toNumber(l.quantity),
    unit_price: toNumber(l.unit_price),
    tax_rate: toNumber(l.tax_rate),
    discount_percent: toNumber(l.discount_percent),
    is_bundle_header: l.is_bundle_header,
    bundle_key: l.bundle_key,
  }));
  return documentLineTotals(rows, currency)[0];
}

export type BundleRole = "plain" | "header" | "child";

/**
 * How each saved line reads on screen and on paper: a pack header, one of its
 * components, or an ordinary line. `mixedRates` says the pack's components do
 * not share one VAT rate, which is when the header has no rate of its own and
 * the components show their share of the price, the base each rate is charged on.
 */
export function bundleRoles(
  lines: ReadonlyArray<{ is_bundle_header?: boolean | null; bundle_key?: string | null; tax_rate?: number | null }>
): Array<{ role: BundleRole; mixedRates: boolean }> {
  const headers = new Set(lines.filter((l) => l.is_bundle_header && l.bundle_key).map((l) => l.bundle_key as string));
  const rates = new Map<string, Set<number>>();
  for (const l of lines) {
    if (!isBundleChild(l) || !headers.has(l.bundle_key as string)) continue;
    const set = rates.get(l.bundle_key as string) ?? new Set<number>();
    set.add(Number(l.tax_rate ?? 0));
    rates.set(l.bundle_key as string, set);
  }
  return lines.map((l) => {
    const key = l.bundle_key ?? "";
    if (!headers.has(key)) return { role: "plain" as const, mixedRates: false };
    return {
      role: l.is_bundle_header ? ("header" as const) : ("child" as const),
      mixedRates: (rates.get(key)?.size ?? 0) > 1,
    };
  });
}

/**
 * What a till line comes to, before rounding: the till computes in raw
 * figures, as its route does (src/app/api/pos/transactions/route.ts). A pack is
 * valued through its components, each at its own VAT rate.
 */
export function tillLineAmounts(
  item: {
    quantity: number;
    unitPrice: number;
    taxRate: number;
    discountPercent: number;
    bundleComponents?: ReadonlyArray<BundleComponentSnapshot> | null;
  },
  currency?: MoneyCurrency
): { ht: number; vat: number } {
  const kept = 1 - (item.discountPercent || 0) / 100;
  if (!item.bundleComponents?.length) {
    const ht = item.quantity * item.unitPrice * kept;
    return { ht, vat: (ht * item.taxRate) / 100 };
  }
  const shares = allocateBundlePrice(item.unitPrice, item.bundleComponents, currency);
  return item.bundleComponents.reduce(
    (acc, c, i) => {
      const ht = roundQuantity(item.quantity * c.quantity) * shares[i] * kept;
      return { ht: acc.ht + ht, vat: acc.vat + (ht * c.tax_rate) / 100 };
    },
    { ht: 0, vat: 0 }
  );
}

/**
 * The variants of a product that can be sold: all of them for an ordinary
 * product, and for a pack only those with something in them.
 */
export function sellableVariants<V extends { id: string; is_active: boolean }>(product: {
  is_bundle?: boolean;
  variants?: V[];
  bundle_components?: ReadonlyArray<Pick<CatalogBundleComponent, "bundle_variant_id">>;
}): V[] {
  const active = (product.variants ?? []).filter((v) => v.is_active);
  return product.is_bundle ? active.filter((v) => componentsFor(product.bundle_components, v.id).length > 0) : active;
}

/** A pack nothing has been put in yet (for any of its variants) cannot be sold. */
export function isEmptyPack(product: {
  is_bundle?: boolean;
  has_variants?: boolean;
  variants?: Array<{ id: string; is_active: boolean }>;
  bundle_components?: ReadonlyArray<Pick<CatalogBundleComponent, "bundle_variant_id">>;
}): boolean {
  if (!product.is_bundle) return false;
  if (!product.has_variants) return (product.bundle_components ?? []).length === 0;
  return sellableVariants(product).length === 0;
}
