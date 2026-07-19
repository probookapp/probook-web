import { NextResponse } from "next/server";
import { withAuth, toSnakeCase, parseListPagination, nextCursorOf } from "@/lib/api-utils";
import { prisma } from "@/lib/db";
import { validateBody, isValidationError } from "@/lib/validate";
import { expenseSchema } from "@/lib/validations";
import { requirePermission } from "@/lib/permissions-server";

export const GET = withAuth(async (req, { tenantId, session }) => {
  const denied = await requirePermission(session, "expenses", "view");
  if (denied) return denied;

  // Opt-in cursor pagination (audit SALE-23): scalar rows only.
  const page = parseListPagination(req);
  if (page) {
    const cursorId = page.cursor
      ? (await prisma.expense.findFirst({
          where: { tenantId, id: page.cursor },
          select: { id: true },
        }))?.id ?? null
      : null;
    const data = await prisma.expense.findMany({
      where: { tenantId },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: page.limit,
      ...(cursorId ? { cursor: { id: cursorId }, skip: 1 } : {}),
    });
    return NextResponse.json(
      toSnakeCase({ data, nextCursor: nextCursorOf(data, page.limit) })
    );
  }

  const expenses = await prisma.expense.findMany({
    where: { tenantId },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json(toSnakeCase(expenses));
});

export const POST = withAuth(async (req, { tenantId, session }) => {
  const denied = await requirePermission(session, "expenses", "create");
  if (denied) return denied;
  const body = await validateBody(req, expenseSchema);
  if (isValidationError(body)) return body;
  const expense = await prisma.expense.create({
    data: {
      tenantId,
      name: body.name,
      amount: body.amount || 0,
      date: new Date(body.date),
      notes: body.notes || null,
    },
  });
  return NextResponse.json(toSnakeCase(expense));
});
