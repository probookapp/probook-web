import { NextResponse } from "next/server";
import { withAuth, toSnakeCase } from "@/lib/api-utils";
import { prisma } from "@/lib/db";
import { validateBody, isValidationError } from "@/lib/validate";
import { productSchema } from "@/lib/validations";

export const GET = withAuth(async (req, { tenantId, params }) => {
  const product = await prisma.product.findFirst({
    where: { tenantId, id: params?.id },
    include: { category: true, prices: true, variants: true },
  });
  if (!product) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(toSnakeCase(product));
});

export const PUT = withAuth(async (req, { tenantId, params }) => {
  const body = await validateBody(req, productSchema);
  if (isValidationError(body)) return body;
  const productId = params?.id as string;
  const prices = body.prices || [];

  const product = await prisma.$transaction(async (tx) => {
    // Delete existing prices and recreate atomically
    await tx.productPrice.deleteMany({ where: { productId, tenantId } });

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
        quantity: body.quantity ?? 0,
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

export const DELETE = withAuth(async (req, { tenantId, params }) => {
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
