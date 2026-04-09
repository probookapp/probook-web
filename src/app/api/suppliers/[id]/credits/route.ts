import { NextResponse } from "next/server";
import { withAuth, toSnakeCase } from "@/lib/api-utils";
import { prisma } from "@/lib/db";

export const GET = withAuth(async (req, { tenantId, params }) => {
  const supplier = await prisma.supplier.findFirst({
    where: { tenantId, id: params?.id },
  });
  if (!supplier) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const unpaidOrders = await prisma.purchaseOrder.findMany({
    where: {
      tenantId,
      supplierId: params?.id,
      status: "CONFIRMED",
      paymentStatus: { not: "PAID" },
    },
    include: { lines: { include: { product: true, variant: true } } },
  });

  const totalOwed = unpaidOrders.reduce((sum, o) => sum + o.total, 0);

  const payments = await prisma.supplierPayment.aggregate({
    where: { tenantId, supplierId: params?.id },
    _sum: { amount: true },
  });
  const totalPaid = payments._sum.amount || 0;

  const balance = totalOwed - totalPaid;

  return NextResponse.json(
    toSnakeCase({
      supplierId: params?.id,
      supplierName: supplier.name,
      totalOwed,
      totalPaid,
      balance,
      unpaidOrders,
    })
  );
});
