import { prisma } from "@/lib/db";
import { normalizeCategoryName } from "@/lib/expense-categories";

/**
 * Turn what an expense form sent into a category id, creating the heading if it
 * is new to this tenant.
 *
 * The form offers suggestions and free text through one field, so it sends a
 * name and lets the server decide. Doing it here rather than client-side keeps
 * it to a single request and lets the (tenant, name) unique index settle races:
 * two expenses filed under a brand-new heading at the same time end up on the
 * same category instead of creating two.
 *
 * Returns `undefined` when the caller said nothing about the category (so an
 * update leaves it untouched) and `null` when it explicitly cleared it.
 */
export async function resolveExpenseCategoryId(
  tenantId: string,
  input: { category_id?: string | null; category_name?: string | null }
): Promise<string | null | undefined> {
  const rawName = input.category_name;
  if (rawName !== undefined && rawName !== null) {
    const name = normalizeCategoryName(rawName);
    if (!name) return null; // cleared the field
    const category = await prisma.expenseCategory.upsert({
      where: { tenantId_name: { tenantId, name } },
      update: {},
      create: { tenantId, name },
    });
    return category.id;
  }

  if (input.category_id !== undefined) {
    if (!input.category_id) return null;
    // Never trust an id from the client: it could belong to another tenant.
    const owned = await prisma.expenseCategory.findFirst({
      where: { tenantId, id: input.category_id },
      select: { id: true },
    });
    return owned?.id ?? null;
  }

  return undefined;
}
