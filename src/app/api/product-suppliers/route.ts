import { NextResponse } from "next/server";
import { withAuth, toSnakeCase } from "@/lib/api-utils";
import { prisma } from "@/lib/db";
import { validateBody, isValidationError } from "@/lib/validate";
import { productSupplierSchema } from "@/lib/validations";

export const GET = withAuth(async (req, { tenantId }) => {
  const links = await prisma.productSupplier.findMany({
    where: { tenantId },
    orderBy: { createdAt: "desc" },
    include: { product: true, supplier: true },
  });
  return NextResponse.json(toSnakeCase(links));
});

export const POST = withAuth(async (req, { tenantId }) => {
  const body = await validateBody(req, productSupplierSchema);
  if (isValidationError(body)) return body;
  const link = await prisma.productSupplier.create({
    data: {
      tenantId,
      productId: body.product_id,
      supplierId: body.supplier_id,
      purchasePrice: body.purchase_price || 0,
    },
    include: { product: true, supplier: true },
  });
  return NextResponse.json(toSnakeCase(link));
});
