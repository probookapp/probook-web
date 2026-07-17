import { NextResponse } from "next/server";
import { withAuth, toSnakeCase } from "@/lib/api-utils";
import { prisma } from "@/lib/db";
import { applyStockChange } from "@/lib/stock";
import { validateBody, isValidationError } from "@/lib/validate";
import { productSchema } from "@/lib/validations";
import { requirePermission } from "@/lib/permissions-server";

export const GET = withAuth(async (req, { tenantId, params }) => {
  const product = await prisma.product.findFirst({
    where: { tenantId, id: params?.id },
    include: { category: true, prices: true, variants: true },
  });
  if (!product) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(toSnakeCase(product));
});

export const PUT = withAuth(async (req, { tenantId, params, session }) => {
  const denied = await requirePermission(session, "products", "edit");
  if (denied) return denied;
  const body = await validateBody(req, productSchema);
  if (isValidationError(body)) return body;
  const productId = params?.id as string;
  const prices = body.prices || [];

  const existing = await prisma.product.findFirst({
    where: { tenantId, id: productId },
    select: { quantity: true },
  });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const newQuantity = body.quantity ?? 0;
  const quantityDelta = newQuantity - (existing.quantity ?? 0);

  const product = await prisma.$transaction(async (tx) => {
    // Delete existing prices and recreate atomically
    await tx.productPrice.deleteMany({ where: { productId, tenantId } });

    // Record a manual adjustment for a direct quantity edit. applyStockChange sets
    // the new balance, so quantity is intentionally omitted from the update below.
    if (quantityDelta !== 0) {
      await applyStockChange(tx, {
        tenantId,
        productId,
        type: "adjustment",
        quantityChange: quantityDelta,
        reason: "manual edit",
        referenceType: "manual",
        userId: session.userId,
      });
    }

    return tx.product.update({
      where: { tenantId, id: productId },
      data: {
        designation: body.designation,
        description: body.description || null,
        descriptionHtml: body.description_html || null,
        unitPrice: body.unit_price,
        taxRate: body.tax_rate ?? 20.0,
        unit: body.unit || "unit",
        reference: body.reference || null,
        barcode: body.barcode || null,
        isService: body.is_service || false,
        categoryId: body.category_id || null,
        ...(quantityDelta === 0 ? { quantity: newQuantity } : {}),
        purchasePrice: body.purchase_price ?? 0,
        hasVariants: body.has_variants || false,
        prices: prices.length > 0 ? {
          create: prices.map((p: { label: string; price: number }) => ({
            tenantId,
            label: p.label,
            price: p.price,
          })),
        } : undefined,
      },
      include: { prices: true, variants: true },
    });
  });

  return NextResponse.json(toSnakeCase(product));
});

export const DELETE = withAuth(async (req, { tenantId, params, session }) => {
  const denied = await requirePermission(session, "products", "delete");
  if (denied) return denied;
  const productId = params?.id as string;

  // Prevent deleting products referenced in purchase orders
  const poLineCount = await prisma.purchaseOrderLine.count({
    where: { productId, order: { tenantId } },
  });
  if (poLineCount > 0) {
    return NextResponse.json(
      { error: "Cannot delete product with existing purchase orders" },
      { status: 409 }
    );
  }

  await prisma.product.delete({ where: { tenantId, id: productId } });
  return new NextResponse(null, { status: 204 });
});
