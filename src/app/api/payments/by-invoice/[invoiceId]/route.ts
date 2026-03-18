import { NextResponse } from "next/server";
import { withAuth, toSnakeCase } from "@/lib/api-utils";
import { prisma } from "@/lib/db";

export const GET = withAuth(async (req, { tenantId, params }) => {
  const payments = await prisma.payment.findMany({
    where: { tenantId, invoiceId: params?.invoiceId },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json(toSnakeCase(payments));
});
