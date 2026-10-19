import { NextResponse } from "next/server";
import { withAuth, toSnakeCase } from "@/lib/api-utils";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/permissions-server";
import { deleteSupplierReturn, SupplierReturnError } from "@/lib/supplier-returns";

export const GET = withAuth(async (req, { tenantId, params, session }) => {
  const denied = await requirePermission(session, "purchases", "view");
  if (denied) return denied;
  const supplierReturn = await prisma.supplierReturn.findFirst({
    where: { tenantId, id: params?.id },
    include: {
      supplier: true,
      purchaseOrder: { select: { id: true, orderNumber: true } },
      location: { select: { id: true, name: true } },
      lines: { include: { product: true, variant: true } },
    },
  });
  if (!supplierReturn) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(toSnakeCase(supplierReturn));
});

// Cancelling a return puts the goods back on the shelf and removes the credit.
export const DELETE = withAuth(async (req, { tenantId, params, session }) => {
  const denied = await requirePermission(session, "purchases", "delete");
  if (denied) return denied;
  try {
    await prisma.$transaction((tx) => deleteSupplierReturn(tx, tenantId, params?.id as string, session.userId));
  } catch (err) {
    if (err instanceof SupplierReturnError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }
  return new NextResponse(null, { status: 204 });
});
