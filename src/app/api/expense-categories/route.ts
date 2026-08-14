import { NextResponse } from "next/server";
import { withAuth, toSnakeCase } from "@/lib/api-utils";
import { prisma } from "@/lib/db";
import { validateBody, isValidationError } from "@/lib/validate";
import { expenseCategorySchema } from "@/lib/validations";
import { requirePermission } from "@/lib/permissions-server";
import { normalizeCategoryName } from "@/lib/expense-categories";

/**
 * Expense headings (fuel, rent, salaries…). Created on demand by the expense
 * form, listed here so it can offer what the tenant already uses, and managed
 * from the expenses page.
 *
 * There is no pagination: a business that needs more headings than fit in one
 * response has a bookkeeping problem, not a paging one.
 */
export const GET = withAuth(async (req, { tenantId, session }) => {
  const denied = await requirePermission(session, "expenses", "view");
  if (denied) return denied;

  const categories = await prisma.expenseCategory.findMany({
    where: { tenantId },
    orderBy: { name: "asc" },
    include: { _count: { select: { expenses: true } } },
  });

  return NextResponse.json(
    toSnakeCase(
      categories.map((c) => ({
        id: c.id,
        name: c.name,
        // So the management list can warn before removing a heading in use.
        expenseCount: c._count.expenses,
        createdAt: c.createdAt,
        updatedAt: c.updatedAt,
      }))
    )
  );
});

export const POST = withAuth(async (req, { tenantId, session }) => {
  const denied = await requirePermission(session, "expenses", "create");
  if (denied) return denied;
  const body = await validateBody(req, expenseCategorySchema);
  if (isValidationError(body)) return body;

  const name = normalizeCategoryName(body.name);
  if (!name) {
    return NextResponse.json({ error: "Name is required" }, { status: 400 });
  }

  // Idempotent: asking twice for the same heading returns the same one rather
  // than a unique-constraint 500.
  const category = await prisma.expenseCategory.upsert({
    where: { tenantId_name: { tenantId, name } },
    update: {},
    create: { tenantId, name },
  });

  return NextResponse.json(toSnakeCase({ ...category, expenseCount: 0 }));
});
