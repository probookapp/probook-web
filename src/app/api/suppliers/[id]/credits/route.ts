import { NextResponse } from "next/server";
import { withAuth, toSnakeCase } from "@/lib/api-utils";
import { prisma } from "@/lib/db";
import { num } from "@/lib/money";
import { PAYABLE_PURCHASE_STATUSES } from "@/lib/purchase-status";
import { getOrderSettled, getSupplierBalances } from "@/lib/supplier-account";

// GET /api/suppliers/[id]/credits: the supplier's account at a glance.
// balance > 0 is what the business owes, balance < 0 is credit the supplier
// holds for it (see src/lib/supplier-account.ts).
export const GET = withAuth(async (req, { tenantId, params }) => {
  const supplierId = params?.id as string;
  const supplier = await prisma.supplier.findFirst({
    where: { tenantId, id: supplierId },
  });
  if (!supplier) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const [orders, adjustments, payments, returns, balances] = await Promise.all([
    // Every order whose goods have arrived, whatever its payment status.
    // Part-delivered orders count: the stock is on the shelf.
    prisma.purchaseOrder.findMany({
      where: { tenantId, supplierId, status: { in: [...PAYABLE_PURCHASE_STATUSES] } },
      orderBy: { orderDate: "desc" },
      select: {
        id: true,
        orderNumber: true,
        orderDate: true,
        status: true,
        paymentStatus: true,
        total: true,
      },
    }),
    prisma.supplierAdjustment.aggregate({ where: { tenantId, supplierId }, _sum: { amount: true } }),
    prisma.supplierPayment.aggregate({ where: { tenantId, supplierId }, _sum: { amount: true } }),
    prisma.supplierReturn.aggregate({ where: { tenantId, supplierId }, _sum: { total: true } }),
    getSupplierBalances(prisma, tenantId, [supplierId]),
  ]);

  const totalOwed = orders.reduce((sum, o) => sum + num(o.total), 0);
  const unpaid = orders.filter((o) => o.paymentStatus !== "PAID");
  const settled = await getOrderSettled(prisma, tenantId, unpaid.map((o) => o.id));
  const unpaidOrders = unpaid.map((o) => {
    const amountSettled = settled.get(o.id) ?? 0;
    return {
      ...o,
      amountSettled,
      remaining: Math.max(0, num(o.total) - amountSettled),
    };
  });

  return NextResponse.json(
    toSnakeCase({
      supplierId,
      supplierName: supplier.name,
      openingBalance: num(supplier.openingBalance),
      totalOwed,
      totalAdjustments: num(adjustments._sum.amount),
      totalPaid: num(payments._sum.amount),
      totalReturned: num(returns._sum.total),
      balance: balances.get(supplierId) ?? 0,
      unpaidOrders,
    })
  );
});
