import { NextResponse } from "next/server";
import { withAuth, toSnakeCase, parseListPagination, nextCursorOf } from "@/lib/api-utils";
import { prisma } from "@/lib/db";
import { validateBody, isValidationError } from "@/lib/validate";
import { supplierSchema } from "@/lib/validations";
import { requirePermission } from "@/lib/permissions-server";

export const GET = withAuth(async (req, { tenantId }) => {
  // Opt-in cursor pagination (audit SALE-23): scalar rows only.
  const page = parseListPagination(req);
  if (page) {
    const cursorId = page.cursor
      ? (await prisma.supplier.findFirst({
          where: { tenantId, id: page.cursor },
          select: { id: true },
        }))?.id ?? null
      : null;
    const data = await prisma.supplier.findMany({
      where: { tenantId },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: page.limit,
      ...(cursorId ? { cursor: { id: cursorId }, skip: 1 } : {}),
    });
    return NextResponse.json(
      toSnakeCase({ data, nextCursor: nextCursorOf(data, page.limit) })
    );
  }

  const suppliers = await prisma.supplier.findMany({
    where: { tenantId },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json(toSnakeCase(suppliers));
});

export const POST = withAuth(async (req, { tenantId, session }) => {
  const denied = await requirePermission(session, "suppliers", "create");
  if (denied) return denied;
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
