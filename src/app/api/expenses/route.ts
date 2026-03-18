import { NextResponse } from "next/server";
import { withAuth, toSnakeCase } from "@/lib/api-utils";
import { prisma } from "@/lib/db";
import { validateBody, isValidationError } from "@/lib/validate";
import { expenseSchema } from "@/lib/validations";

export const GET = withAuth(async (req, { tenantId }) => {
  const expenses = await prisma.expense.findMany({
    where: { tenantId },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json(toSnakeCase(expenses));
});

export const POST = withAuth(async (req, { tenantId }) => {
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
