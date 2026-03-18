import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { toSnakeCase } from "@/lib/api-utils";
import { withPlatformAdmin } from "@/lib/admin-api-utils";

export const GET = withPlatformAdmin(async (_req, ctx) => {
  const id = ctx.params?.id;
  const invoice = await prisma.subscriptionInvoice.findUnique({
    where: { id },
    include: {
      subscription: {
        include: {
          plan: { select: { id: true, name: true, slug: true } },
          tenant: { select: { id: true, name: true, slug: true } },
        },
      },
    },
  });
  if (!invoice) {
    return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
  }
  return NextResponse.json(toSnakeCase(invoice));
});
