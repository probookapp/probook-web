import { NextResponse } from "next/server";
import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import { num } from "@/lib/money";
import { getProductQuantities } from "@/lib/stock";
import {
  allocateBundlePrice,
  bundleAvailability,
  bundlePurchasePrice,
  commonTaxRate,
  componentsFor,
  isBundleChild,
  newBundleKey,
  packUnitPrice,
  type CatalogBundleComponent,
  type PricedLineInput,
} from "@/lib/bundles";

/** The fields a pack touches on any document line, priced or not. */
export interface BundleLineInput {
  product_id?: string | null;
  quantity: number;
  unit_price?: number;
  tax_rate?: number;
  discount_percent?: number;
  group_name?: string | null;
  is_subtotal_line?: boolean;
  is_bundle_header?: boolean;
  bundle_key?: string | null;
  position?: number;
}

const invalid = (error: string) =>
  NextResponse.json({ error, code: "INVALID_BUNDLE_LINES" }, { status: 400 });

/**
 * Check the pack lines of a document and put them in the shape every reader
 * relies on, or answer 400.
 *
 * What is refused: a component with no header, a header with no component, two
 * headers on one key, a header that is not one of this business's packs, a pack
 * sold as a component of another or on a plain line, a subtotal row inside a
 * pack.
 *
 * What is normalised rather than trusted: each header is followed directly by
 * its own components; the components take the header's discount and group;
 * and on a priced document the header's unit price and VAT rate are what its
 * components add up to (the rate is left at 0 when theirs differ). The client
 * computes the same thing (src/lib/bundles.ts), so an honest request comes out
 * unchanged.
 *
 * The composition itself is not compared to the catalogue: a document keeps
 * the pack as it was sold, and its prices were always the client's to set.
 */
export async function normalizeBundleLines<L extends BundleLineInput>(
  tenantId: string,
  lines: L[],
  opts: { priced: boolean }
): Promise<L[] | NextResponse> {
  if (!lines.some((l) => l.is_bundle_header || l.bundle_key)) {
    // No pack on this document, as far as the lines say. A pack named on a
    // plain line would be sold without its components: nothing would leave the
    // shelves and its VAT would be charged at whatever rate the line carries.
    const packs = await bundleProductIds(tenantId, lines.map((l) => l.product_id));
    return packs.size > 0 ? invalid("A pack must be sold with its components") : lines;
  }

  const headers = new Map<string, L>();
  for (const line of lines) {
    if (!line.is_bundle_header) continue;
    if (!line.bundle_key) return invalid("A pack line has no bundle key");
    if (headers.has(line.bundle_key)) return invalid("Two pack lines share one bundle key");
    if (line.is_subtotal_line) return invalid("A pack line cannot be a subtotal line");
    if (!line.product_id) return invalid("A pack line must name its pack");
    headers.set(line.bundle_key, line);
  }

  const childrenOf = new Map<string, L[]>();
  for (const line of lines) {
    if (!isBundleChild(line)) continue;
    const key = line.bundle_key as string;
    if (!headers.has(key)) return invalid("A pack component has no pack line");
    if (line.is_subtotal_line) return invalid("A pack component cannot be a subtotal line");
    const list = childrenOf.get(key) ?? [];
    list.push(line);
    childrenOf.set(key, list);
  }
  for (const key of headers.keys()) {
    if (!childrenOf.has(key)) return invalid("A pack line has no components");
  }

  // Headers must be this business's packs; components must not be packs.
  const headerProductIds = Array.from(new Set(Array.from(headers.values()).map((h) => h.product_id as string)));
  const childProductIds = Array.from(
    new Set(
      Array.from(childrenOf.values())
        .flat()
        .map((c) => c.product_id)
        .filter((id): id is string => !!id)
    )
  );
  const products = await prisma.product.findMany({
    where: { tenantId, id: { in: [...headerProductIds, ...childProductIds] } },
    select: { id: true, isBundle: true },
  });
  const isBundle = new Map(products.map((p) => [p.id, p.isBundle]));
  if (headerProductIds.some((id) => isBundle.get(id) !== true)) {
    return invalid("A pack line names a product that is not a pack");
  }
  if (childProductIds.some((id) => isBundle.get(id) === true)) {
    return invalid("A pack cannot contain another pack");
  }
  const plainPacks = await bundleProductIds(
    tenantId,
    lines.filter((l) => !l.is_bundle_header && !l.bundle_key).map((l) => l.product_id)
  );
  if (plainPacks.size > 0) return invalid("A pack must be sold with its components");

  const out: L[] = [];
  for (const line of lines) {
    if (isBundleChild(line)) continue;
    if (!line.is_bundle_header) {
      out.push(line);
      continue;
    }
    const children = (childrenOf.get(line.bundle_key as string) ?? []).map((c) => ({
      ...c,
      discount_percent: line.discount_percent ?? 0,
      group_name: line.group_name ?? null,
    }));
    if (opts.priced) {
      const packQty = line.quantity > 0 ? line.quantity : 1;
      const perPack = children.reduce((s, c) => s + (c.unit_price ?? 0) * c.quantity, 0) / packQty;
      out.push({
        ...line,
        unit_price: Math.round(perPack * 1000) / 1000,
        tax_rate: commonTaxRate(children) ?? 0,
      });
    } else {
      out.push(line);
    }
    out.push(...children);
  }
  // The order is now the document's order; positions sent by the client no
  // longer describe it once components have been regrouped under their header.
  return out.map((l, i) => ({ ...l, position: i }));
}

/** The product ids on these lines that are packs (a pack holds no stock). */
export async function bundleProductIds(
  tenantId: string,
  productIds: ReadonlyArray<string | null | undefined>
): Promise<Set<string>> {
  const ids = Array.from(new Set(productIds.filter((id): id is string => !!id)));
  if (ids.length === 0) return new Set();
  const rows = await prisma.product.findMany({
    where: { tenantId, id: { in: ids }, isBundle: true },
    select: { id: true },
  });
  return new Set(rows.map((r) => r.id));
}

type Db = Prisma.TransactionClient | typeof prisma;

/**
 * The compositions of these packs, as the catalogue lists them: each component
 * with what the editors and the till need to price and show it. Variant prices
 * follow the variant's own override, the way a line sold on its own would.
 */
export async function loadBundleComponents(
  db: Db,
  tenantId: string,
  bundleIds: ReadonlyArray<string>
): Promise<Map<string, CatalogBundleComponent[]>> {
  const out = new Map<string, CatalogBundleComponent[]>();
  if (bundleIds.length === 0) return out;
  const rows = await db.bundleComponent.findMany({
    where: { tenantId, bundleId: { in: Array.from(bundleIds) } },
    orderBy: [{ position: "asc" }, { createdAt: "asc" }],
    include: {
      product: {
        select: {
          designation: true,
          unitPrice: true,
          taxRate: true,
          unit: true,
          isService: true,
          purchasePrice: true,
        },
      },
      variant: { select: { name: true, priceOverride: true } },
    },
  });
  for (const r of rows) {
    const list = out.get(r.bundleId) ?? [];
    list.push({
      product_id: r.productId,
      variant_id: r.variantId,
      bundle_variant_id: r.bundleVariantId,
      quantity: r.quantity,
      designation: r.product.designation,
      variant_name: r.variant?.name ?? null,
      unit_price: num(r.variant?.priceOverride ?? r.product.unitPrice),
      tax_rate: r.product.taxRate,
      unit: r.product.unit,
      is_service: r.product.isService,
      purchase_price: num(r.product.purchasePrice),
    });
    out.set(r.bundleId, list);
  }
  return out;
}

/**
 * Attach to every pack in a product list its composition, what one costs to
 * put together, and how many the shelves can make up (per variant too). A pack
 * has no stock row of its own, so without this its count would read 0 forever.
 */
export async function withBundleDetails<
  P extends { id: string; isBundle: boolean; quantity: number | null; variants?: unknown },
>(db: Db, tenantId: string, products: P[]): Promise<P[]> {
  const packs = products.filter((p) => p.isBundle);
  if (packs.length === 0) return products;

  const components = await loadBundleComponents(db, tenantId, packs.map((p) => p.id));
  const all = Array.from(components.values()).flat();
  const { byProduct, byVariant } = await getProductQuantities(db, tenantId, {
    productIds: Array.from(new Set(all.map((c) => c.product_id))),
  });
  const onHand = (productId: string, variantId: string | null) =>
    variantId ? byVariant.get(variantId) ?? 0 : byProduct.get(productId) ?? 0;

  return products.map((p) => {
    if (!p.isBundle) return p;
    const list = components.get(p.id) ?? [];
    const base = componentsFor(list, null);
    return {
      ...p,
      bundleComponents: list,
      quantity: bundleAvailability(base, onHand),
      purchasePrice: bundlePurchasePrice(base),
      ...(Array.isArray(p.variants)
        ? {
            variants: (p.variants as Array<{ id: string }>).map((v) => ({
              ...v,
              quantity: bundleAvailability(componentsFor(list, v.id), onHand),
            })),
          }
        : {}),
    };
  });
}

/**
 * For the routes that move stock by hand (purchases, transfers, adjustments):
 * refuse a product this business does not own, and refuse a pack, which has no
 * shelf to fill. Its components are bought and moved on their own.
 */
export async function rejectUnstockableProducts(
  tenantId: string,
  productIds: ReadonlyArray<string | null | undefined>
): Promise<NextResponse | null> {
  const ids = Array.from(new Set(productIds.filter((id): id is string => !!id)));
  if (ids.length === 0) return null;
  const rows = await prisma.product.findMany({
    where: { tenantId, id: { in: ids } },
    select: { id: true, isBundle: true },
  });
  if (rows.length !== ids.length) {
    return NextResponse.json({ error: "One or more products do not exist" }, { status: 400 });
  }
  if (rows.some((r) => r.isBundle)) {
    return NextResponse.json(
      { error: "A pack holds no stock: buy or move its components instead", code: "BUNDLE_NO_STOCK" },
      { status: 400 }
    );
  }
  return null;
}

interface DeliveryLine {
  productId: string | null;
  variantId: string | null;
  description: string;
  descriptionHtml: string | null;
  quantity: number;
  isBundleHeader: boolean;
  bundleKey: string | null;
}

/**
 * Price delivery-note lines for the invoice that bills them. A delivery note
 * carries quantities only, so every price comes from the catalogue: a
 * variant's own price when it has one, as at the till. A pack is billed at its
 * catalogue price, split between its components in proportion to theirs.
 *
 * Each note's packs get a fresh key: several notes are billed on one invoice,
 * and a duplicated note shares its original's keys.
 *
 * Answers 400 for a line that names no product (nothing to price it from:
 * billing it at 0 would under-bill without saying so) or a product that no
 * longer exists.
 */
export async function priceDeliveryNoteLines(
  tenantId: string,
  notes: ReadonlyArray<{ lines: ReadonlyArray<DeliveryLine> }>,
  opts: { defaultTaxRate: number; currency?: string | null }
): Promise<PricedLineInput[] | NextResponse> {
  const all = notes.flatMap((n) => n.lines);
  const unpriceable = all.filter((l) => !l.productId);
  if (unpriceable.length > 0) {
    return NextResponse.json(
      {
        error:
          "These delivery note lines have no product to price them from: " +
          unpriceable.map((l) => l.description).join(", "),
      },
      { status: 400 }
    );
  }

  const productIds = Array.from(new Set(all.map((l) => l.productId as string)));
  const products = await prisma.product.findMany({
    where: { tenantId, id: { in: productIds } },
    select: { id: true, unitPrice: true, taxRate: true },
  });
  const productById = new Map(products.map((p) => [p.id, p]));
  if (productIds.some((id) => !productById.has(id))) {
    return NextResponse.json(
      { error: "One or more products on the delivery note no longer exist" },
      { status: 400 }
    );
  }
  const variantIds = Array.from(new Set(all.map((l) => l.variantId).filter((id): id is string => !!id)));
  const variants = variantIds.length
    ? await prisma.productVariant.findMany({
        where: { tenantId, id: { in: variantIds } },
        select: { id: true, priceOverride: true },
      })
    : [];
  const variantById = new Map(variants.map((v) => [v.id, v]));

  const catalogPrice = (l: DeliveryLine) =>
    num((l.variantId ? variantById.get(l.variantId)?.priceOverride : null) ?? productById.get(l.productId as string)?.unitPrice);
  const taxOf = (l: DeliveryLine) => productById.get(l.productId as string)?.taxRate ?? opts.defaultTaxRate;
  const plain = (l: DeliveryLine): PricedLineInput => ({
    product_id: l.productId,
    variant_id: l.variantId,
    description: l.description,
    description_html: l.descriptionHtml,
    quantity: l.quantity,
    unit_price: catalogPrice(l),
    tax_rate: taxOf(l),
    is_bundle_header: false,
    bundle_key: null,
  });

  const out: PricedLineInput[] = [];
  for (const note of notes) {
    const headerKeys = new Set(note.lines.filter((l) => l.isBundleHeader && l.bundleKey).map((l) => l.bundleKey));
    for (const line of note.lines) {
      const inPack = !!line.bundleKey && headerKeys.has(line.bundleKey);
      if (inPack && !line.isBundleHeader) continue;
      if (!inPack) {
        out.push(plain(line));
        continue;
      }
      const children = note.lines.filter((l) => !l.isBundleHeader && l.bundleKey === line.bundleKey);
      const packQty = line.quantity > 0 ? line.quantity : 1;
      const components = children.map((c) => ({ quantity: c.quantity / packQty, unit_price: catalogPrice(c) }));
      const shares = allocateBundlePrice(catalogPrice(line), components, opts.currency);
      const key = newBundleKey();
      const priced = children.map((c, i) => ({ ...plain(c), unit_price: shares[i], bundle_key: key }));
      out.push({
        ...plain(line),
        unit_price: packUnitPrice(components.map((c, i) => ({ quantity: c.quantity, unit_price: shares[i] }))),
        tax_rate: commonTaxRate(priced) ?? 0,
        is_bundle_header: true,
        bundle_key: key,
      });
      out.push(...priced);
    }
  }
  return out.map((l, position) => ({ ...l, position }));
}
