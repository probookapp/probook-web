import { NextResponse } from "next/server";
import { withAuth, toSnakeCase } from "@/lib/api-utils";
import { prisma } from "@/lib/db";

export const POST = withAuth(async (req, { tenantId, params }) => {
  const quote = await prisma.quote.findFirst({ where: { tenantId, id: params?.quoteId } });
  if (!quote) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const updated = await prisma.quote.update({
    where: { tenantId, id: params?.quoteId },
    data: { status: "EXPIRED" },
  });

  return NextResponse.json(toSnakeCase(updated));
});
