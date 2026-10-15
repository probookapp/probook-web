import { NextResponse } from "next/server";
import { withAuth } from "@/lib/api-utils";
import { prisma } from "@/lib/db";
import { validateBody, isValidationError } from "@/lib/validate";
import {
  applyTablePreference,
  parseTablePreferences,
  tablePreferenceUpdateSchema,
} from "@/lib/table-preferences";

/**
 * The signed-in user's column choices, list by list.
 *
 * During impersonation the session's userId is the platform admin's, which
 * matches no User: reads answer empty and writes are dropped, so staff looking
 * at a customer's account never rearrange that customer's lists.
 */
export const GET = withAuth(async (_req, { session }) => {
  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: { tablePreferences: true },
  });
  return NextResponse.json(parseTablePreferences(user?.tablePreferences));
});

export const PUT = withAuth(async (req, { session }) => {
  const body = await validateBody(req, tablePreferenceUpdateSchema);
  if (isValidationError(body)) return body;

  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: { tablePreferences: true },
  });
  if (!user) return NextResponse.json({});

  const next = applyTablePreference(parseTablePreferences(user.tablePreferences), body);
  await prisma.user.update({
    where: { id: session.userId },
    data: { tablePreferences: next },
  });
  return NextResponse.json(next);
});
