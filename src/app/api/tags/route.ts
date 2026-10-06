import { NextResponse } from "next/server";
import { withAuth, toSnakeCase } from "@/lib/api-utils";
import { prisma } from "@/lib/db";
import { Prisma } from "@/generated/prisma/client";
import { validateBody, isValidationError } from "@/lib/validate";
import { tagSchema } from "@/lib/validations";
import { requirePermission } from "@/lib/permissions-server";

/**
 * The labels a business invents for itself.
 *
 * Deliberately not statuses: `quotes.status` is a state machine the expiry
 * sweep, the relance alerts, the conversion to an invoice and the
 * conversion-rate report all read, so a document parked in an invented state
 * falls out of all four without a word. Tags classify on a second axis, the
 * way `archived_at` already does.
 *
 * Writing a tag is a quote-level right, not an admin one: the people who write
 * the quotes are the people who know what to call them.
 */
export const GET = withAuth(async (req, { tenantId }) => {
  const tags = await prisma.tag.findMany({
    where: { tenantId },
    orderBy: { name: "asc" },
  });
  return NextResponse.json(toSnakeCase(tags));
});

function isUniqueViolation(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002";
}

export const POST = withAuth(async (req, { tenantId, session }) => {
  const denied = await requirePermission(session, "quotes", "edit");
  if (denied) return denied;
  const body = await validateBody(req, tagSchema);
  if (isValidationError(body)) return body;

  // Case is folded here rather than in the index: Postgres has no
  // case-insensitive unique index without a functional one, and "Prioritaire"
  // next to "prioritaire" in a filter row is two labels the user believes are
  // one. Returning the existing tag also makes a lost-response retry harmless.
  const existing = await prisma.tag.findFirst({
    where: { tenantId, name: { equals: body.name, mode: "insensitive" } },
  });
  if (existing) return NextResponse.json(toSnakeCase(existing));

  try {
    const tag = await prisma.tag.create({
      data: { tenantId, name: body.name, color: body.color },
    });
    return NextResponse.json(toSnakeCase(tag));
  } catch (err) {
    // Two people naming the same label at the same moment: the loser gets the
    // row the winner created, never a 500 and never a duplicate.
    if (!isUniqueViolation(err)) throw err;
    const raced = await prisma.tag.findFirst({
      where: { tenantId, name: { equals: body.name, mode: "insensitive" } },
    });
    if (raced) return NextResponse.json(toSnakeCase(raced));
    throw err;
  }
});
