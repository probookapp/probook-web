import { NextResponse } from "next/server";
import { withAuth, toSnakeCase } from "@/lib/api-utils";
import { requirePermission } from "@/lib/permissions-server";
import { prisma } from "@/lib/db";
import { getProductQuantities } from "@/lib/stock";
import { num } from "@/lib/money";

// Inventory valuation report: on-hand value = quantity * purchase_price.
// Variants inherit the parent product's purchase price (matches POS costing).
export const GET = withAuth(async (req, { tenantId, session }) => {
  const denied = await requirePermission(session, "reports", "view");
  if (denied) return denied;
  const { searchParams } = new URL(req.url);
  const locationId = searchParams.get("locationId");

  const products = await prisma.product.findMany({
    where: { tenantId, isService: false },
    include: { variants: true },
    orderBy: { designation: "asc" },
  });

  // When a location is specified, on-hand comes from that location's
  // stock_levels (summed across the product's variants). Otherwise it is the
  // computed total across locations (grouped stock_levels sums).
  let stockByProduct: Map<string, number> | null = null;
  if (locationId) {
    const levels = await prisma.stockLevel.findMany({
      where: { tenantId, locationId },
      select: { productId: true, quantity: true },
    });
    stockByProduct = new Map();
    for (const l of levels) {
      stockByProduct.set(l.productId, (stockByProduct.get(l.productId) ?? 0) + l.quantity);
    }
  }
  const { byProduct, byVariant } = stockByProduct
    ? { byProduct: new Map<string, number>(), byVariant: new Map<string, number>() }
    : await getProductQuantities(prisma, tenantId);

  const rows = products.map((p) => {
    const purchasePrice = num(p.purchasePrice);
    const quantity = stockByProduct
      ? stockByProduct.get(p.id) ?? 0
      : p.hasVariants && p.variants.length > 0
        ? p.variants.reduce((sum, v) => sum + (byVariant.get(v.id) ?? 0), 0)
        : byProduct.get(p.id) ?? 0;
    return {
      productId: p.id,
      designation: p.designation,
      reference: p.reference,
      quantity,
      purchasePrice,
      stockValue: quantity * purchasePrice,
    };
  });

  rows.sort((a, b) => b.stockValue - a.stockValue);
  return NextResponse.json(toSnakeCase(rows));
});
