import { NextResponse } from "next/server";
import { withAuth, toSnakeCase, markOnboardingStep } from "@/lib/api-utils";
import { prisma } from "@/lib/db";
import { validateBody, isValidationError } from "@/lib/validate";
import { productSchema } from "@/lib/validations";

export const GET = withAuth(async (req, { tenantId }) => {
  const products = await prisma.product.findMany({
    where: { tenantId },
    orderBy: { createdAt: "desc" },
    include: { category: true },
  });
  return NextResponse.json(toSnakeCase(products));
});

export const POST = withAuth(async (req, { tenantId }) => {
  const body = await validateBody(req, productSchema);
  if (isValidationError(body)) return body;
  const product = await prisma.product.create({
    data: {
      tenantId,
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
  markOnboardingStep(tenantId, "first_product");
  return NextResponse.json(toSnakeCase(product));
});
