import { NextResponse } from "next/server";
import { z } from "zod";
import { withAuth, toSnakeCase } from "@/lib/api-utils";
import { prisma } from "@/lib/db";
import { applyStockChange, getProductQuantities } from "@/lib/stock";
import { validateBody, isValidationError } from "@/lib/validate";
import { requirePermission } from "@/lib/permissions-server";

// Manual stock adjustment. Provide EITHER an absolute `new_quantity` OR a signed
// `quantity_change`. A ledger row of type "adjustment" (referenceType "manual")
// is written and the product/variant balance is updated.
const adjustStockSchema = z
  .object({
    variant_id: z.string().nullable().optional(),
    location_id: z.string().nullable().optional(),
    new_quantity: z.coerce.number().int().min(0).optional(),
    quantity_change: z.coerce.number().int().optional(),
    reason: z.string().nullable().optional(),
  })
  .refine((d) => d.new_quantity !== undefined || d.quantity_change !== undefined, {
    message: "Provide either new_quantity or quantity_change",
  });

export const POST = withAuth(async (req, { tenantId, params, session }) => {
  const denied = await requirePermission(session, "products", "edit");
  if (denied) return denied;
  const productId = params?.id as string;
  const body = await validateBody(req, adjustStockSchema);
  if (isValidationError(body)) return body;

  // Verify the product belongs to the tenant.
  const product = await prisma.product.findFirst({
    where: { tenantId, id: productId },
  });
  if (!product) return NextResponse.json({ error: "Product not found" }, { status: 404 });

  // Validate the variant belongs to the product/tenant when supplied.
  if (body.variant_id) {
    const variant = await prisma.productVariant.findFirst({
      where: { tenantId, id: body.variant_id, productId },
    });
    if (!variant) return NextResponse.json({ error: "Variant not found" }, { status: 404 });
  }

  // Baseline for "set" mode. When a specific location is targeted, use that
  // location's on-hand so the computed delta only moves that location. Without a
  // location we use the computed total across locations (sum of stock_levels).
  let current: number;
  if (body.location_id) {
    const level = await prisma.stockLevel.findFirst({
      where: { locationId: body.location_id, productId, variantId: body.variant_id ?? null },
      select: { quantity: true },
    });
    current = level?.quantity ?? 0;
  } else if (body.variant_id) {
    const { byVariant } = await getProductQuantities(prisma, tenantId, {
      variantIds: [body.variant_id],
    });
    current = byVariant.get(body.variant_id) ?? 0;
  } else {
    const { byProduct } = await getProductQuantities(prisma, tenantId, {
      productIds: [productId],
    });
    current = byProduct.get(productId) ?? 0;
  }

  const quantityChange =
    body.quantity_change !== undefined
      ? Math.round(body.quantity_change)
      : Math.round((body.new_quantity ?? 0) - current);

  if (quantityChange === 0) {
    return NextResponse.json({ error: "No change in quantity" }, { status: 400 });
  }

  const newBalance = await applyStockChange(prisma, {
    tenantId,
    productId,
    variantId: body.variant_id ?? null,
    locationId: body.location_id ?? null,
    type: "adjustment",
    quantityChange,
    reason: body.reason ?? "manual adjustment",
    referenceType: "manual",
    userId: session.userId,
  });

  return NextResponse.json(toSnakeCase({ productId, variantId: body.variant_id ?? null, newBalance }));
});
