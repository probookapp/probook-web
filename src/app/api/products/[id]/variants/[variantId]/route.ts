import { NextResponse } from "next/server";
import { withAuth, toSnakeCase } from "@/lib/api-utils";
import { prisma } from "@/lib/db";
import { applyStockChange } from "@/lib/stock";
import { validateBody, isValidationError } from "@/lib/validate";
import { productVariantSchema } from "@/lib/validations";
import { requirePermission } from "@/lib/permissions-server";

export const GET = withAuth(async (req, { tenantId, params }) => {
  const variant = await prisma.productVariant.findFirst({
    where: { tenantId, id: params?.variantId, productId: params?.id },
  });
  if (!variant) return NextResponse.json({ error: "Variant not found" }, { status: 404 });
  return NextResponse.json(toSnakeCase(variant));
});

export const PUT = withAuth(async (req, { tenantId, params, session }) => {
  const denied = await requirePermission(session, "products", "edit");
  if (denied) return denied;
  const body = await validateBody(req, productVariantSchema);
  if (isValidationError(body)) return body;

  const existing = await prisma.productVariant.findFirst({
    where: { tenantId, id: params?.variantId, productId: params?.id },
  });
  if (!existing) return NextResponse.json({ error: "Variant not found" }, { status: 404 });

  // Ensure barcode uniqueness within tenant (if changed)
  if (body.barcode && body.barcode !== existing.barcode) {
    const dupVariant = await prisma.productVariant.findFirst({
      where: { tenantId, barcode: body.barcode, id: { not: params?.variantId } },
    });
    if (dupVariant) {
      return NextResponse.json({ error: "Barcode already in use by another variant" }, { status: 400 });
    }
    const dupProduct = await prisma.product.findFirst({
      where: { tenantId, barcode: body.barcode },
    });
    if (dupProduct) {
      return NextResponse.json({ error: "Barcode already in use by a product" }, { status: 400 });
    }
  }

  // A direct quantity edit is recorded as a manual adjustment through the stock
  // ledger, which sets the aggregate itself — so `quantity` is omitted from the
  // update below (writing it too would clobber the per-location sum in a
  // multi-location tenant). Both run in one transaction.
  const newQuantity = body.quantity ?? existing.quantity;
  const quantityDelta = newQuantity - existing.quantity;

  const variant = await prisma.$transaction(async (tx) => {
    if (quantityDelta !== 0) {
      await applyStockChange(tx, {
        tenantId,
        productId: params?.id as string,
        variantId: existing.id,
        type: "adjustment",
        quantityChange: quantityDelta,
        reason: "manual edit",
        referenceType: "manual",
        userId: session.userId,
      });
    }

    return tx.productVariant.update({
      where: { id: params?.variantId },
      data: {
        name: body.name,
        sku: body.sku || null,
        barcode: body.barcode || null,
        attributes: (body.attributes || {}) as Record<string, string>,
        ...(quantityDelta === 0 ? { quantity: newQuantity } : {}),
        priceOverride: body.price_override ?? null,
        isActive: body.is_active ?? true,
      },
    });
  });
  return NextResponse.json(toSnakeCase(variant));
});

export const DELETE = withAuth(async (req, { tenantId, params, session }) => {
  const denied = await requirePermission(session, "products", "delete");
  if (denied) return denied;
  const existing = await prisma.productVariant.findFirst({
    where: { tenantId, id: params?.variantId, productId: params?.id },
  });
  if (!existing) return NextResponse.json({ error: "Variant not found" }, { status: 404 });

  await prisma.productVariant.delete({ where: { id: params?.variantId } });

  // Check if any variants remain — if not, unmark hasVariants
  const remainingCount = await prisma.productVariant.count({
    where: { tenantId, productId: params?.id },
  });
  if (remainingCount === 0) {
    await prisma.product.update({
      where: { tenantId, id: params?.id },
      data: { hasVariants: false },
    });
  }

  return new NextResponse(null, { status: 204 });
});
