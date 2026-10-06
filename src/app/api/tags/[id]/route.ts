import { NextResponse } from "next/server";
import { withAuth, toSnakeCase } from "@/lib/api-utils";
import { prisma } from "@/lib/db";
import { Prisma } from "@/generated/prisma/client";
import { validateBody, isValidationError } from "@/lib/validate";
import { tagSchema } from "@/lib/validations";
import { requirePermission } from "@/lib/permissions-server";

export const PUT = withAuth(async (req, { tenantId, params, session }) => {
  const denied = await requirePermission(session, "quotes", "edit");
  if (denied) return denied;
  const body = await validateBody(req, tagSchema);
  if (isValidationError(body)) return body;

  // Scoped find before the update: `update` on a composite where would
  // otherwise let a crafted id reach another tenant's row.
  const tag = await prisma.tag.findFirst({ where: { tenantId, id: params?.id } });
  if (!tag) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const clash = await prisma.tag.findFirst({
    where: {
      tenantId,
      id: { not: tag.id },
      name: { equals: body.name, mode: "insensitive" },
    },
  });
  if (clash) {
    return NextResponse.json({ error: "A tag with that name already exists" }, { status: 409 });
  }

  try {
    const updated = await prisma.tag.update({
      where: { id: tag.id },
      data: { name: body.name, color: body.color },
    });
    return NextResponse.json(toSnakeCase(updated));
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return NextResponse.json({ error: "A tag with that name already exists" }, { status: 409 });
    }
    throw err;
  }
});

/**
 * Retire a label.
 *
 * It leaves the documents that wore it (the join cascades) and changes nothing
 * about them: a tag never carried a figure, a date or an obligation. This is
 * why tags are safe to delete where a status would not be.
 */
export const DELETE = withAuth(async (req, { tenantId, params, session }) => {
  const denied = await requirePermission(session, "quotes", "edit");
  if (denied) return denied;
  const tag = await prisma.tag.findFirst({ where: { tenantId, id: params?.id } });
  if (!tag) return NextResponse.json({ error: "Not found" }, { status: 404 });
  await prisma.tag.delete({ where: { id: tag.id } });
  return new NextResponse(null, { status: 204 });
});
