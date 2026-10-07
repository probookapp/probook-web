import { NextResponse } from "next/server";
import { withAuth, toSnakeCase } from "@/lib/api-utils";
import { requirePermission } from "@/lib/permissions-server";
import { prisma } from "@/lib/db";
import { num } from "@/lib/money";

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

  // A pack reports as the pack, as in the sales report: its header carries the
  // revenue its components add up to, and its cost is theirs. The components
  // are not counted a second time.
  const packCosts = (lines: ReadonlyArray<{ bundleKey: string | null; isBundleHeader: boolean; quantity: number; costPriceSnapshot: Parameters<typeof num>[0] }>) => {
    const costs = new Map<string, number>();
    for (const l of lines) {
      if (!l.bundleKey || l.isBundleHeader) continue;
      costs.set(l.bundleKey, (costs.get(l.bundleKey) ?? 0) + l.quantity * num(l.costPriceSnapshot));
    }
    return costs;
  };

  for (const inv of invoices) {
    const costs = packCosts(inv.lines);
    for (const line of inv.lines) {
      if (line.isSubtotalLine) continue;
      if (line.bundleKey && !line.isBundleHeader) continue;
      const key = line.productId || line.description;
      bump(
        key,
        line.product?.designation || line.description,
        line.quantity,
        num(line.subtotal),
        line.isBundleHeader ? costs.get(line.bundleKey ?? "") ?? 0 : line.quantity * num(line.costPriceSnapshot)
      );
    }
  }

  for (const tx of transactions) {
    const costs = packCosts(tx.lines);
    for (const line of tx.lines) {
      if (line.bundleKey && !line.isBundleHeader) continue;
      const key = line.productId || line.designation;
      bump(
        key,
        line.product?.designation || line.designation,
        line.quantity,
        num(line.subtotal),
        line.isBundleHeader ? costs.get(line.bundleKey ?? "") ?? 0 : line.quantity * num(line.costPriceSnapshot)
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
