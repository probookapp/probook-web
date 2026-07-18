import { NextResponse } from "next/server";
import { withAuth, toSnakeCase } from "@/lib/api-utils";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/permissions-server";

export const GET = withAuth(async (req, { tenantId, session, params }) => {
  const denied = await requirePermission(session, "invoices", "view");
  if (denied) return denied;
  const payments = await prisma.payment.findMany({
    where: { tenantId, invoiceId: params?.invoiceId },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json(toSnakeCase(payments));
});
