import { NextResponse } from "next/server";
import { withAuth, toSnakeCase, markOnboardingStep } from "@/lib/api-utils";
import { prisma } from "@/lib/db";
import { Prisma } from "@/generated/prisma/client";
import { validateBody, isValidationError } from "@/lib/validate";
import { clientSchema } from "@/lib/validations";

export const GET = withAuth(async (req, { tenantId }) => {
  const clients = await prisma.client.findMany({
    where: { tenantId },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json(toSnakeCase(clients));
});

export const POST = withAuth(async (req, { tenantId }) => {
  const body = await validateBody(req, clientSchema);
  if (isValidationError(body)) return body;
  const client = await prisma.client.create({
    data: {
      tenantId,
      name: body.name,
      email: body.email || null,
      phone: body.phone || null,
      address: body.address || null,
      city: body.city || null,
      postalCode: body.postal_code || null,
      country: body.country || null,
      siret: body.siret || null,
      vatNumber: body.vat_number || null,
      notes: body.notes || null,
    } satisfies Prisma.ClientUncheckedCreateInput,
  });
  markOnboardingStep(tenantId, "first_client");
  return NextResponse.json(toSnakeCase(client));
});
