import { NextResponse } from "next/server";
import { withAuth, toSnakeCase } from "@/lib/api-utils";
import { prisma } from "@/lib/db";

export const POST = withAuth(async (req, { tenantId, params }) => {
  const body = await req.json().catch(() => ({} as { reason?: string }));
  const transaction = await prisma.posTransaction.findFirst({
    where: { tenantId, id: params?.id },
    include: { lines: true },
  });
  if (!transaction) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (transaction.status === "CANCELLED") {
    return NextResponse.json({ error: "Already cancelled" }, { status: 400 });
  }

  // Restore stock
  for (const line of transaction.lines) {
    if (line.productId) {
      await prisma.product.update({
        where: { tenantId, id: line.productId },
        data: { quantity: { increment: line.quantity } },
      });
    }
  }

  const updated = await prisma.posTransaction.update({
    where: { tenantId, id: params?.id },
    data: {
      status: "CANCELLED",
      notes: body.reason ? `Cancelled: ${body.reason}` : "Cancelled",
    },
  });
  return NextResponse.json(toSnakeCase(updated));
});
