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

  const dateFilter: { issueDate?: { gte: Date; lt: Date } } = {};
  if (startDate && endDate) {
    dateFilter.issueDate = {
      gte: new Date(startDate),
      lt: new Date(new Date(endDate).getTime() + 86400000),
    };
  }

  const invoices = await prisma.invoice.findMany({
    where: { tenantId, status: { in: ["PAID", "ISSUED"] }, ...dateFilter },
    include: { lines: { include: { product: true } } },
  });
  const lines = invoices.flatMap((inv) => inv.lines);

  const byProduct: Record<string, {
    productId: string;
    productName: string;
    quantitySold: number;
    revenueBeforeTax: number;
    revenueTotal: number;
  }> = {};

  for (const line of lines) {
    if (line.isSubtotalLine) continue;
    const key = line.productId || line.description;
    if (!byProduct[key]) {
      byProduct[key] = {
        productId: line.productId || key,
        productName: line.product?.designation || line.description,
        quantitySold: 0,
        revenueBeforeTax: 0,
        revenueTotal: 0,
      };
    }
    byProduct[key].quantitySold += line.quantity;
    byProduct[key].revenueBeforeTax += num(line.subtotal);
    byProduct[key].revenueTotal += num(line.total);
  }

  const result = Object.values(byProduct).sort((a, b) => b.revenueBeforeTax - a.revenueBeforeTax);
  return NextResponse.json(toSnakeCase(result));
});
