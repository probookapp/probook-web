import { NextResponse } from "next/server";
import { withAuth, toSnakeCase } from "@/lib/api-utils";
import { prisma } from "@/lib/db";

export const GET = withAuth(async (req, { tenantId, params }) => {
  const contacts = await prisma.clientContact.findMany({
    where: { tenantId, clientId: params?.clientId },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json(toSnakeCase(contacts));
});
