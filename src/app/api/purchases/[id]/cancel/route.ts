import { NextResponse } from "next/server";
import { withAuth, toSnakeCase } from "@/lib/api-utils";
import { prisma } from "@/lib/db";

export const POST = withAuth(async (req, { tenantId, params }) => {
  const order = await prisma.purchaseOrder.findFirst({
    where: { tenantId, id: params?.id },
  });
  if (!order) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (order.status !== "PENDING") {
    return NextResponse.json({ error: "Only PENDING orders can be cancelled" }, { status: 400 });
  }

  const updated = await prisma.purchaseOrder.update({
    where: { tenantId, id: params?.id },
    data: { status: "CANCELLED" },
    include: {
      supplier: true,
      lines: { include: { product: true, variant: true } },
    },
  });

  return NextResponse.json(toSnakeCase(updated));
});
