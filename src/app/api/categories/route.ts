import { NextResponse } from "next/server";
import { withAuth, toSnakeCase } from "@/lib/api-utils";
import { prisma } from "@/lib/db";
import { validateBody, isValidationError } from "@/lib/validate";
import { categorySchema } from "@/lib/validations";

export const GET = withAuth(async (req, { tenantId }) => {
  const categories = await prisma.productCategory.findMany({
    where: { tenantId },
    orderBy: { createdAt: "desc" },
    include: { parent: true, children: true },
  });
  return NextResponse.json(toSnakeCase(categories));
});

export const POST = withAuth(async (req, { tenantId }) => {
  const body = await validateBody(req, categorySchema);
  if (isValidationError(body)) return body;
  const category = await prisma.productCategory.create({
    data: {
      tenantId,
      name: body.name,
      description: body.description || null,
      parentId: body.parent_id || null,
    },
  });
  return NextResponse.json(toSnakeCase(category));
});
