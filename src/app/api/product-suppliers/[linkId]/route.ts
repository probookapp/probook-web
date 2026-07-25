import { NextResponse } from "next/server";
import { withAuth, toSnakeCase } from "@/lib/api-utils";
import { prisma } from "@/lib/db";
import { validateBody, isValidationError } from "@/lib/validate";
import { updateProductSupplierSchema } from "@/lib/validations";
import { requirePermission } from "@/lib/permissions-server";

export const GET = withAuth(async (req, { tenantId, params }) => {
  const link = await prisma.productSupplier.findFirst({
    where: { tenantId, id: params?.linkId },
    include: { product: true, supplier: true },
  });
  if (!link) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(toSnakeCase(link));
});

export const PUT = withAuth(async (req, { tenantId, params, session }) => {
  const denied = await requirePermission(session, "products", "edit");
  if (denied) return denied;
  const body = await validateBody(req, updateProductSupplierSchema);
  if (isValidationError(body)) return body;

  // Validate both FKs belong to this tenant before writing (audit TEN-1).
  const [product, supplier] = await Promise.all([
    prisma.product.findFirst({ where: { tenantId, id: body.product_id }, select: { id: true } }),
    prisma.supplier.findFirst({ where: { tenantId, id: body.supplier_id }, select: { id: true } }),
  ]);
  if (!product || !supplier) {
    return NextResponse.json({ error: "Product or supplier not found" }, { status: 400 });
  }

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

export const DELETE = withAuth(async (req, { tenantId, params, session }) => {
  const denied = await requirePermission(session, "products", "edit");
  if (denied) return denied;
  await prisma.productSupplier.delete({ where: { tenantId, id: params?.linkId } });
  return new NextResponse(null, { status: 204 });
});
