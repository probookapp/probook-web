import { NextResponse } from "next/server";
import { withAuth, toSnakeCase } from "@/lib/api-utils";
import { prisma } from "@/lib/db";
import { validateBody, isValidationError } from "@/lib/validate";
import { contactSchema } from "@/lib/validations";

export const GET = withAuth(async (req, { tenantId, params }) => {
  const contact = await prisma.clientContact.findFirst({ where: { tenantId, id: params?.id } });
  if (!contact) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(toSnakeCase(contact));
});

export const PUT = withAuth(async (req, { tenantId, params }) => {
  const body = await validateBody(req, contactSchema);
  if (isValidationError(body)) return body;
  const contact = await prisma.clientContact.update({
    where: { tenantId, id: params?.id },
    data: {
      clientId: body.client_id,
      name: body.name,
      role: body.role || null,
      email: body.email || null,
      phone: body.phone || null,
      isPrimary: body.is_primary || false,
    },
  });
  return NextResponse.json(toSnakeCase(contact));
});

export const DELETE = withAuth(async (req, { tenantId, params }) => {
  await prisma.clientContact.delete({ where: { tenantId, id: params?.id } });
  return new NextResponse(null, { status: 204 });
});
