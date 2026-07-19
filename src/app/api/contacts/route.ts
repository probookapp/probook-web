import { NextResponse } from "next/server";
import { withAuth, toSnakeCase, parseListPagination, nextCursorOf } from "@/lib/api-utils";
import { prisma } from "@/lib/db";
import { validateBody, isValidationError } from "@/lib/validate";
import { contactSchema } from "@/lib/validations";
import { requirePermission, userCan, forbidden } from "@/lib/permissions-server";

export const GET = withAuth(async (req, { tenantId, session }) => {
  // Contacts are readable from both the Clients and Phonebook modules.
  const canView =
    (await userCan(session, "clients", "view")) ||
    (await userCan(session, "phonebook", "view"));
  if (!canView) return forbidden();

  // Opt-in cursor pagination (audit SALE-23): lean rows — scalars + client
  // name instead of the full client row.
  const page = parseListPagination(req);
  if (page) {
    const cursorId = page.cursor
      ? (await prisma.clientContact.findFirst({
          where: { tenantId, id: page.cursor },
          select: { id: true },
        }))?.id ?? null
      : null;
    const data = await prisma.clientContact.findMany({
      where: { tenantId },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: page.limit,
      ...(cursorId ? { cursor: { id: cursorId }, skip: 1 } : {}),
      include: { client: { select: { id: true, name: true } } },
    });
    return NextResponse.json(
      toSnakeCase({ data, nextCursor: nextCursorOf(data, page.limit) })
    );
  }

  const contacts = await prisma.clientContact.findMany({
    where: { tenantId },
    orderBy: { createdAt: "desc" },
    include: { client: true },
  });
  return NextResponse.json(toSnakeCase(contacts));
});

export const POST = withAuth(async (req, { tenantId, session }) => {
  const denied = await requirePermission(session, "clients", "create");
  if (denied) return denied;
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
