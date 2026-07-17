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
          // Default to current year
          const year = new Date().getFullYear();
          return { gte: new Date(year, 0, 1), lt: new Date(year + 1, 0, 1) };
        })();

  // Issued invoices (PAID/ISSUED) within the range
  const invoices = await prisma.invoice.findMany({
    where: {
      tenantId,
      status: { in: ["PAID", "ISSUED"] },
      issueDate: dateFilter,
    },
    include: { lines: { include: { product: true } } },
  });

  // Non-cancelled POS transactions within the range
  const transactions = await prisma.posTransaction.findMany({
    where: {
      tenantId,
      status: { not: "CANCELLED" },
      transactionDate: dateFilter,
    },
    include: { lines: { include: { product: true } } },
  });

  const byProduct: Record<
    string,
    {
      productId: string;
      productName: string;
      quantitySold: number;
      revenue: number; // excl. VAT
      cost: number;
      margin: number;
      marginPercent: number;
    }
  > = {};

  const bump = (key: string, name: string, qty: number, revenue: number, cost: number) => {
    if (!byProduct[key]) {
      byProduct[key] = {
        productId: key,
        productName: name,
        quantitySold: 0,
        revenue: 0,
        cost: 0,
        margin: 0,
        marginPercent: 0,
      };
    }
    byProduct[key].quantitySold += qty;
    byProduct[key].revenue += revenue;
    byProduct[key].cost += cost;
  };

  for (const inv of invoices) {
    for (const line of inv.lines) {
      if (line.isSubtotalLine) continue;
      const key = line.productId || line.description;
      bump(
        key,
        line.product?.designation || line.description,
        line.quantity,
        line.subtotal,
        line.quantity * line.costPriceSnapshot
      );
    }
  }

  for (const tx of transactions) {
    for (const line of tx.lines) {
      const key = line.productId || line.designation;
      bump(
        key,
        line.product?.designation || line.designation,
        line.quantity,
        line.subtotal,
        line.quantity * line.costPriceSnapshot
      );
    }
  }

  const result = Object.values(byProduct)
    .map((r) => {
      const margin = r.revenue - r.cost;
      return {
        ...r,
        margin,
        marginPercent: r.revenue !== 0 ? (margin / r.revenue) * 100 : 0,
      };
    })
    .sort((a, b) => b.margin - a.margin);

  return NextResponse.json(toSnakeCase(result));
});
