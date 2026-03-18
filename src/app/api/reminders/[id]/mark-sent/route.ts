import { NextResponse } from "next/server";
import { withAuth, toSnakeCase } from "@/lib/api-utils";
import { prisma } from "@/lib/db";

export const POST = withAuth(async (req, { tenantId, params }) => {
  const reminder = await prisma.reminder.update({
    where: { tenantId, id: params?.id },
    data: { sentAt: new Date() },
  });
  return NextResponse.json(toSnakeCase(reminder));
});
