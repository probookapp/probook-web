import { NextResponse } from "next/server";
import { withAuth } from "@/lib/api-utils";
import { prisma } from "@/lib/db";
import { validateBody, isValidationError } from "@/lib/validate";
import { batchDeleteSchema } from "@/lib/validations";

export const POST = withAuth(async (req, { tenantId }) => {
  const ids = await validateBody(req, batchDeleteSchema);
  if (isValidationError(ids)) return ids;
  const result = await prisma.deliveryNote.deleteMany({ where: { tenantId, id: { in: ids } } });
  return NextResponse.json(result.count);
});
