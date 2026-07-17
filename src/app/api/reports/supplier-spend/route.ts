import { NextResponse } from "next/server";
import { withAuth, toSnakeCase } from "@/lib/api-utils";
import { requirePermission } from "@/lib/permissions-server";
import { prisma } from "@/lib/db";

export const GET = withAuth(async (req, { tenantId, session }) => {
  const denied = await requirePermission(session, "reports", "view");
  if (denied) return denied;
  const { searchParams } = new URL(req.url);
  const startDate = searchParams.get("startDate");
  const endDate = searchParams.get("endDate");

  const dateFilter: { gte: Date; lt: Date } =
    startDate && endDate
      ? {
          gte: new Date(startDate),
          lt: new Date(new Date(endDate).getTime() + 86400000), // include end date
        }
      : (() => {
          const year = new Date().getFullYear();
          return { gte: new Date(year, 0, 1), lt: new Date(year + 1, 0, 1) };
        })();

  // Committed purchase orders: confirmed / partially-received, or fully paid.
  const orders = await prisma.purchaseOrder.findMany({
    where: {
      tenantId,
      orderDate: dateFilter,
      OR: [
        { status: { in: ["CONFIRMED", "PARTIALLY_RECEIVED"] } },
        { paymentStatus: "PAID" },
      ],
    },
    include: { supplier: true },
  });

  const bySupplier: Record<
    string,
    {
      supplierId: string;
      supplierName: string;
      orderCount: number;
      totalSpend: number;
    }
  > = {};

  for (const order of orders) {
    const key = order.supplierId;
    if (!bySupplier[key]) {
      bySupplier[key] = {
        supplierId: key,
        supplierName: order.supplier?.name || key,
        orderCount: 0,
        totalSpend: 0,
      };
    }
    bySupplier[key].orderCount += 1;
    bySupplier[key].totalSpend += order.total;
  }

  const result = Object.values(bySupplier).sort((a, b) => b.totalSpend - a.totalSpend);
  return NextResponse.json(toSnakeCase(result));
});
