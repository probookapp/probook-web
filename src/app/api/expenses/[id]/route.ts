import { NextResponse } from "next/server";
import { withAuth, toSnakeCase } from "@/lib/api-utils";
import { prisma } from "@/lib/db";
import { validateBody, isValidationError } from "@/lib/validate";
import { expenseSchema } from "@/lib/validations";
import { requirePermission } from "@/lib/permissions-server";

export const GET = withAuth(async (req, { tenantId, session, params }) => {
  const denied = await requirePermission(session, "expenses", "view");
  if (denied) return denied;
  const expense = await prisma.expense.findFirst({ where: { tenantId, id: params?.id } });
  if (!expense) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(toSnakeCase(expense));
});

export const PUT = withAuth(async (req, { tenantId, params, session }) => {
  const denied = await requirePermission(session, "expenses", "edit");
  if (denied) return denied;
  const body = await validateBody(req, expenseSchema);
  if (isValidationError(body)) return body;
  const expense = await prisma.expense.update({
    where: { tenantId, id: params?.id },
    data: {
      name: body.name,
      amount: body.amount || 0,
      date: new Date(body.date),
      notes: body.notes || null,
    },
  });
  return NextResponse.json(toSnakeCase(expense));
});

export const DELETE = withAuth(async (req, { tenantId, params, session }) => {
  const denied = await requirePermission(session, "expenses", "delete");
  if (denied) return denied;
  await prisma.expense.delete({ where: { tenantId, id: params?.id } });
  return new NextResponse(null, { status: 204 });
});
