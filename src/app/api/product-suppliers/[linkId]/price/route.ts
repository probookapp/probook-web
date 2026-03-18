import { NextResponse } from "next/server";
import { withAuth, toSnakeCase } from "@/lib/api-utils";
import { prisma } from "@/lib/db";
import { validateBody, isValidationError } from "@/lib/validate";
import { updateProductSupplierPriceSchema } from "@/lib/validations";

export const PUT = withAuth(async (req, { tenantId, params }) => {
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
