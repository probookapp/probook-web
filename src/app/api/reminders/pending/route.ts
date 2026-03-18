import { NextResponse } from "next/server";
import { withAuth, toSnakeCase } from "@/lib/api-utils";
import { prisma } from "@/lib/db";

export const GET = withAuth(async (req, { tenantId }) => {
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
