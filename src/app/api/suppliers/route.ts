import { NextResponse } from "next/server";
import { withAuth, toSnakeCase } from "@/lib/api-utils";
import { prisma } from "@/lib/db";
import { validateBody, isValidationError } from "@/lib/validate";
import { supplierSchema } from "@/lib/validations";

export const GET = withAuth(async (req, { tenantId }) => {
  const suppliers = await prisma.supplier.findMany({
    where: { tenantId },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json(toSnakeCase(suppliers));
});

export const POST = withAuth(async (req, { tenantId }) => {
  const body = await validateBody(req, supplierSchema);
  if (isValidationError(body)) return body;
  const supplier = await prisma.supplier.create({
    data: {
      tenantId,
      name: body.name,
      email: body.email || null,
      phone: body.phone || null,
      address: body.address || null,
      notes: body.notes || null,
    },
  });
  return NextResponse.json(toSnakeCase(supplier));
});
