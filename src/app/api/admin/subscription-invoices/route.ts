import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { toSnakeCase } from "@/lib/api-utils";
import { withPlatformAdmin } from "@/lib/admin-api-utils";

export const GET = withPlatformAdmin(async (req) => {
  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status");

  const where = status ? { status } : {};

  const invoices = await prisma.subscriptionInvoice.findMany({
    where,
    include: {
      subscription: {
        include: {
          plan: { select: { id: true, name: true, slug: true } },
          tenant: { select: { id: true, name: true, slug: true } },
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(toSnakeCase(invoices));
});
