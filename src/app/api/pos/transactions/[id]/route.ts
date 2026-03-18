import { NextResponse } from "next/server";
import { withAuth, toSnakeCase } from "@/lib/api-utils";
import { prisma } from "@/lib/db";

export const GET = withAuth(async (req, { tenantId, params }) => {
  const transaction = await prisma.posTransaction.findFirst({
    where: { tenantId, id: params?.id },
    include: { lines: true, payments: true, client: true },
  });
  if (!transaction) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json(toSnakeCase(transaction));
});
