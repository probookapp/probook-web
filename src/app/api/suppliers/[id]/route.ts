import { NextResponse } from "next/server";
import { withAuth, toSnakeCase } from "@/lib/api-utils";
import { prisma } from "@/lib/db";
import { validateBody, isValidationError } from "@/lib/validate";
import { supplierSchema } from "@/lib/validations";

export const GET = withAuth(async (req, { tenantId, params }) => {
  const supplier = await prisma.supplier.findFirst({ where: { tenantId, id: params?.id } });
  if (!supplier) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(toSnakeCase(supplier));
});

export const PUT = withAuth(async (req, { tenantId, params }) => {
  const body = await validateBody(req, supplierSchema);
  if (isValidationError(body)) return body;
  const supplier = await prisma.supplier.update({
    where: { tenantId, id: params?.id },
    data: {
      name: body.name,
      email: body.email || null,
      phone: body.phone || null,
      address: body.address || null,
      notes: body.notes || null,
    },
  });
  return NextResponse.json(toSnakeCase(supplier));
});

export const DELETE = withAuth(async (req, { tenantId, params }) => {
  const supplierId = params?.id as string;

  // Prevent deleting suppliers with purchase orders
  const purchaseCount = await prisma.purchaseOrder.count({
    where: { tenantId, supplierId },
  });
  if (purchaseCount > 0) {
    return NextResponse.json(
      { error: "Cannot delete supplier with existing purchase orders" },
      { status: 409 }
    );
  }

  await prisma.supplier.delete({ where: { tenantId, id: supplierId } });
  return new NextResponse(null, { status: 204 });
});
