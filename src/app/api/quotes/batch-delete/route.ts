import { NextResponse } from "next/server";
import { withAuth } from "@/lib/api-utils";
import { prisma } from "@/lib/db";
import { validateBody, isValidationError } from "@/lib/validate";
import { batchDeleteSchema } from "@/lib/validations";
import { requirePermission } from "@/lib/permissions-server";

export const POST = withAuth(async (req, { tenantId, session }) => {
  const denied = await requirePermission(session, "quotes", "delete");
  if (denied) return denied;
  const ids = await validateBody(req, batchDeleteSchema);
  if (isValidationError(ids)) return ids;
  // A quote holding a deposit is kept: the money must not end up belonging to
  // nothing. The count returned says how many actually went.
  const result = await prisma.quote.deleteMany({
    where: { tenantId, id: { in: ids }, deposits: { none: { invoiceId: null } } },
  });
  return NextResponse.json(result.count);
});
