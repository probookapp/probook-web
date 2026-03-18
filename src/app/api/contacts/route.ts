import { NextResponse } from "next/server";
import { withAuth, toSnakeCase } from "@/lib/api-utils";
import { prisma } from "@/lib/db";
import { validateBody, isValidationError } from "@/lib/validate";
import { contactSchema } from "@/lib/validations";

export const GET = withAuth(async (req, { tenantId }) => {
  const contacts = await prisma.clientContact.findMany({
    where: { tenantId },
    orderBy: { createdAt: "desc" },
    include: { client: true },
  });
  return NextResponse.json(toSnakeCase(contacts));
});

export const POST = withAuth(async (req, { tenantId }) => {
  const body = await validateBody(req, contactSchema);
  if (isValidationError(body)) return body;
  const contact = await prisma.clientContact.create({
    data: {
      tenantId,
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
