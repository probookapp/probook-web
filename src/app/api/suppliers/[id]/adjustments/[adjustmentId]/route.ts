import { NextResponse } from "next/server";
import { withAuth } from "@/lib/api-utils";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/permissions-server";

// Removing an adjustment entered by mistake. It touches nothing else: no stock,
// no order status, only the balance.
export const DELETE = withAuth(async (req, { tenantId, params, session }) => {
  const denied = await requirePermission(session, "suppliers", "edit");
  if (denied) return denied;
  const deleted = await prisma.supplierAdjustment.deleteMany({
    where: { tenantId, supplierId: params?.id, id: params?.adjustmentId },
  });
  if (deleted.count === 0) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return new NextResponse(null, { status: 204 });
});
