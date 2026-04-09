import { NextResponse } from "next/server";
import { withAuth, toSnakeCase } from "@/lib/api-utils";
import { prisma } from "@/lib/db";
import { validateBody, isValidationError } from "@/lib/validate";
import { productVariantSchema } from "@/lib/validations";

export const GET = withAuth(async (req, { tenantId, params }) => {
  const productId = params?.id as string;

  // Verify product belongs to tenant
  const product = await prisma.product.findFirst({
    where: { tenantId, id: productId },
  });
  if (!product) return NextResponse.json({ error: "Product not found" }, { status: 404 });

  const variants = await prisma.productVariant.findMany({
    where: { tenantId, productId },
    orderBy: { createdAt: "asc" },
  });
  return NextResponse.json(toSnakeCase(variants));
});

export const POST = withAuth(async (req, { tenantId, params }) => {
  const productId = params?.id as string;
  const body = await validateBody(req, productVariantSchema);
  if (isValidationError(body)) return body;

  // Verify product belongs to tenant
  const product = await prisma.product.findFirst({
    where: { tenantId, id: productId },
  });
  if (!product) return NextResponse.json({ error: "Product not found" }, { status: 404 });

  // Ensure barcode uniqueness within tenant (if provided)
  if (body.barcode) {
    const existing = await prisma.productVariant.findFirst({
      where: { tenantId, barcode: body.barcode },
    });
    if (existing) {
      return NextResponse.json({ error: "Barcode already in use by another variant" }, { status: 400 });
    }
    // Also check product barcodes
    const existingProduct = await prisma.product.findFirst({
      where: { tenantId, barcode: body.barcode },
    });
    if (existingProduct) {
      return NextResponse.json({ error: "Barcode already in use by a product" }, { status: 400 });
    }
  }

  const variant = await prisma.productVariant.create({
    data: {
      tenantId,
      productId,
      name: body.name,
      sku: body.sku || null,
      barcode: body.barcode || null,
      attributes: (body.attributes || {}) as Record<string, string>,
      quantity: body.quantity ?? 0,
      priceOverride: body.price_override ?? null,
      isActive: body.is_active ?? true,
    },
  });

  // Ensure product is marked as having variants
  if (!product.hasVariants) {
    await prisma.product.update({
      where: { tenantId, id: productId },
      data: { hasVariants: true },
    });
  }

  return NextResponse.json(toSnakeCase(variant));
});
