import { NextResponse } from "next/server";
import { withAuth, toSnakeCase } from "@/lib/api-utils";
import { requirePermission } from "@/lib/permissions-server";
import { prisma } from "@/lib/db";
import { getProductQuantities } from "@/lib/stock";

// Low-stock report: stock-tracked products (and variants) at or below a
// threshold. Threshold comes from the `threshold` query param, falling back to
// the tenant's configured POS low-stock threshold, then 5.
export const GET = withAuth(async (req, { tenantId, session }) => {
  const denied = await requirePermission(session, "reports", "view");
  if (denied) return denied;
  const { searchParams } = new URL(req.url);
  const thresholdParam = searchParams.get("threshold");
  const locationId = searchParams.get("locationId");

  let threshold: number;
  if (thresholdParam !== null && thresholdParam !== "" && !Number.isNaN(Number(thresholdParam))) {
    threshold = Number(thresholdParam);
  } else {
    const settings = await prisma.companySettings.findUnique({
      where: { tenantId },
      select: { posLowStockThreshold: true },
    });
    threshold = settings?.posLowStockThreshold ?? 5;
  }

  const products = await prisma.product.findMany({
    where: { tenantId, isService: false },
    include: { variants: true },
    orderBy: { designation: "asc" },
  });

  // When a location is specified, on-hand comes from that location's
  // stock_levels. Otherwise it is the computed total across locations (grouped
  // stock_levels sums — the single source of truth). Missing rows mean zero.
  let stockAt: Map<string, number> | null = null;
  if (locationId) {
    const levels = await prisma.stockLevel.findMany({
      where: { tenantId, locationId },
      select: { productId: true, variantId: true, quantity: true },
    });
    stockAt = new Map();
    for (const l of levels) {
      stockAt.set(`${l.productId}:${l.variantId ?? ""}`, l.quantity);
    }
  }
  const { byProduct, byVariant } = stockAt
    ? { byProduct: new Map<string, number>(), byVariant: new Map<string, number>() }
    : await getProductQuantities(prisma, tenantId);
  const qtyOf = (productId: string, variantId: string | null) =>
    stockAt
      ? stockAt.get(`${productId}:${variantId ?? ""}`) ?? 0
      : variantId
        ? byVariant.get(variantId) ?? 0
        : byProduct.get(productId) ?? 0;

  const rows: {
    productId: string;
    designation: string;
    reference: string | null;
    variantId: string | null;
    variantName: string | null;
    quantity: number;
    threshold: number;
  }[] = [];

  for (const p of products) {
    if (p.hasVariants && p.variants.length > 0) {
      for (const v of p.variants) {
        const qty = qtyOf(p.id, v.id);
        if (qty <= threshold) {
          rows.push({
            productId: p.id,
            designation: p.designation,
            reference: p.reference,
            variantId: v.id,
            variantName: v.name,
            quantity: qty,
            threshold,
          });
        }
      }
    } else {
      const qty = qtyOf(p.id, null);
      if (qty <= threshold) {
        rows.push({
          productId: p.id,
          designation: p.designation,
          reference: p.reference,
          variantId: null,
          variantName: null,
          quantity: qty,
          threshold,
        });
      }
    }
  }

  rows.sort((a, b) => a.quantity - b.quantity);
  return NextResponse.json(toSnakeCase(rows));
});
