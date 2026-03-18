import { NextResponse } from "next/server";
import { withAuth, toSnakeCase } from "@/lib/api-utils";
import { prisma } from "@/lib/db";
import { validateBody, isValidationError } from "@/lib/validate";
import { supplierSchema } from "@/lib/validations";

export const GET = withAuth(async (req, { tenantId, params }) => {
  const supplier = await prisma.supplier.findFirst({ where: { tenantId, id: params?.id } });
  if (!supplier) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(toSnakeCase(supplier));
});

export const PUT = withAuth(async (req, { tenantId, params }) => {
  const body = await validateBody(req, supplierSchema);
  if (isValidationError(body)) return body;
  const supplier = await prisma.supplier.update({
    where: { tenantId, id: params?.id },
    data: {
      name: body.name,
      email: body.email || null,
      phone: body.phone || null,
      address: body.address || null,
      notes: body.notes || null,
    },
  });
  return NextResponse.json(toSnakeCase(supplier));
});

export const DELETE = withAuth(async (req, { tenantId, params }) => {
  await prisma.supplier.delete({ where: { tenantId, id: params?.id } });
  return new NextResponse(null, { status: 204 });
});
