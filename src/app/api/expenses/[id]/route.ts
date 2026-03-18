import { NextResponse } from "next/server";
import { withAuth, toSnakeCase } from "@/lib/api-utils";
import { prisma } from "@/lib/db";
import { validateBody, isValidationError } from "@/lib/validate";
import { expenseSchema } from "@/lib/validations";

export const GET = withAuth(async (req, { tenantId, params }) => {
  const expense = await prisma.expense.findFirst({ where: { tenantId, id: params?.id } });
  if (!expense) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(toSnakeCase(expense));
});

export const PUT = withAuth(async (req, { tenantId, params }) => {
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

export const DELETE = withAuth(async (req, { tenantId, params }) => {
  await prisma.expense.delete({ where: { tenantId, id: params?.id } });
  return new NextResponse(null, { status: 204 });
});
