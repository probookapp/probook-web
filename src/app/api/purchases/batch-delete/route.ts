import { NextResponse } from "next/server";
import { withAuth } from "@/lib/api-utils";
import { prisma } from "@/lib/db";
import { validateBody, isValidationError } from "@/lib/validate";
import { batchDeleteSchema } from "@/lib/validations";
import { requirePermission } from "@/lib/permissions-server";

export const POST = withAuth(async (req, { tenantId, session }) => {
  const denied = await requirePermission(session, "purchases", "delete");
  if (denied) return denied;
  const ids = await validateBody(req, batchDeleteSchema);
  if (isValidationError(ids)) return ids;
  // Orders carrying a payment (an advance) are skipped: cancel them instead.
  const result = await prisma.purchaseOrder.deleteMany({
    where: { tenantId, id: { in: ids }, status: "PENDING", payments: { none: {} } },
  });
  return NextResponse.json(result.count);
});
