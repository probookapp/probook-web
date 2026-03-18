import { NextResponse } from "next/server";
import { withAuth, toSnakeCase } from "@/lib/api-utils";
import { prisma } from "@/lib/db";

export const GET = withAuth(async (req, { tenantId, params }) => {
  const movements = await prisma.posCashMovement.findMany({
    where: { tenantId, sessionId: params?.sessionId },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json(toSnakeCase(movements));
});
