import { NextResponse } from "next/server";
import { withAuth, toSnakeCase } from "@/lib/api-utils";
import { prisma } from "@/lib/db";
import { validateBody, isValidationError } from "@/lib/validate";
import { productVariantSchema } from "@/lib/validations";

export const GET = withAuth(async (req, { tenantId, params }) => {
  const variant = await prisma.productVariant.findFirst({
    where: { tenantId, id: params?.variantId, productId: params?.id },
  });
  if (!variant) return NextResponse.json({ error: "Variant not found" }, { status: 404 });
  return NextResponse.json(toSnakeCase(variant));
});

export const PUT = withAuth(async (req, { tenantId, params }) => {
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

  const variant = await prisma.productVariant.update({
    where: { id: params?.variantId },
    data: {
      name: body.name,
      sku: body.sku || null,
      barcode: body.barcode || null,
      attributes: (body.attributes || {}) as Record<string, string>,
      quantity: body.quantity ?? existing.quantity,
      priceOverride: body.price_override ?? null,
      isActive: body.is_active ?? true,
    },
  });
  return NextResponse.json(toSnakeCase(variant));
});

export const DELETE = withAuth(async (req, { tenantId, params }) => {
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
