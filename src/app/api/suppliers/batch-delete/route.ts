import { NextResponse } from "next/server";
import { withAuth } from "@/lib/api-utils";
import { prisma } from "@/lib/db";
import { validateBody, isValidationError } from "@/lib/validate";
import { batchDeleteSchema } from "@/lib/validations";

export const POST = withAuth(async (req, { tenantId }) => {
  const ids = await validateBody(req, batchDeleteSchema);
  if (isValidationError(ids)) return ids;

  // Exclude suppliers that have purchase orders
  const suppliersWithOrders = await prisma.purchaseOrder.findMany({
    where: { tenantId, supplierId: { in: ids } },
    select: { supplierId: true },
    distinct: ["supplierId"],
  });
  const blockedIds = new Set(suppliersWithOrders.map((s) => s.supplierId));
  const deletableIds = ids.filter((id: string) => !blockedIds.has(id));

  if (deletableIds.length === 0 && blockedIds.size > 0) {
    return NextResponse.json(
      { error: "Cannot delete suppliers with existing purchase orders" },
      { status: 409 }
    );
  }

  const result = await prisma.supplier.deleteMany({ where: { tenantId, id: { in: deletableIds } } });
  return NextResponse.json({ deleted: result.count, skipped: blockedIds.size });
});
