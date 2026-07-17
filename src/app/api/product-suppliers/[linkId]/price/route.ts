import { NextResponse } from "next/server";
import { withAuth, toSnakeCase } from "@/lib/api-utils";
import { prisma } from "@/lib/db";
import { validateBody, isValidationError } from "@/lib/validate";
import { updateProductSupplierPriceSchema } from "@/lib/validations";
import { requirePermission } from "@/lib/permissions-server";

export const PUT = withAuth(async (req, { tenantId, params, session }) => {
  const denied = await requirePermission(session, "products", "edit");
  if (denied) return denied;
  const body = await validateBody(req, updateProductSupplierPriceSchema);
  if (isValidationError(body)) return body;
  const link = await prisma.productSupplier.update({
    where: { tenantId, id: params?.linkId },
    data: {
      purchasePrice: body.purchase_price,
    },
    include: { product: true, supplier: true },
  });
  return NextResponse.json(toSnakeCase(link));
});
