import { NextResponse } from "next/server";
import { withAuth, toSnakeCase } from "@/lib/api-utils";
import { prisma } from "@/lib/db";

export const GET = withAuth(async (req, { tenantId }) => {
  const { searchParams } = new URL(req.url);
  const q = searchParams.get("query") || searchParams.get("q") || "";

  const contacts = await prisma.clientContact.findMany({
    where: {
      tenantId,
      OR: [
        { name: { contains: q, mode: "insensitive" } },
        { email: { contains: q, mode: "insensitive" } },
        { phone: { contains: q, mode: "insensitive" } },
      ],
    },
    include: { client: true },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(toSnakeCase(contacts));
});
