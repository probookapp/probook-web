import { NextResponse } from "next/server";
import { withAuth } from "@/lib/api-utils";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/permissions-server";
import { validateBody, isValidationError } from "@/lib/validate";
import { batchDeleteSchema } from "@/lib/validations";

export const POST = withAuth(async (req, { session, tenantId }) => {
  const denied = await requirePermission(session, "invoices", "delete");
  if (denied) return denied;

  const ids = await validateBody(req, batchDeleteSchema);
  if (isValidationError(ids)) return ids;

  // Issued invoices belong to the legal numbering sequence and paid ones have
  // money attached — only unpaid drafts may be deleted (audit SALE-10).
  const blocked = await prisma.invoice.findFirst({
    where: {
      tenantId,
      id: { in: ids },
      OR: [{ status: { not: "DRAFT" } }, { payments: { some: {} } }],
    },
    select: { id: true },
  });
  if (blocked) {
    return NextResponse.json(
      { error: "Only DRAFT invoices without payments can be deleted. Use a credit note to cancel an issued invoice." },
      { status: 409 }
    );
  }

  const result = await prisma.invoice.deleteMany({
    where: { tenantId, id: { in: ids }, status: "DRAFT", payments: { none: {} } },
  });
  return NextResponse.json(result.count);
});
