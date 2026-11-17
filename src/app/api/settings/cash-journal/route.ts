import { NextResponse } from "next/server";
import { z } from "zod";
import { withAuth, toSnakeCase } from "@/lib/api-utils";
import { requirePermission } from "@/lib/permissions-server";
import { prisma } from "@/lib/db";
import { validateBody, isValidationError } from "@/lib/validate";

/**
 * The cash journal's starting point: the day the business begins following its
 * money here, and what it held that day in cash, in cheques not yet banked and
 * at the bank. Set once, corrected if it was wrong; see src/lib/cash-journal.ts.
 *
 * Its own route rather than a field of the settings form: it is set from the
 * journal itself, by whoever may change the settings.
 */
const openingSchema = z.object({
  start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Start date must be YYYY-MM-DD"),
  // A bank account can be overdrawn: only cash and cheques cannot be negative.
  cash: z.coerce.number().min(0),
  cheque: z.coerce.number().min(0),
  bank: z.coerce.number(),
});

export const PUT = withAuth(async (req, { tenantId, session }) => {
  const denied = await requirePermission(session, "settings", "edit");
  if (denied) return denied;
  const body = await validateBody(req, openingSchema);
  if (isValidationError(body)) return body;

  const data = {
    cashJournalStart: new Date(body.start),
    openingCash: body.cash,
    openingCheques: body.cheque,
    openingBank: body.bank,
  };
  const settings = await prisma.companySettings.upsert({
    where: { tenantId },
    update: data,
    create: { tenantId, ...data },
    select: { cashJournalStart: true, openingCash: true, openingCheques: true, openingBank: true },
  });
  return NextResponse.json(toSnakeCase(settings));
});
