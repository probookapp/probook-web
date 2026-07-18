import { NextResponse } from "next/server";
import { withAuth, toSnakeCase } from "@/lib/api-utils";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/permissions-server";

export const GET = withAuth(async (req, { tenantId, session }) => {
  // The reminders widget is a dashboard feature.
  const denied = await requirePermission(session, "dashboard", "view");
  if (denied) return denied;
  const reminders = await prisma.reminder.findMany({
    where: {
      tenantId,
      sentAt: null,
      scheduledDate: { lte: new Date() },
    },
    orderBy: { scheduledDate: "asc" },
  });
  return NextResponse.json(toSnakeCase(reminders));
});
