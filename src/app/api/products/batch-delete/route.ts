import { NextResponse } from "next/server";
import { withAuth } from "@/lib/api-utils";
import { prisma } from "@/lib/db";
import { validateBody, isValidationError } from "@/lib/validate";
import { batchDeleteSchema } from "@/lib/validations";
import { requirePermission } from "@/lib/permissions-server";

export const POST = withAuth(async (req, { tenantId, session }) => {
  const denied = await requirePermission(session, "products", "delete");
  if (denied) return denied;
  const ids = await validateBody(req, batchDeleteSchema);
  if (isValidationError(ids)) return ids;
  // Deleting a component would silently change what a pack is made of.
  const inPack = await prisma.bundleComponent.count({
    where: { tenantId, productId: { in: ids }, bundleId: { notIn: ids } },
  });
  if (inPack > 0) {
    return NextResponse.json(
      { error: "Cannot delete a product used in a pack", code: "PRODUCT_IN_BUNDLE" },
      { status: 409 }
    );
  }
  const result = await prisma.product.deleteMany({ where: { tenantId, id: { in: ids } } });
  return NextResponse.json(result.count);
});
