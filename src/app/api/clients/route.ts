import { NextResponse } from "next/server";
import { withAuth, toSnakeCase, markOnboardingStep, parseListPagination, nextCursorOf } from "@/lib/api-utils";
import { prisma } from "@/lib/db";
import { Prisma } from "@/generated/prisma/client";
import { validateBody, isValidationError } from "@/lib/validate";
import { clientSchema } from "@/lib/validations";
import { requirePermission } from "@/lib/permissions-server";

export const GET = withAuth(async (req, { tenantId, session }) => {
  const denied = await requirePermission(session, "clients", "view");
  if (denied) return denied;

  // Opt-in cursor pagination (audit SALE-23): scalar rows only (the clients
  // list UI renders no relations or counts).
  const page = parseListPagination(req);
  if (page) {
    const cursorId = page.cursor
      ? (await prisma.client.findFirst({
          where: { tenantId, id: page.cursor },
          select: { id: true },
        }))?.id ?? null
      : null;
    const data = await prisma.client.findMany({
      where: { tenantId },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: page.limit,
      ...(cursorId ? { cursor: { id: cursorId }, skip: 1 } : {}),
    });
    return NextResponse.json(
      toSnakeCase({ data, nextCursor: nextCursorOf(data, page.limit) })
    );
  }

  const clients = await prisma.client.findMany({
    where: { tenantId },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json(toSnakeCase(clients));
});

export const POST = withAuth(async (req, { tenantId, session }) => {
  const denied = await requirePermission(session, "clients", "create");
  if (denied) return denied;
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
