import { NextResponse } from "next/server";
import { withAuth, toSnakeCase } from "@/lib/api-utils";
import { prisma } from "@/lib/db";

export const GET = withAuth(async (req, { tenantId, params }) => {
  const transactions = await prisma.posTransaction.findMany({
    where: { tenantId, sessionId: params?.sessionId },
    include: { lines: true, payments: true, client: true },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json(toSnakeCase(transactions));
});
