import { NextResponse } from "next/server";
import { withAuth, toSnakeCase } from "@/lib/api-utils";
import { prisma } from "@/lib/db";
import { validateBody, isValidationError } from "@/lib/validate";
import { productSchema } from "@/lib/validations";

export const GET = withAuth(async (req, { tenantId, params }) => {
  const product = await prisma.product.findFirst({
    where: { tenantId, id: params?.id },
    include: { category: true },
  });
  if (!product) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(toSnakeCase(product));
});

export const PUT = withAuth(async (req, { tenantId, params }) => {
  const body = await validateBody(req, productSchema);
  if (isValidationError(body)) return body;
  const product = await prisma.product.update({
    where: { tenantId, id: params?.id },
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
    },
  });
  return NextResponse.json(toSnakeCase(product));
});

export const DELETE = withAuth(async (req, { tenantId, params }) => {
  await prisma.product.delete({ where: { tenantId, id: params?.id } });
  return new NextResponse(null, { status: 204 });
});
