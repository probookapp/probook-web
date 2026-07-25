import { NextResponse } from "next/server";
import { withAuth, toSnakeCase } from "@/lib/api-utils";
import { prisma } from "@/lib/db";
import { validateBody, isValidationError } from "@/lib/validate";
import { productSupplierSchema } from "@/lib/validations";
import { requirePermission } from "@/lib/permissions-server";

export const GET = withAuth(async (req, { tenantId }) => {
  const links = await prisma.productSupplier.findMany({
    where: { tenantId },
    orderBy: { createdAt: "desc" },
    include: { product: true, supplier: true },
  });
  return NextResponse.json(toSnakeCase(links));
});

export const POST = withAuth(async (req, { tenantId, session }) => {
  const denied = await requirePermission(session, "products", "edit");
  if (denied) return denied;
  const body = await validateBody(req, productSupplierSchema);
  if (isValidationError(body)) return body;

  // Validate both FKs belong to this tenant before writing — otherwise a forged
  // foreign product_id/supplier_id would be accepted and the include below would
  // reflect another tenant's product (incl. cost) or supplier back (audit TEN-1).
  const [product, supplier] = await Promise.all([
    prisma.product.findFirst({ where: { tenantId, id: body.product_id }, select: { id: true } }),
    prisma.supplier.findFirst({ where: { tenantId, id: body.supplier_id }, select: { id: true } }),
  ]);
  if (!product || !supplier) {
    return NextResponse.json({ error: "Product or supplier not found" }, { status: 400 });
  }

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
