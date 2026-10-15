import { NextResponse } from "next/server";
import { withPlatformAdmin } from "@/lib/admin-api-utils";
import { prisma } from "@/lib/db";
import { validateBody, isValidationError } from "@/lib/validate";
import {
  applyTablePreference,
  parseTablePreferences,
  tablePreferenceUpdateSchema,
} from "@/lib/table-preferences";

/** The platform admin's column choices — same contract as /api/auth/table-preferences.
 * Not under /api/admin/auth/: that prefix carries the login rate limit. */
export const GET = withPlatformAdmin(async (_req, { adminId }) => {
  const admin = await prisma.platformAdmin.findUnique({
    where: { id: adminId },
    select: { tablePreferences: true },
  });
  return NextResponse.json(parseTablePreferences(admin?.tablePreferences));
});

export const PUT = withPlatformAdmin(async (req, { adminId }) => {
  const body = await validateBody(req, tablePreferenceUpdateSchema);
  if (isValidationError(body)) return body;

  const admin = await prisma.platformAdmin.findUnique({
    where: { id: adminId },
    select: { tablePreferences: true },
  });
  const next = applyTablePreference(parseTablePreferences(admin?.tablePreferences), body);
  await prisma.platformAdmin.update({
    where: { id: adminId },
    data: { tablePreferences: next },
  });
  return NextResponse.json(next);
});
