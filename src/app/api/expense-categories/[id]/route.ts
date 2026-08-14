import { NextResponse } from "next/server";
import { withAuth, toSnakeCase } from "@/lib/api-utils";
import { prisma } from "@/lib/db";
import { validateBody, isValidationError } from "@/lib/validate";
import { expenseCategorySchema } from "@/lib/validations";
import { requirePermission } from "@/lib/permissions-server";
import { normalizeCategoryName } from "@/lib/expense-categories";

export const PUT = withAuth(async (req, { tenantId, params, session }) => {
  const denied = await requirePermission(session, "expenses", "edit");
  if (denied) return denied;
  const body = await validateBody(req, expenseCategorySchema);
  if (isValidationError(body)) return body;

  const name = normalizeCategoryName(body.name);
  if (!name) {
    return NextResponse.json({ error: "Name is required" }, { status: 400 });
  }

  const existing = await prisma.expenseCategory.findFirst({
    where: { tenantId, id: params?.id },
    select: { id: true },
  });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Renaming onto a heading that already exists would violate the unique index;
  // say so plainly instead of returning a 500.
  const clash = await prisma.expenseCategory.findFirst({
    where: { tenantId, name, NOT: { id: existing.id } },
    select: { id: true },
  });
  if (clash) {
    return NextResponse.json({ error: "A category with this name already exists" }, { status: 409 });
  }

  const category = await prisma.expenseCategory.update({
    where: { id: existing.id },
    data: { name },
  });
  return NextResponse.json(toSnakeCase(category));
});

export const DELETE = withAuth(async (req, { tenantId, params, session }) => {
  const denied = await requirePermission(session, "expenses", "delete");
  if (denied) return denied;

  const existing = await prisma.expenseCategory.findFirst({
    where: { tenantId, id: params?.id },
    select: { id: true },
  });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // The FK is ON DELETE SET NULL: removing a heading files its expenses back
  // under "no category". Spending is never deleted along with its label.
  await prisma.expenseCategory.delete({ where: { id: existing.id } });
  return new NextResponse(null, { status: 204 });
});
