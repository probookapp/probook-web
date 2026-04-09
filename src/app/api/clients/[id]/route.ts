import { NextResponse } from "next/server";
import { withAuth, toSnakeCase } from "@/lib/api-utils";
import { prisma } from "@/lib/db";
import { validateBody, isValidationError } from "@/lib/validate";
import { clientSchema } from "@/lib/validations";

export const GET = withAuth(async (req, { tenantId, params }) => {
  const client = await prisma.client.findFirst({ where: { tenantId, id: params?.id } });
  if (!client) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(toSnakeCase(client));
});

export const PUT = withAuth(async (req, { tenantId, params }) => {
  const body = await validateBody(req, clientSchema);
  if (isValidationError(body)) return body;
  const client = await prisma.client.update({
    where: { tenantId, id: params?.id },
    data: {
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
    },
  });
  return NextResponse.json(toSnakeCase(client));
});

export const DELETE = withAuth(async (req, { tenantId, params }) => {
  const clientId = params?.id as string;

  const refCount = await prisma.quote.count({ where: { tenantId, clientId } })
    + await prisma.invoice.count({ where: { tenantId, clientId } })
    + await prisma.deliveryNote.count({ where: { tenantId, clientId } });

  if (refCount > 0) {
    return NextResponse.json(
      { error: "Cannot delete client with existing quotes, invoices, or delivery notes" },
      { status: 409 }
    );
  }

  await prisma.client.delete({ where: { tenantId, id: clientId } });
  return new NextResponse(null, { status: 204 });
});
