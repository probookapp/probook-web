import { NextResponse } from "next/server";
import { withAuth, toSnakeCase } from "@/lib/api-utils";
import { prisma } from "@/lib/db";
import { validateBody, isValidationError } from "@/lib/validate";
import { supplierAdjustmentSchema } from "@/lib/validations";
import { requirePermission } from "@/lib/permissions-server";

// Hand-written corrections to a supplier's balance. Signed: positive adds to
// what the business owes, negative is credit in its favour. The reason is
// required: an adjustment with no why cannot be checked later.
export const GET = withAuth(async (req, { tenantId, params, session }) => {
  const denied = await requirePermission(session, "suppliers", "view");
  if (denied) return denied;
  const adjustments = await prisma.supplierAdjustment.findMany({
    where: { tenantId, supplierId: params?.id },
    orderBy: [{ adjustmentDate: "desc" }, { createdAt: "desc" }],
  });
  return NextResponse.json(toSnakeCase(adjustments));
});

export const POST = withAuth(async (req, { tenantId, params, session }) => {
  const denied = await requirePermission(session, "suppliers", "edit");
  if (denied) return denied;
  const body = await validateBody(req, supplierAdjustmentSchema);
  if (isValidationError(body)) return body;

  const supplierId = params?.id as string;
  const supplier = await prisma.supplier.findFirst({
    where: { tenantId, id: supplierId },
    select: { id: true },
  });
  if (!supplier) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const adjustment = await prisma.supplierAdjustment.create({
    data: {
      tenantId,
      supplierId,
      amount: body.amount,
      adjustmentDate: new Date(body.adjustment_date),
      reason: body.reason.trim(),
      userId: session.userId,
    },
  });
  return NextResponse.json(toSnakeCase(adjustment));
});
