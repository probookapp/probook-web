import { NextResponse } from "next/server";
import { withAuth, toSnakeCase } from "@/lib/api-utils";
import { prisma } from "@/lib/db";

export const GET = withAuth(async (req, { tenantId, params }) => {
  const reminders = await prisma.reminder.findMany({
    where: {
      tenantId,
      documentType: params?.documentType,
      documentId: params?.documentId,
    },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json(toSnakeCase(reminders));
});
