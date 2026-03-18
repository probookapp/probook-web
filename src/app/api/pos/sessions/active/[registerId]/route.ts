import { NextResponse } from "next/server";
import { withAuth, toSnakeCase } from "@/lib/api-utils";
import { prisma } from "@/lib/db";

export const GET = withAuth(async (req, { tenantId, params }) => {
  const session = await prisma.posSession.findFirst({
    where: { tenantId, registerId: params?.registerId, status: "OPEN" },
    include: { register: true, user: true },
  });
  return NextResponse.json(toSnakeCase(session));
});
