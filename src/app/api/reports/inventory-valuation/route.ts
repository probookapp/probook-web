import { NextResponse } from "next/server";
import { withAuth, toSnakeCase } from "@/lib/api-utils";
import { prisma } from "@/lib/db";

// Inventory valuation report: on-hand value = quantity * purchase_price.
// Variants inherit the parent product's purchase price (matches POS costing).
export const GET = withAuth(async (req, { tenantId }) => {
  const { searchParams } = new URL(req.url);
  const locationId = searchParams.get("locationId");

  const products = await prisma.product.findMany({
    where: { tenantId, isService: false },
    include: { variants: true },
    orderBy: { designation: "asc" },
  });

  // When a location is specified, on-hand comes from that location's
  // stock_levels (summed across the product's variants) rather than the
  // aggregate quantity across all locations.
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

  const rows = products.map((p) => {
    const purchasePrice = p.purchasePrice ?? 0;
    const quantity = stockByProduct
      ? stockByProduct.get(p.id) ?? 0
      : p.hasVariants && p.variants.length > 0
        ? p.variants.reduce((sum, v) => sum + (v.quantity ?? 0), 0)
        : p.quantity ?? 0;
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
