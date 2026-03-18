import { NextResponse } from "next/server";
import { withAuth, toSnakeCase } from "@/lib/api-utils";
import { prisma } from "@/lib/db";
import { validateBody, isValidationError } from "@/lib/validate";
import { categorySchema } from "@/lib/validations";

export const GET = withAuth(async (req, { tenantId, params }) => {
  const category = await prisma.productCategory.findFirst({
    where: { tenantId, id: params?.id },
    include: { parent: true, children: true, products: true },
  });
  if (!category) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(toSnakeCase(category));
});

export const PUT = withAuth(async (req, { tenantId, params }) => {
  const body = await validateBody(req, categorySchema);
  if (isValidationError(body)) return body;
  const category = await prisma.productCategory.update({
    where: { tenantId, id: params?.id },
    data: {
      name: body.name,
      description: body.description || null,
      parentId: body.parent_id || null,
    },
  });
  return NextResponse.json(toSnakeCase(category));
});

export const DELETE = withAuth(async (req, { tenantId, params }) => {
  await prisma.productCategory.delete({ where: { tenantId, id: params?.id } });
  return new NextResponse(null, { status: 204 });
});
