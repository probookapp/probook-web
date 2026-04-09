import { NextResponse } from "next/server";
import { withAuth, toSnakeCase } from "@/lib/api-utils";
import { prisma } from "@/lib/db";

export const GET = withAuth(async (req, { tenantId, params }) => {
  const supplier = await prisma.supplier.findFirst({
    where: { tenantId, id: params?.id },
  });
  if (!supplier) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // All confirmed orders (regardless of payment status) = total ever owed
  const allConfirmedOrders = await prisma.purchaseOrder.findMany({
    where: {
      tenantId,
      supplierId: params?.id,
      status: "CONFIRMED",
    },
    include: { lines: { include: { product: true, variant: true } } },
  });

  const totalOwed = allConfirmedOrders.reduce((sum, o) => sum + o.total, 0);

  // All payments ever made to this supplier
  const payments = await prisma.supplierPayment.aggregate({
    where: { tenantId, supplierId: params?.id },
    _sum: { amount: true },
  });
  const totalPaid = payments._sum.amount || 0;

  const balance = totalOwed - totalPaid;

  // Only return orders that still have outstanding balance for the UI list
  const unpaidOrders = allConfirmedOrders.filter(
    (o) => o.paymentStatus !== "PAID"
  );

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
