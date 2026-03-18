import { NextResponse } from "next/server";
import { withAuth, toSnakeCase } from "@/lib/api-utils";
import { prisma } from "@/lib/db";
import { validateBody, isValidationError } from "@/lib/validate";
import { updateProductSupplierSchema } from "@/lib/validations";

export const GET = withAuth(async (req, { tenantId, params }) => {
  const link = await prisma.productSupplier.findFirst({
    where: { tenantId, id: params?.linkId },
    include: { product: true, supplier: true },
  });
  if (!link) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(toSnakeCase(link));
});

export const PUT = withAuth(async (req, { tenantId, params }) => {
  const body = await validateBody(req, updateProductSupplierSchema);
  if (isValidationError(body)) return body;
  const link = await prisma.productSupplier.update({
    where: { tenantId, id: params?.linkId },
    data: {
      productId: body.product_id,
      supplierId: body.supplier_id,
      purchasePrice: body.purchase_price || 0,
    },
    include: { product: true, supplier: true },
  });
  return NextResponse.json(toSnakeCase(link));
});

export const DELETE = withAuth(async (req, { tenantId, params }) => {
  await prisma.productSupplier.delete({ where: { tenantId, id: params?.linkId } });
  return new NextResponse(null, { status: 204 });
});
