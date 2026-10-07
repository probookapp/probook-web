import { NextResponse } from "next/server";
import { withAuth, toSnakeCase } from "@/lib/api-utils";
import { requirePermission } from "@/lib/permissions-server";
import { prisma } from "@/lib/db";
import { getProductQuantities } from "@/lib/stock";

/**
 * What the quotes on the table promise and the shelves cannot cover.
 *
 * A quote commits no stock — that is why one can be written for goods that have
 * run out. The cost of that freedom is that nobody sees the shortfall until the
 * client accepts and the order has to be filled. This answers the question that
 * follows: what do I need to buy, and for whom.
 *
 * Which quotes count:
 *  - draft, sent and accepted. An expired quote asks for nothing;
 *  - not archived — putting a document away is saying it is done with;
 *  - not already invoiced. The invoice carries the commitment from then on, and
 *    issuing it takes the goods out of stock: counting both would order twice.
 *
 * Stock lives per variant when a product has them, so a line that never said
 * which variant is skipped rather than guessed at — see src/lib/stock.ts.
 */
const LIVE_STATUSES = ["DRAFT", "SENT", "ACCEPTED"];

interface Shortfall {
  productId: string;
  designation: string;
  reference: string | null;
  unit: string;
  variantId: string | null;
  variantName: string | null;
  /** Summed over every live quote line drawing on this shelf. */
  quantityQuoted: number;
  quantityInStock: number;
  /** What has to be bought to honour them all. */
  missing: number;
  quotes: {
    id: string;
    quoteNumber: string;
    status: string;
    clientName: string;
    quantity: number;
  }[];
}

export const GET = withAuth(async (req, { tenantId, session }) => {
  const denied = await requirePermission(session, "quotes", "view");
  if (denied) return denied;

  const quotes = await prisma.quote.findMany({
    where: {
      tenantId,
      archivedAt: null,
      status: { in: LIVE_STATUSES },
      invoices: { none: {} },
    },
    select: {
      id: true,
      quoteNumber: true,
      status: true,
      client: { select: { name: true } },
      lines: {
        // A pack header asks for nothing itself: its components are the lines.
        where: { productId: { not: null }, isSubtotalLine: false, isBundleHeader: false },
        select: { productId: true, variantId: true, quantity: true },
      },
    },
    orderBy: { issueDate: "asc" },
  });

  const productIds = [
    ...new Set(quotes.flatMap((q) => q.lines.map((l) => l.productId!).filter(Boolean))),
  ];
  if (productIds.length === 0) return NextResponse.json([]);

  const products = await prisma.product.findMany({
    where: { tenantId, id: { in: productIds }, isService: false },
    select: {
      id: true,
      designation: true,
      reference: true,
      unit: true,
      hasVariants: true,
      variants: { select: { id: true, name: true } },
    },
  });
  const productById = new Map(products.map((p) => [p.id, p]));
  const { byProduct, byVariant } = await getProductQuantities(prisma, tenantId, { productIds });

  // One row per shelf: the product itself, or one of its variants.
  const rows = new Map<string, Shortfall>();
  for (const quote of quotes) {
    for (const line of quote.lines) {
      const product = productById.get(line.productId!);
      if (!product) continue; // a service, or deleted since

      // Stock for a product with variants sits on the variants; a line that
      // names none has no shelf to measure against.
      if (product.hasVariants && !line.variantId) continue;
      const variant = line.variantId
        ? product.variants.find((v) => v.id === line.variantId)
        : undefined;
      if (line.variantId && !variant) continue;

      const key = variant ? `${product.id}:${variant.id}` : product.id;
      let row = rows.get(key);
      if (!row) {
        row = {
          productId: product.id,
          designation: product.designation,
          reference: product.reference,
          unit: product.unit,
          variantId: variant?.id ?? null,
          variantName: variant?.name ?? null,
          quantityQuoted: 0,
          quantityInStock: variant
            ? byVariant.get(variant.id) ?? 0
            : byProduct.get(product.id) ?? 0,
          missing: 0,
          quotes: [],
        };
        rows.set(key, row);
      }
      row.quantityQuoted += line.quantity;
      const already = row.quotes.find((q) => q.id === quote.id);
      if (already) already.quantity += line.quantity;
      else
        row.quotes.push({
          id: quote.id,
          quoteNumber: quote.quoteNumber,
          status: quote.status,
          clientName: quote.client.name,
          quantity: line.quantity,
        });
    }
  }

  const shortfalls = [...rows.values()]
    .map((row) => ({ ...row, missing: row.quantityQuoted - row.quantityInStock }))
    .filter((row) => row.missing > 0)
    .sort((a, b) => b.missing - a.missing || a.designation.localeCompare(b.designation));

  return NextResponse.json(toSnakeCase(shortfalls));
});
