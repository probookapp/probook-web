import { NextResponse } from "next/server";
import { withAuth } from "@/lib/api-utils";
import { prisma } from "@/lib/db";
import { validateBody, isValidationError } from "@/lib/validate";
import { parseToursCompleted, tourCompleteSchema } from "@/lib/tours";

/**
 * Marks a guided tour as seen for the signed-in person, so it does not start
 * on its own again (it can still be replayed from the help button).
 *
 * During impersonation the session's userId is the platform admin's, which
 * matches no User: the write is dropped, so staff replaying a tour in a
 * customer's account never change what that customer sees.
 */
export const POST = withAuth(async (req, { session }) => {
  const body = await validateBody(req, tourCompleteSchema);
  if (isValidationError(body)) return body;

  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: { toursCompleted: true },
  });
  if (!user) return NextResponse.json({ tours_completed: [] });

  const current = parseToursCompleted(user.toursCompleted);
  if (current.includes(body.tour)) return NextResponse.json({ tours_completed: current });

  const next = parseToursCompleted([...current, body.tour]);
  await prisma.user.update({
    where: { id: session.userId },
    data: { toursCompleted: next },
  });
  return NextResponse.json({ tours_completed: next });
});
